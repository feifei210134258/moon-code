import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  shell,
  WebContentsView,
  type BrowserWindow,
  type WebContents
} from 'electron'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  BrowserBounds,
  BrowserConsoleEntry,
  BrowserElementPickResult,
  BrowserNetworkDetails,
  BrowserNetworkEntry,
  BrowserViewState,
  BrowserViewport
} from '../../shared/contracts.js'
import { isAllowedBrowserNavigation } from '../security/browserInputs.js'
import { registerGuestSessionGuards } from './guestSessionGuards.js'
import { PreviewCapabilitySanitizer } from './PreviewCapabilitySanitizer.js'
import { WorkspacePreviewServer } from './WorkspacePreviewServer.js'
import { ELEMENT_PICK_WORLD_ID, elementPickScript } from './elementPickScript.js'
import { sanitizePickedElements } from './elementPickSanitize.js'

const MAX_CONSOLE_ENTRIES = 300
const MAX_NETWORK_ENTRIES = 300
const MAX_TEXT = 4_000
const MAX_BODY_BYTES = 256 * 1024

interface NetworkRecord {
  entry: BrowserNetworkEntry
  startedAt: number
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
}

export class KimiBrowserManager extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #getMainWindow: () => BrowserWindow | null
  readonly #preview = new WorkspacePreviewServer()
  readonly #network = new Map<string, NetworkRecord>()
  readonly #previewSanitizer = new PreviewCapabilitySanitizer()
  #view: WebContentsView | null = null
  #guestCleanup: (() => void) | null = null
  #scope = 'unscoped'
  #viewScope: string | null = null
  #guestGeneration = 0
  #attachedWindow: BrowserWindow | null = null
  #bounds: BrowserBounds | null = null
  #pickInProgress = false
  #emitTimer: NodeJS.Timeout | null = null
  #operation: Promise<void> = Promise.resolve()
  #closing = false
  #consoleId = 0
  #activeActualUrl = ''
  #state: BrowserViewState = emptyState()

  /** 预览发布根变化时刷新 guest；元素点选期间跳过，避免销毁注入上下文。 */
  readonly #reloadPreviewFromWatch = (): void => {
    if (this.#pickInProgress) return
    this.#contents()?.reload()
  }

  constructor(runtime: KimiRuntimeManager, getMainWindow: () => BrowserWindow | null) {
    super()
    this.#runtime = runtime
    this.#getMainWindow = getMainWindow
  }

  get state(): BrowserViewState {
    return cloneState(this.#state)
  }

  async openHtml(sessionId: string, path: string): Promise<BrowserViewState> {
    const generation = this.#guestGeneration
    return await this.#serialize(async () => {
      if (!/\.html?$/i.test(path)) throw new TypeError('Only HTML files can open in Browser preview')
      const snapshot = await this.#runtime.createRestClient().getSessionSnapshot(sessionId)
      const url = await this.#preview.open(snapshot.session.metadata.cwd, path)
      if (generation !== this.#guestGeneration) throw new Error('Browser workspace changed while preview was opening')
      smokeTrace('preview-ready')
      this.#previewSanitizer.register(new URL(url).origin, snapshot.session.workspace_id)
      this.#scope = snapshot.session.workspace_id
      this.#state.visible = true
      await this.#ensureView(this.#scope)
      smokeTrace('view-ready')
      this.#attachIfNeeded()
      this.#scheduleState()
      smokeTrace('visible')
      await this.#load(url)
      smokeTrace('load-complete')
      return this.state
    })
  }

  async navigate(url: string): Promise<BrowserViewState> {
    return await this.#serialize(async () => {
      this.#state.visible = true
      await this.#ensureView(this.#scope)
      this.#attachIfNeeded()
      this.#scheduleState()
      await this.#load(url)
      return this.state
    })
  }

  back(): BrowserViewState {
    const contents = this.#contents()
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack()
    this.#refreshNavigationState()
    return this.state
  }

  forward(): BrowserViewState {
    const contents = this.#contents()
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward()
    this.#refreshNavigationState()
    return this.state
  }

  reload(): BrowserViewState {
    this.#contents()?.reload()
    return this.state
  }

  stop(): BrowserViewState {
    this.#contents()?.stop()
    this.#state.loading = false
    this.#scheduleState()
    return this.state
  }

  setBounds(bounds: BrowserBounds): void {
    this.#bounds = { ...bounds }
    if (this.#view !== null && this.#contents() !== null) this.#view.setBounds(bounds)
    this.#attachIfNeeded()
    void this.#applyViewport()
  }

  async setVisible(visible: boolean): Promise<BrowserViewState> {
    return await this.#serialize(async () => {
      this.#state.visible = visible
      if (visible) {
        await this.#ensureView(this.#scope)
        this.#attachIfNeeded()
      } else {
        this.#detach()
      }
      this.#scheduleState()
      return this.state
    })
  }

  setWorkspaceScope(scope: string | null): Promise<BrowserViewState> {
    const nextScope = scope ?? 'unscoped'
    if (nextScope === this.#scope) return Promise.resolve(this.state)
    this.#scope = nextScope
    const generation = ++this.#guestGeneration
    return this.#serialize(async () => {
      if (generation !== this.#guestGeneration) return this.state
      if (this.#viewScope !== null && this.#viewScope !== nextScope) {
        this.#destroyView()
        this.#resetPageState()
      }
      if (this.#state.visible) {
        await this.#ensureView(nextScope)
        this.#attachIfNeeded()
      }
      this.#scheduleState()
      return this.state
    })
  }

  destroyGuest(): void {
    this.#guestGeneration += 1
    this.#state.visible = false
    this.#destroyView()
    this.#resetPageState()
    this.#scheduleState()
  }

  async setViewport(viewport: BrowserViewport): Promise<BrowserViewState> {
    return await this.#serialize(async () => {
      this.#state.viewport = { ...viewport }
      await this.#applyViewport()
      this.#scheduleState()
      return this.state
    })
  }

  clearConsole(): BrowserViewState {
    this.#state.consoleEntries = []
    this.#scheduleState()
    return this.state
  }

  clearNetwork(): BrowserViewState {
    this.#network.clear()
    this.#state.networkEntries = []
    this.#scheduleState()
    return this.state
  }

  async getNetworkDetails(requestId: string): Promise<BrowserNetworkDetails> {
    return await this.#serialize(async () => {
      const record = this.#network.get(requestId)
      if (record === undefined) throw new Error('Browser network request is no longer available')
      const details: BrowserNetworkDetails = {
        requestId,
        requestHeaders: { ...record.requestHeaders },
        responseHeaders: { ...record.responseHeaders },
        body: null,
        bodyTruncated: false,
        bodyUnavailableReason: null
      }
      if (record.entry.failed) {
        details.bodyUnavailableReason = record.entry.errorText ?? 'Request failed'
        return details
      }
      if ((record.entry.size ?? 0) > MAX_BODY_BYTES) {
        details.bodyUnavailableReason = `Body exceeds ${MAX_BODY_BYTES} byte preview limit`
        return details
      }
      if (!isTextMime(record.entry.mimeType)) {
        details.bodyUnavailableReason = 'Binary response body omitted'
        return details
      }
      const contents = this.#contents()
      if (contents === null || !contents.debugger.isAttached()) {
        details.bodyUnavailableReason = 'Browser diagnostics are unavailable'
        return details
      }
      try {
        const result = await contents.debugger.sendCommand('Network.getResponseBody', { requestId }) as {
          body?: unknown
          base64Encoded?: unknown
        }
        if (result.base64Encoded === true) {
          details.bodyUnavailableReason = 'Base64 response body omitted'
          return details
        }
        if (typeof result.body === 'string') {
          const sanitizedBody = this.#sanitize(result.body)
          details.body = boundedText(sanitizedBody, MAX_BODY_BYTES)
          details.bodyTruncated = sanitizedBody.length > details.body.length
        }
      } catch {
        details.bodyUnavailableReason = 'Response body is no longer available'
      }
      return details
    })
  }

  async pickElements(): Promise<BrowserElementPickResult> {
    const contents = this.#contents()
    if (contents === null || !contents.debugger.isAttached() || this.#activeActualUrl.length === 0) {
      throw new Error('Browser is not ready for element picking')
    }
    if (this.#pickInProgress) throw new Error('A Browser element pick session is already in progress')
    this.#pickInProgress = true
    try {
      let raw: unknown
      try {
        raw = await contents.executeJavaScriptInIsolatedWorld(
          ELEMENT_PICK_WORLD_ID,
          [{ code: elementPickScript(), url: 'kimi-agent://element-picker' }]
        )
      } catch (error) {
        if (this.#contents() === null || isPickSessionAborted(error)) {
          return { cancelled: true, elements: [] }
        }
        throw error
      }
      const root = asRecord(raw)
      if (raw === null || raw === undefined || root.cancelled === true) {
        return { cancelled: true, elements: [] }
      }
      const elements = sanitizePickedElements(
        root.elements,
        (value) => this.#displayUrl(value),
        (value) => this.#sanitize(value)
      )
      return { cancelled: false, elements }
    } catch (error) {
      throw new Error(this.#safeError(error))
    } finally {
      this.#pickInProgress = false
    }
  }

  async cancelElementPick(): Promise<void> {
    if (!this.#pickInProgress) return
    const contents = this.#contents()
    if (contents === null || !contents.debugger.isAttached()) return
    try {
      await contents.executeJavaScriptInIsolatedWorld(
        ELEMENT_PICK_WORLD_ID,
        [{ code: "document.dispatchEvent(new Event('kimi:element-pick-cancel', { bubbles: true }))", url: 'kimi-agent://element-picker' }]
      )
    } catch {
      // 注入上下文可能已随导航/销毁消失；在途的 pickElements() 会自行按取消处理。
    }
  }

  async openExternal(): Promise<{ opened: true }> {
    return await this.#serialize(async () => {
      // 当前活动的页面 URL 已通过 isAllowedBrowserNavigation 校验；workspace 预览
      // （http://<rootId>.localhost:<port>/...）附加会话票据，外部浏览器打开后由
      // 预览服换成 HttpOnly cookie 再跳转去参，子资源请求才能通过鉴权。
      if (!isAllowedBrowserNavigation(this.#activeActualUrl)) throw new Error('No safe Browser URL is active')
      const target = this.#preview.externalUrlFor(this.#activeActualUrl) ?? this.#activeActualUrl
      await shell.openExternal(target)
      return { opened: true }
    })
  }

  async close(): Promise<void> {
    if (this.#closing) return
    this.#closing = true
    this.#contents()?.stop()
    await Promise.race([this.#operation.catch(() => undefined), delay(2_000)])
    if (this.#emitTimer !== null) clearTimeout(this.#emitTimer)
    this.#emitTimer = null
    this.#destroyView()
    this.#previewSanitizer.clear()
    await this.#preview.close()
  }

  async #ensureView(scope: string): Promise<void> {
    if (this.#closing) throw new Error('Browser is closing')
    const existingContents = this.#view?.webContents
    if (existingContents !== undefined && !existingContents.isDestroyed() && this.#viewScope === scope) return
    if (this.#view !== null) {
      this.#destroyView()
    }
    this.#network.clear()
    this.#state.consoleEntries = []
    this.#state.networkEntries = []
    this.#viewScope = scope
    const partition = `persist:kad-browser:${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`
    const view = new WebContentsView({
      webPreferences: {
        partition,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        spellcheck: false
      }
    })
    if (view.webContents === undefined) throw new Error('Electron did not create Browser WebContents')
    this.#view = view
    if (this.#bounds !== null) view.setBounds(this.#bounds)
    this.#configureGuest(view.webContents)
    smokeTrace('guest-configured')
    this.#attachIfNeeded()
    await this.#enableDiagnostics(view.webContents)
    smokeTrace('diagnostics-enabled')
    void this.#applyViewport()
  }

  #configureGuest(contents: WebContents): void {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedBrowserNavigation(url)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAllowedBrowserNavigation(url)) event.preventDefault()
    })
    contents.on('will-frame-navigate', (event) => {
      if (!isAllowedBrowserNavigation(event.url)) event.preventDefault()
    })
    contents.on('will-attach-webview', (event) => event.preventDefault())
    this.#guestCleanup = registerGuestSessionGuards(
      contents,
      () => {
        this.#state.error = '页面下载已被安全策略阻止'
        this.#scheduleState()
      },
      (url) => this.#preview.authorizationHeadersFor(url)
    )
    contents.on('did-start-loading', () => {
      this.#state.loading = true
      this.#state.error = null
      this.#scheduleState()
    })
    contents.on('did-stop-loading', () => {
      this.#state.loading = false
      this.#refreshNavigationState()
      this.#scheduleState()
    })
    contents.on('did-navigate', (_event, url) => this.#adoptUrl(url))
    contents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) this.#adoptUrl(url)
    })
    contents.on('page-title-updated', (_event, title) => {
      this.#state.title = boundedText(this.#sanitize(title), 512)
      this.#scheduleState()
    })
    contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      this.#state.loading = false
      this.#state.error = this.#sanitize(`${boundedText(errorDescription, 300)} (${errorCode})`)
      if (isAllowedBrowserNavigation(validatedUrl)) {
        this.#activeActualUrl = validatedUrl
        this.#state.url = this.#displayUrl(validatedUrl)
      }
      this.#scheduleState()
    })
    contents.on('console-message', (details) => {
      const entry: BrowserConsoleEntry = {
        id: `console-${++this.#consoleId}`,
        level: details.level,
        text: boundedText(this.#sanitize(details.message), MAX_TEXT),
        source: this.#displayUrl(details.sourceId),
        line: details.lineNumber,
        timestamp: Date.now()
      }
      this.#state.consoleEntries = boundedAppend(this.#state.consoleEntries, entry, MAX_CONSOLE_ENTRIES)
      this.#scheduleState()
    })
  }

  #cleanupGuest(): void {
    this.#guestCleanup?.()
    this.#guestCleanup = null
  }

  #destroyView(): void {
    this.#detach()
    this.#cleanupGuest()
    const contents = this.#contents()
    if (contents !== null) {
      contents.stop()
      if (contents.debugger.isAttached()) contents.debugger.detach()
      contents.close({ waitForBeforeUnload: false })
    }
    this.#view = null
    this.#viewScope = null
    this.#network.clear()
  }

  #resetPageState(): void {
    this.#preview.watchForUrl(null, this.#reloadPreviewFromWatch)
    this.#activeActualUrl = ''
    this.#state.url = ''
    this.#state.title = ''
    this.#state.loading = false
    this.#state.canGoBack = false
    this.#state.canGoForward = false
    this.#state.consoleEntries = []
    this.#state.networkEntries = []
    this.#state.error = null
  }

  /** 跟随当前实际 URL 同步预览文件的监听（预览来源才 watch；其余 URL 停止）。 */
  #syncPreviewWatcher(): void {
    const url = this.#activeActualUrl
    this.#preview.watchForUrl(url.length === 0 ? null : url, this.#reloadPreviewFromWatch)
  }

  async #enableDiagnostics(contents: WebContents): Promise<void> {
    try {
      contents.debugger.attach('1.3')
      contents.debugger.on('message', (_event, method, params) => this.#handleDebuggerMessage(method, asRecord(params)))
      void Promise.all([
        contents.debugger.sendCommand('Network.enable', {
          maxTotalBufferSize: 4 * 1024 * 1024,
          maxResourceBufferSize: MAX_BODY_BYTES
        }),
        contents.debugger.sendCommand('Page.enable')
      ]).catch((error: unknown) => {
        this.#state.error = this.#sanitize(`Browser diagnostics unavailable: ${errorMessage(error)}`)
        this.#scheduleState()
      })
    } catch (error) {
      this.#state.error = this.#sanitize(`Browser diagnostics unavailable: ${errorMessage(error)}`)
      this.#scheduleState()
    }
  }

  #handleDebuggerMessage(method: string, params: Record<string, unknown>): void {
    if (method === 'Network.requestWillBeSent') {
      const requestId = stringValue(params.requestId)
      const request = asRecord(params.request)
      const url = stringValue(request.url)
      if (requestId === null || url === null) return
      const entry: BrowserNetworkEntry = {
        id: `network-${requestId}`,
        requestId,
        url: this.#displayUrl(url),
        method: boundedText(this.#sanitize(stringValue(request.method) ?? 'GET'), 32),
        status: null,
        type: boundedText(this.#sanitize(stringValue(params.type) ?? 'Other'), 64),
        mimeType: null,
        durationMs: null,
        size: null,
        failed: false,
        errorText: null
      }
      this.#network.set(requestId, {
        entry,
        startedAt: Date.now(),
        requestHeaders: sanitizeHeaders(request.headers, (value) => this.#sanitize(value)),
        responseHeaders: {}
      })
      this.#upsertNetwork(entry)
      return
    }
    const requestId = stringValue(params.requestId)
    if (requestId === null) return
    const record = this.#network.get(requestId)
    if (record === undefined) return
    if (method === 'Network.responseReceived') {
      const response = asRecord(params.response)
      record.entry.status = finiteNumber(response.status)
      const mimeType = stringValue(response.mimeType)
      record.entry.mimeType = mimeType === null ? null : this.#sanitize(mimeType)
      record.entry.type = boundedText(this.#sanitize(stringValue(params.type) ?? record.entry.type), 64)
      record.responseHeaders = sanitizeHeaders(response.headers, (value) => this.#sanitize(value))
      this.#upsertNetwork(record.entry)
      return
    }
    if (method === 'Network.loadingFinished') {
      record.entry.durationMs = Math.max(0, Date.now() - record.startedAt)
      record.entry.size = finiteNumber(params.encodedDataLength)
      this.#upsertNetwork(record.entry)
      return
    }
    if (method === 'Network.loadingFailed') {
      record.entry.durationMs = Math.max(0, Date.now() - record.startedAt)
      record.entry.failed = true
      record.entry.errorText = boundedText(this.#sanitize(stringValue(params.errorText) ?? 'Request failed'), 500)
      this.#upsertNetwork(record.entry)
    }
  }

  #upsertNetwork(entry: BrowserNetworkEntry): void {
    const entries = this.#state.networkEntries.filter((item) => item.requestId !== entry.requestId)
    entries.push({ ...entry })
    if (entries.length > MAX_NETWORK_ENTRIES) {
      const removed = entries.splice(0, entries.length - MAX_NETWORK_ENTRIES)
      for (const item of removed) this.#network.delete(item.requestId)
    }
    this.#state.networkEntries = entries
    this.#scheduleState()
  }

  async #load(url: string): Promise<void> {
    if (!isAllowedBrowserNavigation(url)) throw new TypeError('Invalid browser URL')
    const contents = this.#contents()
    if (contents === null) throw new Error('Browser view is unavailable')
    this.#activeActualUrl = url
    this.#state.url = this.#displayUrl(url)
    this.#state.error = null
    this.#syncPreviewWatcher()
    this.#scheduleState()
    try {
      await withTimeout(contents.loadURL(url), 20_000, 'Browser navigation timed out')
    } catch (error) {
      this.#state.error = this.#safeError(error)
      this.#scheduleState()
      throw new Error(this.#state.error)
    }
  }

  async #applyViewport(): Promise<void> {
    const contents = this.#contents()
    if (contents === null || !contents.debugger.isAttached()) return
    try {
      const viewport = this.#state.viewport
      if (viewport.mode === 'auto' || viewport.width === null || viewport.height === null) {
        await contents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
        return
      }
      const scale = Math.max(0.1, Math.min(1, (this.#bounds?.width ?? viewport.width) / viewport.width))
      await contents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.mode === 'mobile',
        screenWidth: viewport.width,
        screenHeight: viewport.height,
        scale
      })
    } catch (error) {
      this.#state.error = this.#sanitize(`Viewport emulation failed: ${errorMessage(error)}`)
      this.#scheduleState()
    }
  }

  #adoptUrl(url: string): void {
    if (isAllowedBrowserNavigation(url)) {
      this.#activeActualUrl = url
      this.#state.url = this.#displayUrl(url)
    }
    this.#syncPreviewWatcher()
    this.#refreshNavigationState()
    this.#scheduleState()
  }

  #refreshNavigationState(): void {
    const contents = this.#contents()
    this.#state.canGoBack = contents?.navigationHistory.canGoBack() ?? false
    this.#state.canGoForward = contents?.navigationHistory.canGoForward() ?? false
  }

  #attachIfNeeded(): void {
    if (!this.#state.visible || this.#view === null || this.#bounds === null) return
    const window = this.#getMainWindow()
    if (window === null || window.isDestroyed()) return
    if (this.#attachedWindow !== null && this.#attachedWindow !== window) this.#detach()
    if (this.#attachedWindow === null) {
      window.contentView.addChildView(this.#view)
      this.#attachedWindow = window
    }
    this.#view.setBounds(this.#bounds)
  }

  #detach(): void {
    if (this.#attachedWindow === null || this.#view === null) {
      this.#attachedWindow = null
      return
    }
    try {
      if (!this.#attachedWindow.isDestroyed()) this.#attachedWindow.contentView.removeChildView(this.#view)
    } catch {
      // The window may have destroyed its native view tree first.
    }
    this.#attachedWindow = null
  }

  #contents(): WebContents | null {
    const contents = this.#view?.webContents
    return contents === undefined || contents.isDestroyed() ? null : contents
  }

  #displayUrl(value: string): string {
    try {
      const url = new URL(value)
      const workspaceId = this.#previewSanitizer.workspaceForOrigin(url.origin)
      if (workspaceId !== undefined) {
        redactSensitiveSearchParams(url)
        return boundedText(`preview://${encodeURIComponent(workspaceId)}${url.pathname}${url.search}${url.hash}`, 4_000)
      }
    } catch {
      // Fall through to the generic redactor.
    }
    return this.#sanitize(redactUrl(value))
  }

  #safeError(error: unknown): string {
    return boundedText(this.#sanitize(errorMessage(error)), 1_000)
  }

  #sanitize(value: string): string {
    return this.#previewSanitizer.sanitize(redactSecrets(value))
  }

  #scheduleState(): void {
    if (this.#emitTimer !== null) return
    this.#emitTimer = setTimeout(() => {
      this.#emitTimer = null
      this.emit('state-changed', this.state)
    }, 50)
    this.#emitTimer.unref()
  }

  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closing) return Promise.reject(new Error('Browser is closing'))
    const safeOperation = async (): Promise<T> => {
      try {
        return await operation()
      } catch (error) {
        throw new Error(this.#safeError(error))
      }
    }
    const run = this.#operation.then(safeOperation, safeOperation)
    this.#operation = run.then(() => undefined, () => undefined)
    return run
  }
}

function emptyState(): BrowserViewState {
  return {
    url: '',
    title: '',
    loading: false,
    canGoBack: false,
    canGoForward: false,
    visible: false,
    viewport: { mode: 'auto', width: null, height: null, deviceScaleFactor: 1 },
    consoleEntries: [],
    networkEntries: [],
    error: null
  }
}

function cloneState(state: BrowserViewState): BrowserViewState {
  return {
    ...state,
    viewport: { ...state.viewport },
    consoleEntries: state.consoleEntries.map((entry) => ({ ...entry })),
    networkEntries: state.networkEntries.map((entry) => ({ ...entry }))
  }
}

function boundedAppend<T>(items: T[], item: T, limit: number): T[] {
  const next = [...items, item]
  return next.length <= limit ? next : next.slice(next.length - limit)
}

function sanitizeHeaders(value: unknown, sanitize: (value: string) => string): Record<string, string> {
  const headers = asRecord(value)
  const result: Record<string, string> = {}
  for (const [key, raw] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    const safeKey = boundedText(sanitize(key), 256)
    result[safeKey] = /authorization|cookie|api[-_]?key|token|secret|capability/.test(lower)
      ? '[redacted]'
      : boundedText(sanitize(String(raw)), 2_000)
  }
  return result
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    redactSensitiveSearchParams(url)
    return boundedText(url.toString(), 4_000)
  } catch {
    return boundedText(value, 4_000)
  }
}

function redactSensitiveSearchParams(url: URL): void {
  for (const key of [...url.searchParams.keys()]) {
    if (/token|key|secret|password|auth|signature|cookie/i.test(key)) url.searchParams.set(key, '[redacted]')
  }
}

function redactSecrets(value: string): string {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[redacted]')
    .replace(/\b(password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token)\b\s*[:=]\s*([^\s,;]+)/gi, '$1=[redacted]')
}

function isPickSessionAborted(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /destroyed|execution context|navigat|crashed|unresponsive|frame was removed/i.test(message)
}

function isTextMime(value: string | null): boolean {
  return value !== null && (/^text\//.test(value) || /json|javascript|xml|svg/.test(value))
}

function boundedText(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 1))}…`
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    timer.unref()
  })
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
        timer.unref()
      })
    ])
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

function smokeTrace(message: string): void {
  if (process.argv.includes('--smoke-browser')) process.stderr.write(`browser-manager:${message}\n`)
}
