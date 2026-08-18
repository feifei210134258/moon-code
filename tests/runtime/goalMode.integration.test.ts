import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { KimiRestClient } from '../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import { resolveManagedKimiEntry } from '../../src/main/runtime/discovery.js'
import { parseRuntimeReadyOutput } from '../../src/main/runtime/readyLine.js'

const runIntegration = process.env.KIMI_GOAL_RUNTIME_INTEGRATION === '1'
type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>

const children: RuntimeChild[] = []
const servers: Server[] = []

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }))
})

describe.skipIf(!runIntegration)('Kimi 0.31.0 goal/swarm Runtime behavior', () => {
  it('creates, reads, pauses, resumes and cancels a goal through the desktop adapter path', async () => {
    const fake = await startFakeModelServer()
    const runtime = await startIsolatedRuntime(fake.origin)
    const session = await createSession(runtime)

    // 先跑一轮普通 prompt：全新会话的主 Agent 尚未解析模型，
    // 目标续跑（resume 带 continueIfPaused）会因 "LLM not set" 立即自动暂停。
    await runtime.client.submitPrompt(session.id, {
      content: [{ type: 'text', text: '预热会话' }],
      model: 'fake/primary',
      thinking: 'off',
      permissionMode: 'auto',
      planMode: false,
      swarmMode: false
    })
    await waitFor(async () => !(await runtime.client.getSessionStatus(session.id)).busy, 15_000)

    expect(await runtime.client.getSessionGoal(session.id)).toBeNull()

    await runtime.client.updateSessionGoalObjective(session.id, '验证目标模式生命周期')
    const created = await runtime.client.getSessionGoal(session.id)
    expect(created?.objective).toBe('验证目标模式生命周期')
    expect(created?.status).toBe('active')

    await runtime.client.updateSessionGoal(session.id, 'pause')
    expect((await runtime.client.getSessionGoal(session.id))?.status).toBe('paused')

    await runtime.client.updateSessionGoal(session.id, 'resume')
    await waitFor(async () => (await runtime.client.getSessionGoal(session.id))?.status === 'active', 5_000)

    await runtime.client.updateSessionGoal(session.id, 'cancel')
    expect(await runtime.client.getSessionGoal(session.id)).toBeNull()
  }, 30_000)

  it('auto-pauses a resumed goal continuation on a session that never ran a turn', async () => {
    const fake = await startFakeModelServer()
    const runtime = await startIsolatedRuntime(fake.origin)
    const session = await createSession(runtime)

    await runtime.client.updateSessionGoalObjective(session.id, '全新会话直接恢复目标')
    await runtime.client.updateSessionGoal(session.id, 'pause')
    await runtime.client.updateSessionGoal(session.id, 'resume')

    // profile 级 resume 带 continueIfPaused，会立即启动续跑轮；
    // 全新会话主 Agent 尚未解析模型，续跑失败，目标自动暂停并记录原因。
    await waitFor(async () => (await runtime.client.getSessionGoal(session.id))?.status === 'paused', 5_000)
    const goal = await runtime.client.getSessionGoal(session.id)
    expect(goal?.terminalReason ?? '').toMatch(/model configuration|LLM/i)
  }, 30_000)

  it('rejects a second goal_objective while a goal exists', async () => {
    const fake = await startFakeModelServer()
    const runtime = await startIsolatedRuntime(fake.origin)
    const session = await createSession(runtime)

    await runtime.client.updateSessionGoalObjective(session.id, '第一个目标')
    await expect(runtime.client.updateSessionGoalObjective(session.id, '第二个目标'))
      .rejects.toThrow(/already/i)
  }, 30_000)

  it('reflects profile-level swarm_mode writes in GET /status', async () => {
    const fake = await startFakeModelServer()
    const runtime = await startIsolatedRuntime(fake.origin)
    const session = await createSession(runtime)

    expect((await runtime.client.getSessionStatus(session.id)).swarm_mode).toBe(false)

    await writeProfileSwarmMode(runtime, session.id, true)
    expect((await runtime.client.getSessionStatus(session.id)).swarm_mode).toBe(true)

    await writeProfileSwarmMode(runtime, session.id, false)
    expect((await runtime.client.getSessionStatus(session.id)).swarm_mode).toBe(false)
  }, 30_000)

  it('drives additional model turns after the first prompt when a goal is active', async () => {
    const fake = await startFakeModelServer()
    const runtime = await startIsolatedRuntime(fake.origin)
    const session = await createSession(runtime)

    await runtime.client.updateSessionGoalObjective(session.id, '持续验证目标驱动')
    await runtime.client.submitPrompt(session.id, {
      content: [{ type: 'text', text: '开始执行目标' }],
      model: 'fake/primary',
      thinking: 'off',
      permissionMode: 'auto',
      planMode: false,
      swarmMode: false
    })

    // 目标驱动器应在首轮结束后继续发起新的模型请求（无额外用户输入）
    await waitFor(async () => fake.requestCount >= 2, 20_000)
    await runtime.client.updateSessionGoal(session.id, 'cancel')
  }, 30_000)
})

interface FakeModelServer {
  origin: string
  requestCount: number
}

async function startFakeModelServer(): Promise<FakeModelServer> {
  const state: FakeModelServer = { origin: '', requestCount: 0 }
  const server = createServer((request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end()
      return
    }
    state.requestCount += 1
    void (async () => {
      const body = JSON.parse(await readRequestBody(request)) as Record<string, unknown>
      const model = typeof body.model === 'string' ? body.model : 'fake'
      sendAssistantContent(response, body, model)
    })()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  state.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return state
}

interface IsolatedRuntime {
  child: RuntimeChild
  client: KimiRestClient
  origin: string
  token: string
  workspaceRoot: string
}

async function startIsolatedRuntime(providerOrigin: string): Promise<IsolatedRuntime> {
  const home = await mkdtemp(join(tmpdir(), 'moon-code-goal-runtime-'))
  const workspaceRoot = join(home, 'workspace')
  await mkdir(workspaceRoot, { recursive: true })
  await writeFile(join(home, 'config.toml'), runtimeConfig(providerOrigin), { mode: 0o600 })
  const child = spawn(process.execPath, [
    resolveManagedKimiEntry(),
    'web',
    '--port',
    '0',
    '--no-open',
    '--log-level',
    'error'
  ], {
    env: { ...process.env, KIMI_CODE_HOME: home, NO_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)
  const ready = await waitForRuntimeReady(child)
  const client = new KimiRestClient({ origin: ready.origin, token: ready.token })
  const meta = await client.getMeta()
  expect(meta.server_version).toBe('0.36.0')
  expect(meta.backend).toBe('v2')
  return { child, client, origin: ready.origin, token: ready.token, workspaceRoot }
}

async function createSession(runtime: IsolatedRuntime) {
  const workspace = await runtime.client.addWorkspace({ root: runtime.workspaceRoot })
  return await runtime.client.createSession({ workspaceId: workspace.id, model: 'fake/primary' })
}

async function writeProfileSwarmMode(
  runtime: IsolatedRuntime,
  sessionId: string,
  enabled: boolean
): Promise<void> {
  const response = await fetch(
    `${runtime.origin}/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${runtime.token}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ agent_config: { swarm_mode: enabled } })
    }
  )
  if (!response.ok) throw new Error(`profile swarm_mode write failed with HTTP ${response.status}`)
}

async function stopRuntime(runtime: IsolatedRuntime): Promise<void> {
  if (runtime.child.exitCode !== null) return
  await runtime.client.shutdown().catch(() => runtime.child.kill('SIGTERM'))
  await Promise.race([
    once(runtime.child, 'exit'),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000))
  ])
  if (runtime.child.exitCode === null) runtime.child.kill('SIGTERM')
}

function runtimeConfig(providerOrigin: string): string {
  return `default_model = "fake/primary"
default_permission_mode = "auto"
telemetry = false

[providers.fake]
type = "openai"
base_url = "${providerOrigin}/v1"
api_key = "integration-test-only"

[models."fake/primary"]
provider = "fake"
model = "primary-upstream"
max_context_size = 32768
capabilities = ["tool_use", "thinking"]
support_efforts = ["low", "high"]
default_effort = "low"
`
}

async function waitForRuntimeReady(child: RuntimeChild): Promise<{ origin: string; token: string }> {
  return await new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => reject(new Error(`Kimi Runtime startup timed out: ${output}`)), 15_000)
    const inspect = (chunk: Buffer): void => {
      output = `${output}${chunk.toString('utf8')}`.slice(-32_768)
      const ready = parseRuntimeReadyOutput(output)
      if (ready === null) return
      clearTimeout(timer)
      resolve({ origin: ready.origin, token: ready.token })
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      reject(new Error(`Kimi Runtime exited before ready (${signal ?? code ?? 'unknown'}): ${output}`))
    })
  })
}

function sendAssistantContent(
  response: ServerResponse,
  request: Record<string, unknown>,
  model: string
): void {
  const id = `chatcmpl-${Date.now().toString(16)}`
  const message = { role: 'assistant', content: '本轮输出完毕。' }
  if (request.stream !== true) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
    }))
    return
  }
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive'
  })
  const base = { id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model }
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: message, finish_reason: null }] })}\n\n`)
  response.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`)
  response.write(`data: ${JSON.stringify({ ...base, choices: [], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}

async function readRequestBody(request: import('node:http').IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) body += Buffer.from(chunk as Uint8Array).toString('utf8')
  return body
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Condition did not become true within ${timeoutMs}ms`)
}
