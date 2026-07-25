import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import {
  nativeImage,
  shell,
  WebContentsView,
  type BrowserWindow,
  type WebContents
} from 'electron'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  BrowserBounds,
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmission,
  BrowserAnnotationSubmitInput,
  BrowserCaptureResult,
  BrowserConsoleEntry,
  BrowserNetworkDetails,
  BrowserNetworkEntry,
  BrowserViewState,
  BrowserViewport
} from '../../shared/contracts.js'
import { isAllowedBrowserNavigation } from '../security/browserInputs.js'
import { captureSizeWithinBudget } from './captureBudget.js'
import { registerGuestSessionGuards } from './guestSessionGuards.js'
import { PreviewCapabilitySanitizer } from './PreviewCapabilitySanitizer.js'
import { WorkspacePreviewServer } from './WorkspacePreviewServer.js'
import { ANNOTATION_WORLD_ID, annotationPickScript } from './annotationScript.js'

const MAX_CONSOLE_ENTRIES = 300
const MAX_NETWORK_ENTRIES = 300
const MAX_TEXT = 4_000
const MAX_BODY_BYTES = 256 * 1024
const MAX_SCREENSHOT_BASE64 = 20 * 1024 * 1024
const MAX_ANNOTATION_DRAFTS = 20
const ANNOTATION_PADDING = 8

interface NetworkRecord {
  entry: BrowserNetworkEntry
  startedAt: number
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
}

interface RawAnnotationSelection {
  page: {
    url: string
    title: string
    viewport: { width: number; height: number; dpr: number }
  }
  scroll: { x: number; y: number }
  target: {
    kind: BrowserAnnotationMode
    selector?: string
    xpath?: string
    tag?: string
    ariaLabel?: string
    textSnippet?: string
    rect: { x: number; y: number; width: number; height: number }
  }
}

export class KimiBrowserManager extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #getMainWindow: () => BrowserWindow | null
  readonly #preview = new WorkspacePreviewServer()
  readonly #network = new Map<string, NetworkRecord>()
  readonly #annotationDrafts = new Map<string, BrowserAnnotationDraft>()
  readonly #previewSanitizer = new PreviewCapabilitySanitizer()
  #view: WebContentsView | null = null
  #guestCleanup: (() => void) | null = null
  #scope = 'unscoped'
  #viewScope: string | null = null
  #guestGeneration = 0
  #attachedWindow: BrowserWindow | null = null
  #bounds: BrowserBounds | null = null
  /* 渲染端弹层（批注编辑/截图预览）打开时置 true：原生 WebContentsView 会盖住 DOM，
     需暂时把 guest 从窗口摘下来，弹层关闭后再挂回。页面本身不销毁。 */
  #overlayOpen = false
  #emitTimer: NodeJS.Timeout | null = null
  #operation: Promise<void> = Promise.resolve()
  #closing = false
  #consoleId = 0
  #activeActualUrl = ''
  #state: BrowserViewState = emptyState()

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

  setOverlayOpen(open: boolean): void {
    if (this.#overlayOpen === open) return
    this.#overlayOpen = open
    if (open) this.#detach()
    else this.#attachIfNeeded()
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
    this.#annotationDrafts.clear()
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
    this.#overlayOpen = false
    this.#annotationDrafts.clear()
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

  async capture(fullPage: boolean): Promise<BrowserCaptureResult> {
    return await this.#serialize(async () => {
      const contents = this.#contents()
      if (contents === null || !contents.debugger.isAttached()) throw new Error('Browser is not ready')
      const metrics = await contents.debugger.sendCommand('Page.getLayoutMetrics') as {
        cssContentSize?: { width?: unknown; height?: unknown }
        contentSize?: { width?: unknown; height?: unknown }
        cssVisualViewport?: { clientWidth?: unknown; clientHeight?: unknown }
        visualViewport?: { clientWidth?: unknown; clientHeight?: unknown }
      }
      const contentSize = metrics.cssContentSize ?? metrics.contentSize
      const viewportSize = metrics.cssVisualViewport ?? metrics.visualViewport
      const measuredWidth = finiteNumber(fullPage ? contentSize?.width : viewportSize?.clientWidth)
        ?? (fullPage ? null : this.#state.viewport.width ?? this.#bounds?.width ?? null)
      const measuredHeight = finiteNumber(fullPage ? contentSize?.height : viewportSize?.clientHeight)
        ?? (fullPage ? null : this.#state.viewport.height ?? this.#bounds?.height ?? null)
      const deviceScaleFactor = this.#state.viewport.mode === 'auto'
        ? 4
        : this.#state.viewport.deviceScaleFactor
      const { width, height } = captureSizeWithinBudget(
        measuredWidth,
        measuredHeight,
        deviceScaleFactor,
        fullPage
      )

      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined
      if (fullPage) {
        clip = { x: 0, y: 0, width, height, scale: 1 }
      }
      const result = await contents.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: fullPage,
        ...(clip === undefined ? {} : { clip })
      }) as { data?: unknown }
      if (typeof result.data !== 'string' || result.data.length > MAX_SCREENSHOT_BASE64) {
        throw new Error('Browser screenshot exceeds the safe size limit')
      }
      const dataUrl = `data:image/png;base64,${result.data}`
      const size = nativeImage.createFromDataURL(dataUrl).getSize()
      return { dataUrl, width: size.width, height: size.height, fullPage }
    })
  }

  async pickAnnotation(mode: BrowserAnnotationMode): Promise<BrowserAnnotationDraft> {
    const contents = this.#contents()
    if (contents === null || !contents.debugger.isAttached() || this.#activeActualUrl.length === 0) {
      throw new Error('Browser is not ready for annotation')
    }
    try {
      const raw = await contents.executeJavaScriptInIsolatedWorld(
        ANNOTATION_WORLD_ID,
        [{ code: annotationPickScript(mode), url: 'kimi-agent://annotation-picker' }]
      )
      if (raw === null) throw new Error('Annotation selection cancelled')
      const selection = validateRawAnnotationSelection(raw, mode)
      const screenshot = await this.#captureAnnotation(selection)
      const id = randomUUID()
      const draft: BrowserAnnotationDraft = {
        id,
        annotation: {
          schemaVersion: 1,
          page: {
            url: this.#displayUrl(selection.page.url),
            title: boundedText(this.#sanitize(selection.page.title), 512),
            viewport: { ...selection.page.viewport }
          },
          scroll: { ...selection.scroll },
          target: {
            kind: selection.target.kind,
            ...(selection.target.selector === undefined ? {} : {
              selector: boundedText(this.#sanitize(selection.target.selector), 1_000)
            }),
            ...(selection.target.xpath === undefined ? {} : {
              xpath: boundedText(this.#sanitize(selection.target.xpath), 1_000)
            }),
            ...(selection.target.tag === undefined ? {} : {
              tag: boundedText(this.#sanitize(selection.target.tag), 64)
            }),
            ...(selection.target.ariaLabel === undefined ? {} : {
              ariaLabel: boundedText(this.#sanitize(selection.target.ariaLabel), 160)
            }),
            ...(selection.target.textSnippet === undefined ? {} : {
              textSnippet: boundedText(this.#sanitize(selection.target.textSnippet), 240)
            }),
            rect: { ...selection.target.rect }
          },
          comment: '',
          capturedAt: new Date().toISOString()
        },
        screenshot
      }
      while (this.#annotationDrafts.size >= MAX_ANNOTATION_DRAFTS) {
        const oldest = this.#annotationDrafts.keys().next().value as string | undefined
        if (oldest === undefined) break
        this.#annotationDrafts.delete(oldest)
      }
      this.#annotationDrafts.set(id, draft)
      return cloneAnnotationDraft(draft)
    } catch (error) {
      throw new Error(this.#safeError(error))
    }
  }

  deleteAnnotation(draftId: string): void {
    this.#annotationDrafts.delete(draftId)
  }

  prepareAnnotationSubmission(input: BrowserAnnotationSubmitInput): BrowserAnnotationSubmission {
    const draft = this.#annotationDrafts.get(input.draftId)
    if (draft === undefined) throw new Error('Annotation draft is no longer available')
    const target = { ...draft.annotation.target }
    if (!input.includeSelector) {
      delete target.selector
      delete target.xpath
    }
    if (!input.includeText) {
      delete target.ariaLabel
      delete target.textSnippet
    }
    return {
      annotation: {
        ...draft.annotation,
        page: {
          ...draft.annotation.page,
          url: boundedText(this.#sanitize(input.pageUrl), 4_000)
        },
        target,
        comment: boundedText(input.comment, 8_000)
      },
      screenshot: input.includeScreenshot ? { ...draft.screenshot } : null
    }
  }

  async openExternal(): Promise<{ opened: true }> {
    return await this.#serialize(async () => {
      if (!isAllowedBrowserNavigation(this.#activeActualUrl)) throw new Error('No safe Browser URL is active')
      if (this.#previewSanitizer.workspaceForOrigin(new URL(this.#activeActualUrl).origin) !== undefined) {
        throw new Error('Workspace previews stay inside Kimi Browser')
      }
      await shell.openExternal(this.#activeActualUrl)
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
    this.#annotationDrafts.clear()
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

  async #captureAnnotation(selection: RawAnnotationSelection): Promise<BrowserCaptureResult> {
    const contents = this.#contents()
    if (contents === null || !contents.debugger.isAttached()) throw new Error('Browser is not ready')
    const metrics = await contents.debugger.sendCommand('Page.getLayoutMetrics') as {
      cssContentSize?: { width?: unknown; height?: unknown }
      contentSize?: { width?: unknown; height?: unknown }
    }
    const content = metrics.cssContentSize ?? metrics.contentSize
    const contentWidth = finiteNumber(content?.width)
    const contentHeight = finiteNumber(content?.height)
    if (contentWidth === null || contentHeight === null) throw new Error('Browser page size is unavailable')
    const source = selection.target.rect
    const x = Math.max(0, source.x + selection.scroll.x - ANNOTATION_PADDING)
    const y = Math.max(0, source.y + selection.scroll.y - ANNOTATION_PADDING)
    const width = Math.min(contentWidth - x, source.width + ANNOTATION_PADDING * 2)
    const height = Math.min(contentHeight - y, source.height + ANNOTATION_PADDING * 2)
    const bounded = captureSizeWithinBudget(width, height, selection.page.viewport.dpr, false)
    const result = await contents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x, y, width: bounded.width, height: bounded.height, scale: 1 }
    }) as { data?: unknown }
    if (typeof result.data !== 'string' || result.data.length > MAX_SCREENSHOT_BASE64) {
      throw new Error('Annotation screenshot exceeds the safe size limit')
    }
    const dataUrl = `data:image/png;base64,${result.data}`
    const size = nativeImage.createFromDataURL(dataUrl).getSize()
    return { dataUrl, width: size.width, height: size.height, fullPage: false }
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
    this.#refreshNavigationState()
    this.#scheduleState()
  }

  #refreshNavigationState(): void {
    const contents = this.#contents()
    this.#state.canGoBack = contents?.navigationHistory.canGoBack() ?? false
    this.#state.canGoForward = contents?.navigationHistory.canGoForward() ?? false
  }

  #attachIfNeeded(): void {
    if (this.#overlayOpen || !this.#state.visible || this.#view === null || this.#bounds === null) return
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

function cloneAnnotationDraft(draft: BrowserAnnotationDraft): BrowserAnnotationDraft {
  return {
    id: draft.id,
    annotation: {
      ...draft.annotation,
      page: {
        ...draft.annotation.page,
        viewport: { ...draft.annotation.page.viewport }
      },
      ...(draft.annotation.scroll === undefined ? {} : { scroll: { ...draft.annotation.scroll } }),
      target: {
        ...draft.annotation.target,
        rect: { ...draft.annotation.target.rect }
      }
    },
    screenshot: { ...draft.screenshot }
  }
}

function validateRawAnnotationSelection(value: unknown, expectedMode: BrowserAnnotationMode): RawAnnotationSelection {
  const root = asRecord(value)
  const page = asRecord(root.page)
  const viewport = asRecord(page.viewport)
  const scroll = asRecord(root.scroll)
  const target = asRecord(root.target)
  const rect = asRecord(target.rect)
  const kind = target.kind
  const url = stringValue(page.url)
  if (
    (kind !== 'element' && kind !== 'region') ||
    kind !== expectedMode ||
    url === null ||
    !isAllowedBrowserNavigation(url)
  ) {
    throw new TypeError('Invalid annotation selection')
  }
  return {
    page: {
      url,
      title: typeof page.title === 'string' ? page.title : '',
      viewport: {
        width: finiteBounded(viewport.width, 1, 10_000, 'annotation viewport width'),
        height: finiteBounded(viewport.height, 1, 10_000, 'annotation viewport height'),
        dpr: finiteBounded(viewport.dpr, 0.1, 8, 'annotation device scale')
      }
    },
    scroll: {
      x: finiteBounded(scroll.x, 0, 1_000_000, 'annotation scroll x'),
      y: finiteBounded(scroll.y, 0, 1_000_000, 'annotation scroll y')
    },
    target: {
      kind,
      ...optionalBoundedString(target.selector, 'selector', 2_000),
      ...optionalBoundedString(target.xpath, 'xpath', 2_000),
      ...optionalBoundedString(target.tag, 'tag', 128),
      ...optionalBoundedString(target.ariaLabel, 'ariaLabel', 500),
      ...optionalBoundedString(target.textSnippet, 'textSnippet', 1_000),
      rect: {
        x: finiteBounded(rect.x, -10_000, 1_000_000, 'annotation rect x'),
        y: finiteBounded(rect.y, -10_000, 1_000_000, 'annotation rect y'),
        width: finiteBounded(rect.width, 1, 10_000, 'annotation rect width'),
        height: finiteBounded(rect.height, 1, 10_000, 'annotation rect height')
      }
    }
  }
}

function optionalBoundedString(
  value: unknown,
  key: 'selector' | 'xpath' | 'tag' | 'ariaLabel' | 'textSnippet',
  limit: number
): Partial<Record<typeof key, string>> {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value !== 'string' || value.length > limit) throw new TypeError(`Invalid annotation ${key}`)
  return { [key]: value }
}

function finiteBounded(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value
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
