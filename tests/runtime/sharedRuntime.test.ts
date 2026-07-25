import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('shared Kimi Web Runtime', () => {
  it('reuses a verified local Kimi Web Runtime without spawning a second CLI', async () => {
    const token = 'local-shared-token'
    const { origin, requests } = await startServer(token)
    const spawnImpl = vi.fn()
    const discoverRuntimes = vi.fn()
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      discoverRuntimes: discoverRuntimes as never,
      sharedOrigin: origin,
      readSharedToken: async () => token
    })

    const state = await manager.start('system')

    expect(state).toEqual(expect.objectContaining({
      status: 'running', mode: 'shared', version: '0.29.0', serverId: 'shared-server', origin
    }))
    expect(JSON.stringify(state)).not.toContain(token)
    expect(spawnImpl).not.toHaveBeenCalled()
    expect(discoverRuntimes).not.toHaveBeenCalled()

    await manager.stop()
    expect(requests.shutdown).toBe(0)
  })

  it('uses Kimi Web\'s standard port when it must start the system CLI', async () => {
    const child = new FakeChild()
    const spawnImpl = vi.fn(() => {
      queueMicrotask(() => child.emit('error', new Error('test spawn failure')))
      return child
    })
    const manager = new KimiRuntimeManager({
      spawnImpl: spawnImpl as never,
      readSharedToken: async () => null,
      discoverRuntimes: async () => ({
        supportedRange: '>=0.29.0',
        managed: { kind: 'managed', version: '0.29.0', executable: '/managed.mjs', compatible: true, reason: null },
        system: { kind: 'system', version: '0.29.0', executable: '/usr/local/bin/kimi', compatible: true, reason: null }
      })
    })

    const state = await manager.start('system')

    expect(state).toEqual(expect.objectContaining({ status: 'error', mode: 'system' }))
    expect(spawnImpl).toHaveBeenCalledWith('/usr/local/bin/kimi', [
      'web', '--port', '58627', '--no-open', '--log-level', 'error'
    ], expect.any(Object))
  })
})

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  exitCode: number | null = null

  kill(): boolean {
    this.exitCode = 0
    this.emit('exit', 0, null)
    return true
  }
}

async function startServer(token: string): Promise<{ origin: string; requests: { shutdown: number } }> {
  const requests = { shutdown: 0 }
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/healthz') {
      response.writeHead(200).end('ok')
      return
    }
    if (request.url === '/api/v1/meta') {
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401).end()
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          server_version: '0.29.0', capabilities: {}, server_id: 'shared-server',
          started_at: '2026-07-25T00:00:00.000Z', dangerous_bypass_auth: false, backend: 'v2'
        }
      }))
      return
    }
    if (request.url === '/api/v1/shutdown') {
      requests.shutdown += 1
      response.writeHead(200).end()
      return
    }
    response.writeHead(404).end()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests }
}
