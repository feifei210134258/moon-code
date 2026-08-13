import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { KimiRestClient } from '../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import { resolveManagedKimiEntry } from '../../src/main/runtime/discovery.js'
import { parseRuntimeReadyOutput } from '../../src/main/runtime/readyLine.js'

const runIntegration = process.env.KIMI_SECONDARY_RUNTIME_INTEGRATION === '1'
type RuntimeChild = ChildProcessByStdio<null, Readable, Readable>

const children: RuntimeChild[] = []
const servers: Server[] = []

interface CapturedModelRequest {
  model: string
  body: Record<string, unknown>
  lastUserText: string
  allText: string
  hasToolResult: boolean
}

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null) child.kill('SIGTERM')
  }
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }))
})

describe.skipIf(!runIntegration)('Kimi 0.31.0 secondary model Runtime behavior', () => {
  it('binds Agent to secondary by default and honors an explicit primary override', async () => {
    const fake = await startFakeOpenAiServer()
    const runtime = await startIsolatedRuntime(fake.origin, {
      KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '1',
      KIMI_SECONDARY_MODEL: 'fake/secondary',
      KIMI_SECONDARY_EFFORT: 'high'
    })

    await runScenario(runtime.client, runtime.workspaceRoot, 'SCENARIO_AGENT_DEFAULT')
    await runScenario(runtime.client, runtime.workspaceRoot, 'SCENARIO_AGENT_PRIMARY')

    const defaultChild = fake.requests.find((request) =>
      !request.hasToolResult && request.allText.includes('CHILD_TASK_MARKER default')
    )
    const primaryChild = fake.requests.find((request) =>
      !request.hasToolResult && request.allText.includes('CHILD_TASK_MARKER primary')
    )
    expect(primaryChild, JSON.stringify(fake.requests.map(({ model, lastUserText, allText, hasToolResult }) => ({
      model,
      lastUserText,
      allText: allText.slice(-300),
      hasToolResult
    })))).toBeDefined()
    expect(defaultChild?.model).toBe('secondary-upstream')
    expect(primaryChild?.model).toBe('primary-upstream')
    expect(defaultChild?.body.reasoning_effort).toBe('high')
  }, 30_000)

  it('binds every newly spawned AgentSwarm worker to secondary by default', async () => {
    const fake = await startFakeOpenAiServer()
    const runtime = await startIsolatedRuntime(fake.origin, {
      KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '1',
      KIMI_SECONDARY_MODEL: 'fake/secondary'
    })

    await runScenario(runtime.client, runtime.workspaceRoot, 'SCENARIO_SWARM')

    const swarmChildren = fake.requests.filter((request) =>
      !request.hasToolResult &&
      request.allText.includes('SWARM_CHILD') &&
      !request.lastUserText.includes('Your previous response was too brief')
    )
    expect(swarmChildren).toHaveLength(2)
    expect(swarmChildren.map((request) => request.model)).toEqual([
      'secondary-upstream',
      'secondary-upstream'
    ])
  }, 30_000)

  it('restores primary inheritance when the secondary experiment is explicitly disabled', async () => {
    const fake = await startFakeOpenAiServer()
    const runtime = await startIsolatedRuntime(fake.origin, {
      KIMI_CODE_EXPERIMENTAL_FLAG: '0',
      KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '0',
      KIMI_SECONDARY_MODEL: undefined,
      KIMI_SECONDARY_EFFORT: undefined
    })

    await runScenario(runtime.client, runtime.workspaceRoot, 'SCENARIO_AGENT_DEFAULT')

    const child = fake.requests.find((request) =>
      !request.hasToolResult && request.allText.includes('CHILD_TASK_MARKER default')
    )
    expect(child?.model).toBe('primary-upstream')
  }, 30_000)

  it('publishes authoritative Session warnings for an invalid model and effort', async () => {
    const fake = await startFakeOpenAiServer()
    const invalidModelRuntime = await startIsolatedRuntime(fake.origin, {
      KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '1',
      KIMI_SECONDARY_MODEL: 'fake/missing'
    })
    const invalidModelWarnings = await createSessionAndReadWarnings(
      invalidModelRuntime.client,
      invalidModelRuntime.workspaceRoot
    )
    expect(invalidModelWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'secondary-model-invalid', severity: 'warning' })
    ]))
    const invalidModelTranscript = await submitScenario(
      invalidModelRuntime.client,
      invalidModelRuntime.workspaceRoot,
      'SCENARIO_AGENT_DEFAULT'
    )
    expect(JSON.stringify(invalidModelTranscript.items)).toContain('KIMI_SECONDARY_MODEL')
    await stopRuntime(invalidModelRuntime)

    const invalidEffortRuntime = await startIsolatedRuntime(fake.origin, {
      KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '1',
      KIMI_SECONDARY_MODEL: 'fake/secondary',
      KIMI_SECONDARY_EFFORT: 'unsupported-effort'
    })
    const invalidEffortWarnings = await createSessionAndReadWarnings(
      invalidEffortRuntime.client,
      invalidEffortRuntime.workspaceRoot
    )
    expect(invalidEffortWarnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'secondary-model-effort-not-listed', severity: 'warning' })
    ]))
  }, 30_000)
})

async function runScenario(client: KimiRestClient, workspaceRoot: string, scenario: string): Promise<void> {
  const transcript = await submitScenario(client, workspaceRoot, scenario)
  expect(JSON.stringify(transcript.items)).toContain('CHILD_SCENARIO_COMPLETE')
}

async function submitScenario(client: KimiRestClient, workspaceRoot: string, scenario: string) {
  const workspace = await client.addWorkspace({ root: workspaceRoot })
  const session = await client.createSession({ workspaceId: workspace.id, model: 'fake/primary' })
  await client.submitPrompt(session.id, {
    content: [{ type: 'text', text: scenario }],
    model: 'fake/primary',
    thinking: 'off',
    permissionMode: 'auto',
    planMode: false,
    swarmMode: scenario === 'SCENARIO_SWARM'
  })
  try {
    await waitFor(async () => !(await client.getSessionStatus(session.id)).busy, 15_000)
  } catch (error) {
    const [status, queue, transcript, warnings] = await Promise.all([
      client.getSessionStatus(session.id),
      client.getPromptQueue(session.id),
      client.getSessionTranscript(session.id),
      client.getSessionWarnings(session.id)
    ])
    throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify({
      status, queue, transcript, warnings
    })}`)
  }
  return await client.getSessionTranscript(session.id)
}

async function createSessionAndReadWarnings(client: KimiRestClient, workspaceRoot: string) {
  const workspace = await client.addWorkspace({ root: workspaceRoot })
  const session = await client.createSession({ workspaceId: workspace.id, model: 'fake/primary' })
  await waitFor(async () => (await client.getSessionWarnings(session.id)).length > 0, 5_000)
  return await client.getSessionWarnings(session.id)
}

async function startFakeOpenAiServer(): Promise<{
  origin: string
  requests: CapturedModelRequest[]
}> {
  const requests: CapturedModelRequest[] = []
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
      response.writeHead(404).end()
      return
    }
    const body = JSON.parse(await readRequestBody(request)) as Record<string, unknown>
    const messages = Array.isArray(body.messages) ? body.messages : []
    const lastUserText = findLastUserText(messages)
    const allText = stringsIn(messages).join(' ')
    const hasToolResult = messages.some((message) => isRecord(message) && message.role === 'tool')
    const model = typeof body.model === 'string' ? body.model : ''
    requests.push({ model, body, lastUserText, allText, hasToolResult })

    if (!hasToolResult && (allText.includes('CHILD_TASK_MARKER') || allText.includes('SWARM_CHILD'))) {
      sendAssistantContent(response, body, model, [
        'Child routing verification completed successfully inside the isolated Kimi Runtime.',
        'Technical evidence: this completion was produced only after the fake OpenAI-compatible server received the subagent request, captured its exact upstream model id, and returned a deterministic streamed response.',
        'The test uses a temporary KIMI_CODE_HOME and temporary workspace, so it does not read user credentials, sessions, configuration, or paid model endpoints.',
        'No repository files were edited by the child and no external service was contacted.',
        'The parent test will compare the captured model id against the expected primary or secondary binding and will fail if routing differs.',
        'Verification marker: CHILD_SCENARIO_COMPLETE.'
      ].join(' '))
      return
    }
    if (hasToolResult) {
      sendAssistantContent(response, body, model, 'MAIN_SCENARIO_COMPLETE')
      return
    }
    if (allText.includes('SCENARIO_SWARM')) {
      sendToolCall(response, body, model, 'AgentSwarm', {
        description: 'Verify swarm routing',
        prompt_template: 'SWARM_CHILD {{item}}: return a detailed verification marker.',
        items: ['alpha', 'beta']
      })
      return
    }
    const explicitPrimary = allText.includes('SCENARIO_AGENT_PRIMARY')
    sendToolCall(response, body, model, 'Agent', {
      description: 'Verify model routing',
      prompt: `CHILD_TASK_MARKER ${explicitPrimary ? 'primary' : 'default'}: return a detailed verification marker.`,
      ...(explicitPrimary ? { model: 'primary' } : {})
    })
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests
  }
}

interface IsolatedRuntime {
  child: RuntimeChild
  client: KimiRestClient
  workspaceRoot: string
}

async function startIsolatedRuntime(
  providerOrigin: string,
  overrides: Record<string, string | undefined>
): Promise<IsolatedRuntime> {
  const home = await mkdtemp(join(tmpdir(), 'moon-code-secondary-runtime-'))
  const workspaceRoot = join(home, 'workspace')
  await mkdir(workspaceRoot, { recursive: true })
  await writeFile(join(home, 'config.toml'), runtimeConfig(providerOrigin), { mode: 0o600 })
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    KIMI_CODE_HOME: home,
    NO_COLOR: '1',
    ...overrides
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key]
  }
  const child = spawn(process.execPath, [
    resolveManagedKimiEntry(),
    'web',
    '--port',
    '0',
    '--no-open',
    '--log-level',
    'error'
  ], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  const ready = await waitForRuntimeReady(child)
  const client = new KimiRestClient({ origin: ready.origin, token: ready.token })
  const meta = await client.getMeta()
  expect(meta.server_version).toBe('0.36.0')
  expect(meta.backend).toBe('v2')
  return { child, client, workspaceRoot }
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

[models."fake/secondary"]
provider = "fake"
model = "secondary-upstream"
max_context_size = 32768
capabilities = ["tool_use", "thinking"]
support_efforts = ["low", "high"]
default_effort = "low"

[secondary_model]
model = "fake/secondary"
default_effort = "low"
`
}

async function waitForRuntimeReady(child: RuntimeChild): Promise<{
  origin: string
  token: string
}> {
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
  model: string,
  content: string
): void {
  sendCompletion(response, request, model, {
    role: 'assistant',
    content
  }, 'stop')
}

function sendToolCall(
  response: ServerResponse,
  request: Record<string, unknown>,
  model: string,
  name: string,
  args: Record<string, unknown>
): void {
  sendCompletion(response, request, model, {
    role: 'assistant',
    content: null,
    tool_calls: [{
      id: `call-${Date.now().toString(16)}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) }
    }]
  }, 'tool_calls')
}

function sendCompletion(
  response: ServerResponse,
  request: Record<string, unknown>,
  model: string,
  message: Record<string, unknown>,
  finishReason: 'stop' | 'tool_calls'
): void {
  const id = `chatcmpl-${Date.now().toString(16)}`
  if (request.stream !== true) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: finishReason }],
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
  response.write(`data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: message, finish_reason: null }]
  })}\n\n`)
  response.write(`data: ${JSON.stringify({
    ...base,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }]
  })}\n\n`)
  response.write(`data: ${JSON.stringify({
    ...base,
    choices: [],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }
  })}\n\n`)
  response.end('data: [DONE]\n\n')
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  let body = ''
  for await (const chunk of request) body += Buffer.from(chunk as Uint8Array).toString('utf8')
  return body
}

function findLastUserText(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!isRecord(message) || message.role !== 'user') continue
    return stringsIn(message.content).join(' ')
  }
  return ''
}

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (!isRecord(value)) return []
  return Object.values(value).flatMap(stringsIn)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Condition did not become true within ${timeoutMs}ms`)
}
