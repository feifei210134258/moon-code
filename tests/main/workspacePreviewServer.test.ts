import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { WorkspacePreviewServer } from '../../src/main/browser/WorkspacePreviewServer.js'

const servers: WorkspacePreviewServer[] = []
const execFileAsync = promisify(execFile)

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('WorkspacePreviewServer', () => {
  it('serves HTML and same-origin absolute assets without file URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-'))
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'index.html'), '<link rel="stylesheet" href="/styles.css"><h1>Preview</h1>')
    await writeFile(join(root, 'dist', 'styles.css'), 'h1 { color: blue; }')
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'dist/index.html')
    expect(pageUrl).toMatch(/^http:\/\/[a-f0-9]{16}\.localhost:\d+\/index\.html$/)
    await expect(fetch(pageUrl)).resolves.toEqual(expect.objectContaining({ status: 403 }))
    await expect(fetchPreview(server, pageUrl)).resolves.toEqual(expect.objectContaining({ status: 200 }))
    const origin = new URL(pageUrl).origin
    await expect((await fetchPreview(server, `${origin}/styles.css`)).text()).resolves.toContain('color: blue')
  })

  it('publishes only the selected web root and blocks dotfiles and credential-like assets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-publish-'))
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, '.env'), 'TOKEN=workspace-secret')
    await writeFile(join(root, 'package.json'), '{"private":true}')
    await writeFile(join(root, 'dist', 'index.html'), '<h1>Safe root</h1>')
    await writeFile(join(root, 'dist', 'data.json'), '{"ok":true}')
    await writeFile(join(root, 'dist', 'service-account.json'), '{"token":"secret"}')
    await writeFile(join(root, 'dist', '.env'), 'TOKEN=dist-secret')
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'dist/index.html')
    const origin = new URL(pageUrl).origin
    expect((await fetchPreview(server, `${origin}/data.json`)).status).toBe(200)
    expect((await fetchPreview(server, `${origin}/.env`)).status).toBe(403)
    expect((await fetchPreview(server, `${origin}/service-account.json`)).status).toBe(403)
    expect((await fetchPreview(server, `${origin}/package.json`)).status).toBe(404)
  })

  it('rejects invalid capabilities, traversal and symlink escapes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-root-'))
    const outside = await mkdtemp(join(tmpdir(), 'kimi-preview-outside-'))
    await writeFile(join(root, 'index.html'), '<h1>Safe</h1>')
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(join(outside, 'secret.txt'), join(root, 'escape.txt'))
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'index.html')
    const url = new URL(pageUrl)
    const escaped = await fetchPreview(server, `${url.origin}/escape.txt`)
    expect(escaped.status).toBe(403)
    const badHost = new URL(pageUrl)
    badHost.hostname = '0000000000000000.localhost'
    expect((await fetch(badHost, { headers: server.authorizationHeadersFor(pageUrl) ?? {} })).status).toBe(403)
    await expect(server.open(root, '../secret.txt')).rejects.toThrow('Invalid Kimi workspace path')
  })

  it('uses the deepest build marker and rejects sensitive canonical publication roots', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-marker-'))
    await mkdir(join(root, 'public', 'apps', 'site'), { recursive: true })
    await mkdir(join(root, 'secrets'))
    await writeFile(join(root, 'public', 'apps', 'site', 'index.html'), '<h1>Deep site</h1>')
    await writeFile(join(root, 'public', 'outside.json'), '{"outside":true}')
    await writeFile(join(root, 'secrets', 'index.html'), '<h1>Secret</h1>')
    await symlink(join(root, 'secrets'), join(root, 'site'))
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'public/apps/site/index.html')
    expect(new URL(pageUrl).pathname).toBe('/index.html')
    expect((await fetchPreview(server, `${new URL(pageUrl).origin}/outside.json`)).status).toBe(404)
    await expect(server.open(root, 'site/index.html')).rejects.toThrow('publication root is sensitive')
  })

  it.skipIf(process.platform === 'win32')('rejects publishable FIFOs without blocking for a writer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-fifo-'))
    await writeFile(join(root, 'index.html'), '<h1>FIFO guard</h1>')
    await execFileAsync('mkfifo', [join(root, 'hang.txt')])
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'index.html')
    const response = await Promise.race([
      fetchPreview(server, `${new URL(pageUrl).origin}/hang.txt`),
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error('FIFO request blocked')), 1_000))
    ])
    expect(response.status).toBe(403)
  })
})

function fetchPreview(server: WorkspacePreviewServer, url: string): Promise<Response> {
  const headers = server.authorizationHeadersFor(url)
  if (headers === null) throw new Error('Preview URL is not authorized by this server')
  return fetch(url, { headers })
}
