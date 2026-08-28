import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'
import { TowerPreferencesStore } from '../../src/main/runtime/TowerPreferencesStore.js'
import { KimiTowerBridge } from '../../src/main/kimi/KimiTowerBridge.js'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'
import { AgentProjector } from '../../packages/kimi-adapter/src/projector/AgentProjector.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }))
})

describe('KimiRuntimeManager tower experiment flag', () => {
  it('injects KIMI_CODE_EXPERIMENTAL_TOWER=1 when the preference is enabled', async () => {
    let activeChild: FakeChild | null = null
    const { origin } = await startRuntimeProtocolServer(() => activeChild?.kill())
    const spawnImpl = vi.fn((_executable: unknown, _args: unknown, options: { env: NodeJS.ProcessEnv }) => {
      const child = new FakeChild()
      activeChild = child
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(
        `Kimi server: ${origin}#token=runtime-test-token\n`
      )))
      return child
    })
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => null,
      towerPreferencesStore: { load: async () => ({ enabled: true }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: { kind: 'managed', version: '0.39.0', executable: '/managed.mjs', compatible: true, reason: null },
        system: { kind: 'system', version: '0.39.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null }
      })
    })

    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({ status: 'running' }))
    const env = spawnImpl.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv
    expect(env.KIMI_CODE_EXPERIMENTAL_TOWER).toBe('1')
    expect(manager.appliedTowerEnabled).toBe(true)

    await manager.stop()
  })

  it('disables the experiment env when the preference is off', async () => {
    let activeChild: FakeChild | null = null
    const { origin } = await startRuntimeProtocolServer(() => activeChild?.kill())
    const spawnImpl = vi.fn((_executable: unknown, _args: unknown, _options: unknown) => {
      const child = new FakeChild()
      activeChild = child
      queueMicrotask(() => child.stdout.emit('data', Buffer.from(
        `Kimi server: ${origin}#token=runtime-test-token\n`
      )))
      return child
    })
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => null,
      towerPreferencesStore: { load: async () => ({ enabled: false }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: { kind: 'managed', version: '0.39.0', executable: '/managed.mjs', compatible: true, reason: null },
        system: { kind: 'system', version: '0.39.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null }
      })
    })

    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({ status: 'running' }))
    const env = (spawnImpl.mock.calls[0]?.[2] as { env: NodeJS.ProcessEnv } | undefined)?.env
    expect(env?.KIMI_CODE_EXPERIMENTAL_TOWER).toBe('0')
    expect(manager.appliedTowerEnabled).toBe(false)

    await manager.stop()
  })
})

describe('KimiTowerBridge', () => {
  it('reports requiresRestart when the preference diverges from the applied flag', async () => {
    const runtime = new KimiRuntimeManager({ readSharedToken: async () => null })
    let stored = { enabled: true }
    const bridge = new KimiTowerBridge(runtime, {
      load: async () => ({ ...stored }),
      save: async (preference: { enabled: boolean }) => { stored = { ...preference } }
    })
    // runtime 未启动：appliedEnabled 为 null，requiresRestart 为 false（无 owned runtime 在跑）
    const initial = await bridge.getPreferenceState()
    expect(initial.appliedEnabled).toBeNull()
    expect(initial.requiresRestart).toBe(false)

    const updated = await bridge.setPreference(false)
    expect(updated.preference.enabled).toBe(false)
    expect(await bridge.getPreferenceState()).toEqual(
      expect.objectContaining({ preference: { enabled: false } })
    )
  })
})

describe('TowerPreferencesStore', () => {
  it('persists the enabled flag', async () => {
    const store = new TowerPreferencesStore('/tmp/moon-code-tower-test-preferences.json')
    await store.save({ enabled: true })
    expect(await store.load()).toEqual({ enabled: true })
    await store.save({ enabled: false })
    expect(await store.load()).toEqual({ enabled: false })
  })
})

describe('AgentProjector towerMode', () => {
  it('updates the main agent tower flag from agent.status.updated', () => {
    const projector = new AgentProjector()
    projector.seedSnapshot('session-1', {
      session: {
        id: 'session-1', workspace_id: 'ws-1', title: 'demo',
        created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
        busy: false, thinking_level: 'high', permission: 'manual',
        plan_mode: false, swarm_mode: false, tower_mode: false,
        context_tokens: 0, agent_config: {}
      },
      subagents: []
    } as never)

    const changed = projector.project(frame('session-1', 'agent.status.updated', {
      agentId: 'main', towerMode: true
    }))
    expect(changed).toBe(true)
    const main = projector.getRoster('session-1').find((agent) => agent.id === 'main')
    expect(main?.towerMode).toBe(true)

    const exited = projector.project(frame('session-1', 'agent.status.updated', {
      agentId: 'main', towerMode: false
    }))
    expect(exited).toBe(true)
    expect(projector.getRoster('session-1').find((agent) => agent.id === 'main')?.towerMode).toBe(false)
  })
})

function frame(sessionId: string, type: string, payload: Record<string, unknown>): SessionEventFrame {
  return {
    type, seq: 1, session_id: sessionId, timestamp: '2026-01-01T00:00:00.000Z', payload
  } as SessionEventFrame
}

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  exitCode: number | null = null

  kill(): boolean {
    if (this.exitCode !== null) return false
    this.exitCode = 0
    this.emit('exit', 0, null)
    return true
  }
}

async function startRuntimeProtocolServer(onShutdown: () => void): Promise<{ origin: string }> {
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/healthz') {
      response.writeHead(200).end('ok')
      return
    }
    if (request.url === '/api/v1/meta') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          server_version: '0.39.0',
          capabilities: {},
          server_id: 'tower-test',
          started_at: '2026-08-28T00:00:00.000Z',
          dangerous_bypass_auth: false,
          backend: 'v2'
        }
      }))
      return
    }
    if (request.url === '/api/v1/shutdown' && request.method === 'POST') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0, msg: 'ok', data: {}
      }))
      setTimeout(onShutdown, 10)
      return
    }
    response.writeHead(404).end()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }
}
