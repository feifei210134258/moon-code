import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiSecondaryModelPreference } from '../../src/shared/contracts.js'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }))
})

describe('KimiRuntimeManager secondary-model launch preference', () => {
  it('reloads the saved preference on restart and records the preference actually applied', async () => {
    let activeChild: FakeChild | null = null
    const { origin } = await startRuntimeProtocolServer(() => activeChild?.kill())
    let preference: KimiSecondaryModelPreference = {
      mode: 'configured', model: 'local/coder', defaultEffort: 'low'
    }
    const spawnImpl = vi.fn((_executable, _args, options) => {
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
      secondaryModelPreferencesStore: { load: async () => ({ ...preference }) },
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.2',
        managed: {
          kind: 'managed', version: '0.29.2', executable: '/managed.mjs', compatible: true, reason: null
        },
        system: {
          kind: 'system', version: '0.29.2', executable: '/usr/local/bin/kimi', compatible: true, reason: null
        }
      })
    })

    await expect(manager.start('system')).resolves.toEqual(expect.objectContaining({
      status: 'running', mode: 'system', version: '0.29.2'
    }))
    expect(spawnImpl.mock.calls[0]?.[2]).toEqual(expect.objectContaining({
      env: expect.objectContaining({
        KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL: '1',
        KIMI_SECONDARY_MODEL: 'local/coder',
        KIMI_SECONDARY_EFFORT: 'low'
      })
    }))
    expect(manager.appliedSecondaryModelPreference).toEqual(preference)
    expect(manager.appliedSecondaryModelSource).toBe('moon-code-environment')

    preference = { mode: 'disabled', model: null, defaultEffort: null }
    await expect(manager.restart()).resolves.toEqual(expect.objectContaining({
      status: 'running', mode: 'system', version: '0.29.2'
    }))
    expect(spawnImpl).toHaveBeenCalledTimes(2)
    const restartedEnv = spawnImpl.mock.calls[1]?.[2]?.env as NodeJS.ProcessEnv
    expect(restartedEnv.KIMI_CODE_EXPERIMENTAL_SECONDARY_MODEL).toBe('0')
    expect(restartedEnv.KIMI_SECONDARY_MODEL).toBeUndefined()
    expect(restartedEnv.KIMI_SECONDARY_EFFORT).toBeUndefined()
    expect(manager.appliedSecondaryModelPreference).toEqual(preference)
    expect(manager.appliedSecondaryModelSource).toBe('disabled')

    await manager.stop()
  })
})

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
          server_version: '0.29.2',
          capabilities: {},
          server_id: 'secondary-runtime-test',
          started_at: '2026-07-27T00:00:00.000Z',
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
