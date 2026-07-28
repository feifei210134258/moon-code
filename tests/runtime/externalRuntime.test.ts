import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('external protected Kimi Runtime', () => {
  it('verifies health and meta in Main without putting the bearer in public state', async () => {
    const origin = await startServer('secret-token')
    const manager = new KimiRuntimeManager()

    const state = await manager.connectExternal({ origin, token: 'secret-token' })

    expect(state).toEqual(expect.objectContaining({
      status: 'running', mode: 'external', version: '0.29.2', serverId: 'external-server', origin
    }))
    expect(JSON.stringify(state)).not.toContain('secret-token')
    await manager.stop()
  })

  it('returns a redacted connection failure for an invalid bearer', async () => {
    const origin = await startServer('secret-token')
    const manager = new KimiRuntimeManager()

    const state = await manager.connectExternal({ origin, token: 'wrong-token' })

    expect(state).toEqual(expect.objectContaining({
      status: 'error', mode: 'external', error: 'Unable to connect to the protected Kimi Runtime.'
    }))
    expect(JSON.stringify(state)).not.toContain('wrong-token')
  })
})

async function startServer(token: string): Promise<string> {
  const server = createServer((request, response) => {
    if (request.url === '/api/v1/healthz') {
      response.writeHead(200).end('ok')
      return
    }
    if (request.url === '/api/v1/meta') {
      if (request.headers.authorization !== `Bearer ${token}`) {
        response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ code: 401, msg: 'unauthorized' }))
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          server_version: '0.29.2', capabilities: {}, server_id: 'external-server',
          started_at: '2026-07-24T00:00:00.000Z', dangerous_bypass_auth: false, backend: 'v2'
        }
      }))
      return
    }
    response.writeHead(404).end()
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${port}`
}
