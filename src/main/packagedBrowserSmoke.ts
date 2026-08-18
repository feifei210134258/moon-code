import { mkdtemp, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, webContents } from 'electron'
import { KimiBrowserManager } from './browser/KimiBrowserManager.js'
import type { KimiRuntimeManager } from './runtime/KimiRuntimeManager.js'

const MARKER = 'KIMI_PACKAGED_BROWSER_OK'

export async function runPackagedBrowserSmoke(timeoutMs = 15_000): Promise<void> {
  process.stderr.write('browser-smoke:start\n')
  const root = await mkdtemp(join(tmpdir(), 'kimi-browser-smoke-'))
  const echo = await createEchoServer()
  await writeFile(join(root, 'index.html'), `<!doctype html>
    <meta charset="utf-8"><title>Browser Smoke</title><style>body{min-height:1200px}</style><h1>Browser Smoke</h1>
    <script>
      document.title = location.href
      console.log('NODE_GLOBALS_' + typeof process + '_' + typeof require)
      console.log('access_token=supersecret')
      console.log('LOCATION_' + location.href)
      console.log('HOST_' + location.hostname)
      console.log('CAPABILITY_' + location.hostname.split('.')[0])
      console.log('POPUP_' + String(window.open('https://example.com')))
      fetch('/data.json?token=network-secret', { headers: { 'x-api-key': 'header-secret' } })
        .then((response) => response.json()).then((value) => console.log('FETCH_' + value.ok))
      fetch('${echo.origin}/echo', { headers: { 'x-preview-location': location.href } })
        .then((response) => response.text()).then((value) => console.log('ECHO_' + value))
    </script>`)
  await writeFile(join(root, 'data.json'), JSON.stringify({ ok: true }))

  const runtime = {
    createRestClient: () => ({
      getSessionSnapshot: async () => ({
        session: {
          workspace_id: 'browser-smoke-workspace',
          metadata: { cwd: root }
        }
      })
    })
  } as unknown as KimiRuntimeManager
  const window = new BrowserWindow({ show: false, width: 900, height: 700 })
  const browser = new KimiBrowserManager(runtime, () => window)
  try {
    process.stderr.write('browser-smoke:open\n')
    browser.setBounds({ x: 0, y: 0, width: 800, height: 600 })
    await browser.openHtml('browser-smoke-session', 'index.html')
    process.stderr.write('browser-smoke:loaded\n')
    await waitFor(() => {
      const state = browser.state
      return state.consoleEntries.some((entry) => entry.text.includes('NODE_GLOBALS_undefined_undefined'))
        && state.consoleEntries.some((entry) => entry.text.includes('POPUP_null'))
        && state.consoleEntries.some((entry) => entry.text.includes('FETCH_true'))
        && state.consoleEntries.some((entry) => entry.text.includes('ECHO_preview://browser-smoke-workspace/'))
        && state.networkEntries.some((entry) => entry.url.includes('/data.json') && entry.status === 200)
        && state.networkEntries.some((entry) => entry.url === `${echo.origin}/echo` && entry.status === 200)
    }, timeoutMs).catch((error: unknown) => {
      process.stderr.write(`browser-smoke:state:${JSON.stringify(browser.state)}\n`)
      throw error
    })
    process.stderr.write('browser-smoke:diagnostics\n')

    const state = browser.state
    if (!state.url.startsWith('preview://browser-smoke-workspace/')) {
      throw new Error(`Preview capability leaked or friendly URL was not projected: ${state.url}`)
    }
    if (state.consoleEntries.some((entry) => /[a-f0-9]{48}\.[a-f0-9]{16}\.localhost/.test(entry.source))) {
      throw new Error('Preview capability leaked through Browser Console')
    }
    const serializedState = JSON.stringify(state)
    const actualPreviewUrl = echo.lastValue()
    if (actualPreviewUrl === null) throw new Error('Echo server did not observe the preview URL')
    if (/[a-f0-9]{48}/i.test(actualPreviewUrl)) throw new Error('Preview capability remained visible to page JavaScript')
    if (/[a-f0-9]{48}/i.test(serializedState)) throw new Error('Preview capability leaked through serialized Browser state')
    if (serializedState.includes('supersecret')) throw new Error('Browser Console secret redaction failed')
    if (serializedState.includes('network-secret')) throw new Error('Browser Network URL redaction failed')
    const dataRequest = state.networkEntries.find((entry) => entry.url.includes('/data.json'))
    if (dataRequest === undefined || !dataRequest.url.includes('%5Bredacted%5D')) {
      throw new Error('Browser Network URL was not redacted')
    }
    const details = await browser.getNetworkDetails(dataRequest.requestId)
    const apiKey = Object.entries(details.requestHeaders).find(([key]) => key.toLowerCase() === 'x-api-key')?.[1]
    const previewCapability = Object.entries(details.requestHeaders)
      .find(([key]) => key.toLowerCase() === 'x-kimi-preview-capability')?.[1]
    if (
      apiKey !== '[redacted]' ||
      (previewCapability !== undefined && previewCapability !== '[redacted]') ||
      /[a-f0-9]{48}/i.test(JSON.stringify(details)) ||
      !details.body?.includes('"ok":true')
    ) {
      throw new Error('Browser Network detail was not safely projected')
    }
    const echoRequest = state.networkEntries.find((entry) => entry.url === `${echo.origin}/echo` && entry.status === 200)
    if (echoRequest === undefined) throw new Error('Browser echo request was not projected')
    const echoDetails = await browser.getNetworkDetails(echoRequest.requestId)
    if (/[a-f0-9]{48}/i.test(JSON.stringify(echoDetails))) {
      throw new Error('Preview capability leaked through Browser Network headers or body')
    }
    const guest = webContents.getAllWebContents().find((contents) => (
      contents !== window.webContents && /\.localhost(?::\d+)?\//.test(contents.getURL())
    ))
    if (guest === undefined) throw new Error('Browser guest WebContents was not found for element pick smoke')
    const pickPromise = browser.pickElements()
    await delay(100)
    await guest.executeJavaScript(`(() => {
      const target = document.elementFromPoint(45, 40)
      if (!target) throw new Error('element pick smoke target missing')
      target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, composed: true, clientX: 45, clientY: 40 }))
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, clientX: 45, clientY: 40 }))
    })()`)
    const picked = await withTimeout(pickPromise, 3_000, 'Element pick timed out')
    if (
      picked.cancelled ||
      picked.elements.length !== 1 ||
      picked.elements[0]!.tag !== 'h1' ||
      picked.elements[0]!.selector.length === 0 ||
      !picked.elements[0]!.pageUrl.startsWith('preview://browser-smoke-workspace/')
    ) {
      throw new Error(`Browser element pick was not safely projected: ${JSON.stringify(picked)}`)
    }

    await browser.cancelElementPick()
    const cancelPromise = browser.pickElements()
    await delay(100)
    await browser.cancelElementPick()
    const cancelled = await withTimeout(cancelPromise, 3_000, 'Element pick cancel timed out')
    if (!cancelled.cancelled || cancelled.elements.length !== 0) {
      throw new Error(`Browser element pick cancel was not projected: ${JSON.stringify(cancelled)}`)
    }
    await browser.navigate('file:///etc/passwd').then(
      () => { throw new Error('Unsafe file navigation was accepted') },
      () => undefined
    )
  } finally {
    process.stderr.write('browser-smoke:close\n')
    await withTimeout(browser.close(), 3_000, 'Browser close timed out')
    await closeServer(echo.server)
    if (!window.isDestroyed()) window.destroy()
  }
}

async function createEchoServer(): Promise<{ server: Server; origin: string; lastValue: () => string | null }> {
  let lastValue: string | null = null
  const server = createServer((request, response) => {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('access-control-allow-headers', 'x-preview-location')
    response.setHeader('access-control-expose-headers', 'x-echo-location')
    if (request.method === 'OPTIONS') {
      response.statusCode = 204
      response.end()
      return
    }
    lastValue = typeof request.headers['x-preview-location'] === 'string'
      ? request.headers['x-preview-location']
      : null
    if (lastValue !== null) response.setHeader('x-echo-location', lastValue)
    response.setHeader('content-type', 'text/plain; charset=utf-8')
    response.end(lastValue ?? '')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Echo server did not expose a port')
  return { server, origin: `http://127.0.0.1:${address.port}`, lastValue: () => lastValue }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error))
    server.closeAllConnections()
  })
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for packaged Browser diagnostics')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    operation,
    new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(message)), timeoutMs))
  ])
}

export { MARKER as PACKAGED_BROWSER_SMOKE_MARKER }
