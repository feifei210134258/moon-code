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

  it('exchanges an external-open ticket for an HttpOnly cookie session', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-external-'))
    await writeFile(join(root, 'index.html'), '<link rel="stylesheet" href="/styles.css"><h1>External</h1>')
    await writeFile(join(root, 'styles.css'), 'h1 { color: red; }')
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, 'index.html')
    const origin = new URL(pageUrl).origin

    const externalUrl = server.externalUrlFor(pageUrl)
    expect(externalUrl).not.toBeNull()
    const ticket = new URL(externalUrl!).searchParams.get('kimi-preview-ticket')
    expect(ticket).toMatch(/^[a-f0-9]{48}$/)
    expect(ticket).toBe(server.authorizationHeadersFor(pageUrl)?.['x-kimi-preview-capability'])
    expect(server.externalUrlFor('https://example.com/')).toBeNull()
    expect(server.externalUrlFor('http://localhost:1/index.html')).toBeNull()

    // 无凭据：403
    expect((await fetch(pageUrl)).status).toBe(403)
    // 错误票据：403
    const badTicket = new URL(pageUrl)
    badTicket.searchParams.set('kimi-preview-ticket', '0'.repeat(48))
    expect((await fetch(badTicket)).status).toBe(403)

    // 正确票据：302 去参跳转 + HttpOnly cookie
    const redirect = await fetch(externalUrl!, { redirect: 'manual' })
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('location')).toBe('/index.html')
    const setCookie = redirect.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`__kimi_preview_cap=${ticket}`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=Lax')
    const cookie = setCookie.split(';')[0]!

    // cookie 会话可加载页面与子资源
    expect((await fetch(pageUrl, { headers: { cookie } })).status).toBe(200)
    await expect((await fetch(`${origin}/styles.css`, { headers: { cookie } })).text()).resolves.toContain('color: red')
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

  it('opens absolute in-workspace entry paths (kimi 0.39 display.path) and rejects outside ones', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kimi-preview-absolute-'))
    const outside = await mkdtemp(join(tmpdir(), 'kimi-preview-absolute-out-'))
    await mkdir(join(root, 'dist'))
    await writeFile(join(root, 'dist', 'index.html'), '<h1>Absolute</h1>')
    await writeFile(join(outside, 'secret.html'), '<h1>Outside</h1>')
    const server = new WorkspacePreviewServer()
    servers.push(server)

    const pageUrl = await server.open(root, join(root, 'dist', 'index.html'))
    expect(new URL(pageUrl).pathname).toBe('/index.html')
    await expect((await fetchPreview(server, pageUrl)).text()).resolves.toContain('Absolute')

    await expect(server.open(root, join(outside, 'secret.html'))).rejects.toThrow('escapes the workspace')
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

  describe('watchForUrl', () => {
    it('fires the debounced onChange callback when files inside the publish root change', async () => {
      const root = await mkdtemp(join(tmpdir(), 'kimi-preview-watch-'))
      await mkdir(join(root, 'dist'))
      await writeFile(join(root, 'dist', 'index.html'), '<h1>v1</h1>')
      const server = new WorkspacePreviewServer({ watchDebounceMs: 30 })
      servers.push(server)
      const pageUrl = await server.open(root, 'dist/index.html')

      let calls = 0
      server.watchForUrl(pageUrl, () => { calls += 1 })
      // 等递归 watch 注册时的目录回放事件落定，以下事件才是真实变更
      await settle(300)

      await writeFile(join(root, 'dist', 'index.html'), '<h1>v2</h1>')
      await waitFor(() => calls >= 1)

      // 监听持续生效：新增/再次修改均触发（同一去抖窗口内的多次事件会合并）
      await writeFile(join(root, 'dist', 'styles.css'), 'h1 { color: blue; }')
      await writeFile(join(root, 'dist', 'index.html'), '<h1>v3</h1>')
      await waitFor(() => calls >= 2)
    })

    it('ignores dotfile changes and stops watching for null or non-preview URLs', async () => {
      const root = await mkdtemp(join(tmpdir(), 'kimi-preview-watch-skip-'))
      await mkdir(join(root, 'dist'))
      await writeFile(join(root, 'dist', 'index.html'), '<h1>v1</h1>')
      const server = new WorkspacePreviewServer({ watchDebounceMs: 30 })
      servers.push(server)
      const pageUrl = await server.open(root, 'dist/index.html')

      let calls = 0
      server.watchForUrl(pageUrl, () => { calls += 1 })
      // 等递归 watch 注册时的目录回放事件落定，以下事件才是真实变更
      await settle(300)

      await writeFile(join(root, '.env'), 'TOKEN=secret')
      await writeFile(join(root, 'dist', '.build-cache.css'), 'body { opacity: 0.5; }')
      await settle(600)
      expect(calls).toBe(0)

      await writeFile(join(root, 'dist', 'index.html'), '<h1>v2</h1>')
      await waitFor(() => calls >= 1)
      const callsBeforeStop = calls

      server.watchForUrl(null, () => { calls += 1 })
      await writeFile(join(root, 'dist', 'index.html'), '<h1>v3</h1>')
      await settle(600)
      expect(calls).toBe(callsBeforeStop)

      server.watchForUrl('https://example.com/', () => { calls += 1 })
      await writeFile(join(root, 'dist', 'index.html'), '<h1>v4</h1>')
      await settle(600)
      expect(calls).toBe(callsBeforeStop)
    })
  })
})

function fetchPreview(server: WorkspacePreviewServer, url: string): Promise<Response> {
  const headers = server.authorizationHeadersFor(url)
  if (headers === null) throw new Error('Preview URL is not authorized by this server')
  return fetch(url, { headers })
}

async function waitFor(predicate: () => boolean, timeoutMs = 1_500): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 40))
  }
  throw new Error('Timed out waiting for the preview watcher callback')
}

async function settle(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
