import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'
import { KimiPetService } from '../../src/main/pet/KimiPetService.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'
import type { RuntimePublicState } from '../../src/shared/contracts.js'

class FakeSocket extends EventEmitter {
  readonly connect = vi.fn(async () => undefined)
  readonly subscribe = vi.fn(async () => undefined)
  readonly unsubscribe = vi.fn(async () => undefined)
  readonly setCursor = vi.fn()
  readonly close = vi.fn()
}

class FakeRuntime extends EventEmitter {
  state: RuntimePublicState = {
    status: 'running',
    mode: 'managed',
    version: '0.29.0',
    serverId: 'server-1',
    origin: 'http://127.0.0.1:3123',
    error: null
  }
  readonly socket = new FakeSocket()
  readonly rest = {
    listWorkspaces: vi.fn(async () => [{
      id: 'workspace-1', root: '/work', name: 'Project', created_at: '', last_opened_at: '', session_count: 1
    }]),
    listSessions: vi.fn(async () => [{
      id: 'session-1',
      workspace_id: 'workspace-1',
      title: 'Build pet',
      created_at: '',
      updated_at: '2026-07-23T08:00:00.000Z',
      busy: true,
      main_turn_active: true,
      pending_interaction: 'none' as const,
      archived: false,
      metadata: { cwd: '/work' },
      agent_config: { model: 'kimi' },
      usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 1 },
      permission_rules: [],
      message_count: 0,
      last_seq: 10
    }])
  }

  createRestClient(): typeof this.rest { return this.rest }
  createWsClient(): FakeSocket { return this.socket }
}

const services: KimiPetService[] = []

afterEach(() => {
  for (const service of services.splice(0)) service.close()
})

describe('KimiPetService', () => {
  it('subscribes active sessions and projects WS status without polling delay', async () => {
    const runtime = new FakeRuntime()
    const service = new KimiPetService(runtime as unknown as KimiRuntimeManager, {
      refreshIntervalMs: 60_000
    })
    services.push(service)
    service.start()

    await vi.waitFor(() => {
      expect(runtime.socket.connect).toHaveBeenCalledWith({
        subscriptions: ['session-1'],
        cursors: { 'session-1': { seq: 10 } }
      })
      expect(service.state.items[0]?.status).toBe('running')
    })

    runtime.socket.emit('session-event', {
      type: 'event',
      session_id: 'session-1',
      seq: 11,
      timestamp: '2026-07-23T08:01:00.000Z',
      payload: {
        type: 'event.session.work_changed',
        busy: true,
        main_turn_active: false,
        pending_interaction: 'question'
      }
    } as SessionEventFrame)

    expect(service.state.items[0]).toMatchObject({
      sessionId: 'session-1',
      status: 'waiting',
      pendingInteraction: 'question',
      backgroundActivity: true
    })
    expect(runtime.rest.listSessions).toHaveBeenCalledTimes(1)
  })

  it('keeps the real tracked set but marks it disconnected when the socket closes', async () => {
    const runtime = new FakeRuntime()
    const service = new KimiPetService(runtime as unknown as KimiRuntimeManager, {
      refreshIntervalMs: 60_000,
      reconnectBaseMs: 60_000
    })
    services.push(service)
    service.start()
    await vi.waitFor(() => expect(service.state.connected).toBe(true))

    runtime.socket.emit('close')

    expect(service.state.connected).toBe(false)
    expect(service.state.items).toHaveLength(1)
    expect(service.state.items[0]?.status).toBe('disconnected')
  })
})
