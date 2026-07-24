import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverLocalDevServers } from '../../src/main/browser/LocalDevServerDiscovery.js'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => await new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('discoverLocalDevServers', () => {
  it('finds only responsive hard-scoped loopback ports', async () => {
    const server = createServer((_request, response) => {
      response.statusCode = 200
      response.end()
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('test server has no port')

    await expect(discoverLocalDevServers([address.port, 1])).resolves.toEqual([
      `http://localhost:${address.port}/`
    ])
  })
})
