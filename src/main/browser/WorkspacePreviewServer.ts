import { createHash, randomBytes } from 'node:crypto'
import { constants, watch, type FSWatcher } from 'node:fs'
import { open, realpath, stat, type FileHandle } from 'node:fs/promises'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path'
import { validateWorkspacePath } from '../security/workspaceInputs.js'

const MAX_PREVIEW_PATH = 4_096
const PREVIEW_CAPABILITY_HEADER = 'x-kimi-preview-capability'
const PREVIEW_TICKET_PARAM = 'kimi-preview-ticket'
const PREVIEW_CAPABILITY_COOKIE = '__kimi_preview_cap'
const PUBLISH_ROOT_MARKERS = new Set(['dist', 'build', 'out', 'public', 'site', 'www'])
const PUBLISHABLE_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp',
  '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.txt', '.xml', '.wasm', '.mp3', '.mp4', '.webm'
])
const DEFAULT_WATCH_DEBOUNCE_MS = 280

export interface WorkspacePreviewServerOptions {
  /** 文件变更事件的去抖窗口；测试可调短。 */
  watchDebounceMs?: number
}

export class WorkspacePreviewServer {
  readonly #token = randomBytes(24).toString('hex')
  readonly #roots = new Map<string, string>()
  readonly #watchDebounceMs: number
  #server: Server | null = null
  #port: number | null = null
  #watcher: FSWatcher | null = null
  #watchTimer: NodeJS.Timeout | null = null
  #watchOnChange: (() => void) | null = null

  constructor(options: WorkspacePreviewServerOptions = {}) {
    this.#watchDebounceMs = options.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS
  }

  async open(workspaceRoot: string, workspacePath: string): Promise<string> {
    const safePath = validateWorkspacePath(workspacePath)
    const canonicalRoot = await realpath(workspaceRoot)
    if (!(await stat(canonicalRoot)).isDirectory()) throw new Error('Workspace preview root is not a directory')
    if (!isPublishablePath(safePath, false)) throw new Error('Workspace preview entry is not publishable')
    const canonicalEntry = await realpath(join(canonicalRoot, ...safePath.split('/')))
    if (!isInside(canonicalRoot, canonicalEntry) || !(await stat(canonicalEntry)).isFile()) {
      throw new Error('Workspace preview entry escapes the workspace')
    }
    const publishRoot = await realpath(selectPublishRoot(canonicalRoot, safePath, canonicalEntry))
    if (!isInside(canonicalRoot, publishRoot) || !(await stat(publishRoot)).isDirectory()) {
      throw new Error('Workspace preview publication root is invalid')
    }
    const publishedRootPath = toWorkspacePath(relative(canonicalRoot, publishRoot))
    if (publishedRootPath.length > 0 && hasSensitivePath(publishedRootPath)) {
      throw new Error('Workspace preview publication root is sensitive')
    }
    const publishedEntry = toWorkspacePath(relative(publishRoot, canonicalEntry))
    if (!isPublishablePath(publishedEntry, false)) throw new Error('Workspace preview entry is not publishable')
    const rootId = createHash('sha256').update(publishRoot).digest('hex').slice(0, 16)
    this.#roots.set(rootId, publishRoot)
    await this.#ensureStarted()
    return `http://${rootId}.localhost:${this.#port}/${encodePath(publishedEntry)}`
  }

  authorizationHeadersFor(url: string): Record<string, string> | null {
    if (this.#port === null) return null
    try {
      const parsed = new URL(url)
      const match = /^([a-f0-9]{16})\.localhost$/.exec(parsed.hostname.toLowerCase())
      if (
        parsed.protocol !== 'http:' || Number(parsed.port) !== this.#port || match === null ||
        !this.#roots.has(match[1]!)
      ) return null
      return { [PREVIEW_CAPABILITY_HEADER]: this.#token }
    } catch {
      return null
    }
  }

  /**
   * 给“在默认浏览器中打开”使用：外部浏览器无法注入 capability 请求头，
   * 因此为已发布的预览 URL 附加会话票据；预览服校验后换成 HttpOnly cookie
   * 并跳转去参，后续子资源请求凭 cookie 通过鉴权。非预览 URL 返回 null。
   */
  externalUrlFor(url: string): string | null {
    if (this.#port === null) return null
    try {
      const parsed = new URL(url)
      const match = /^([a-f0-9]{16})\.localhost$/.exec(parsed.hostname.toLowerCase())
      if (
        parsed.protocol !== 'http:' || Number(parsed.port) !== this.#port || match === null ||
        !this.#roots.has(match[1]!)
      ) return null
      parsed.searchParams.set(PREVIEW_TICKET_PARAM, this.#token)
      return parsed.toString()
    } catch {
      return null
    }
  }

  /**
   * 监听当前预览 URL 的发布根目录的文件变更（去抖后回调 onChange），用于
   * 自动刷新预览。url 为 null 或不是已注册的预览来源时停止监听；同一时刻
   * 只保留一个 watcher，重复调用会替换旧的。递归 fs.watch 在当前产品目标
   * （macOS/Windows）可用，创建失败时静默降级，绝不影响预览本身。
   */
  watchForUrl(url: string | null, onChange: () => void): void {
    this.#watchOnChange = onChange
    const root = url === null ? null : this.#publishRootForUrl(url)
    if (root === null) {
      this.#stopWatching()
      return
    }
    if (this.#watchTimer !== null) clearTimeout(this.#watchTimer)
    this.#watchTimer = null
    if (this.#watcher !== null) {
      this.#watcher.close()
      this.#watcher = null
    }
    try {
      const startedAt = Date.now()
      this.#watcher = watch(root, { recursive: true }, (_eventType, filename) => {
        // 递归 watch 注册瞬间会回放目录现有内容（并非真实变更），用一个去抖窗口的宽限期跳过。
        if (Date.now() - startedAt < this.#watchDebounceMs) return
        if (filename === null) return
        const eventPath = isAbsolute(filename) ? filename : join(root, filename)
        // macOS 递归 watch 会为任何变更额外发一条以被监听目录自身为名的
        // change 事件（归因不到具体文件，且常因点文件变更触发），真正的
        // 文件级事件总会紧随其后，因此直接跳过目录自身事件。
        if (eventPath === root) return
        if (hasDotfileSegment(relative(root, eventPath))) return
        if (this.#watchTimer !== null) clearTimeout(this.#watchTimer)
        const onChangeNow = this.#watchOnChange ?? onChange
        this.#watchTimer = setTimeout(() => {
          this.#watchTimer = null
          onChangeNow()
        }, this.#watchDebounceMs)
        this.#watchTimer.unref()
      })
    } catch {
      // 平台不支持递归 watch（如 Linux）：预览照常，只是不自动刷新。
      this.#watcher = null
    }
  }

  /** 与 authorizationHeadersFor 相同的来源匹配逻辑，返回发布的根目录；非预览 URL 返回 null。 */
  #publishRootForUrl(url: string): string | null {
    if (this.#port === null) return null
    try {
      const parsed = new URL(url)
      const match = /^([a-f0-9]{16})\.localhost$/.exec(parsed.hostname.toLowerCase())
      if (
        parsed.protocol !== 'http:' || Number(parsed.port) !== this.#port || match === null
      ) return null
      return this.#roots.get(match[1]!) ?? null
    } catch {
      return null
    }
  }

  #stopWatching(): void {
    if (this.#watchTimer !== null) clearTimeout(this.#watchTimer)
    this.#watchTimer = null
    if (this.#watcher !== null) {
      this.#watcher.close()
      this.#watcher = null
    }
  }

  async close(): Promise<void> {
    this.#stopWatching()
    const server = this.#server
    this.#server = null
    this.#port = null
    this.#roots.clear()
    if (server === null) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
      server.closeAllConnections()
    })
  }

  async #ensureStarted(): Promise<void> {
    if (this.#server !== null) return
    const server = createServer((request, response) => {
      void this.#handleRequest(
        request.method ?? 'GET',
        request.headers.host,
        request.headers[PREVIEW_CAPABILITY_HEADER],
        request.headers.cookie,
        request.url,
        request.socket.remoteAddress,
        response
      )
        .catch(() => sendText(response, 500, 'Preview request failed'))
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address()
    if (address === null || typeof address === 'string') {
      server.close()
      throw new Error('Preview server did not expose a TCP port')
    }
    this.#server = server
    this.#port = address.port
  }

  async #handleRequest(
    method: string,
    rawHost: string | undefined,
    rawCapability: string | string[] | undefined,
    rawCookie: string | string[] | undefined,
    rawUrl: string | undefined,
    remoteAddress: string | undefined,
    response: ServerResponse
  ): Promise<void> {
    applySecurityHeaders(response)
    if (!isLoopback(remoteAddress)) return sendText(response, 403, 'Forbidden')
    if (method !== 'GET' && method !== 'HEAD') return sendText(response, 405, 'Method not allowed')
    const ticket = ticketFromUrl(rawUrl)
    if (ticket !== null) {
      if (ticket !== this.#token || this.#rootIdForHost(rawHost) === null) {
        return sendText(response, 403, 'Invalid preview capability')
      }
      return this.#acceptTicket(rawUrl, response)
    }
    const root = this.#rootForHost(rawHost, rawCapability)
      ?? this.#rootForHost(rawHost, cookieCapability(rawCookie) ?? undefined)
    if (root === null) return sendText(response, 403, 'Invalid preview capability')
    const pathname = parsePathname(rawUrl)
    if (pathname === null) return sendText(response, 400, 'Invalid preview path')
    const safePath = pathname.length === 0 ? 'index.html' : validateWorkspacePath(pathname)
    if (safePath.length > MAX_PREVIEW_PATH) return sendText(response, 414, 'Preview path is too long')
    if (!isPublishablePath(safePath, true)) return sendText(response, 403, 'Preview path is not published')

    let target = join(root, ...safePath.split('/'))
    let canonicalTarget: string
    let handle: FileHandle | null = null
    try {
      canonicalTarget = await realpath(target)
      if (!isInside(root, canonicalTarget)) return sendText(response, 403, 'Preview path escapes publication root')
      const targetStat = await stat(canonicalTarget)
      if (targetStat.isDirectory()) {
        target = join(canonicalTarget, 'index.html')
        canonicalTarget = await realpath(target)
        if (!isInside(root, canonicalTarget)) return sendText(response, 403, 'Preview path escapes publication root')
      } else if (!targetStat.isFile()) {
        return sendText(response, 403, 'Preview target is not a regular file')
      }
      const publishedTarget = toWorkspacePath(relative(root, canonicalTarget))
      if (!isPublishablePath(publishedTarget, false)) return sendText(response, 403, 'Preview file is not published')
      const finalStat = await stat(canonicalTarget)
      if (!finalStat.isFile()) return sendText(response, 403, 'Preview target is not a regular file')
      handle = await open(
        canonicalTarget,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
      )
      const fileStat = await verifyOpenedFile(root, canonicalTarget, handle)
      if (!fileStat.isFile()) return sendText(response, 404, 'Preview file not found')
      response.statusCode = 200
      response.setHeader('content-type', mediaType(canonicalTarget))
      response.setHeader('content-length', String(fileStat.size))
      if (method === 'HEAD') {
        await handle.close()
        handle = null
        response.end()
        return
      }
      const stream = handle.createReadStream({ autoClose: false })
      let closed = false
      const closeHandle = (): void => {
        if (closed) return
        closed = true
        void handle?.close().catch(() => undefined)
        handle = null
      }
      stream
        .on('error', () => {
          closeHandle()
          if (!response.headersSent) sendText(response, 500, 'Preview read failed')
          else response.destroy()
        })
        .on('end', closeHandle)
        .pipe(response)
      response.once('close', closeHandle)
    } catch (error) {
      await handle?.close().catch(() => undefined)
      const code = (error as NodeJS.ErrnoException).code
      return sendText(
        response,
        code === 'ENOENT' || code === 'ENOTDIR'
          ? 404
          : code === 'ELOOP' || code === 'EPERM'
            ? 403
            : 500,
        'Preview file not found'
      )
    }
  }

  #rootForHost(
    rawHost: string | undefined,
    rawCapability: string | string[] | undefined
  ): string | null {
    if (rawCapability !== this.#token) return null
    const rootId = this.#rootIdForHost(rawHost)
    return rootId === null ? null : this.#roots.get(rootId) ?? null
  }

  #rootIdForHost(rawHost: string | undefined): string | null {
    if (rawHost === undefined) return null
    const hostname = rawHost.replace(/:\d+$/, '').toLowerCase()
    const match = /^([a-f0-9]{16})\.localhost$/.exec(hostname)
    return match !== null && this.#roots.has(match[1]!) ? match[1]! : null
  }

  /** 票据校验通过：种下 HttpOnly cookie 并 302 跳转到去参后的地址。 */
  #acceptTicket(rawUrl: string | undefined, response: ServerResponse): void {
    const url = new URL(rawUrl ?? '/', 'http://preview.local')
    url.searchParams.delete(PREVIEW_TICKET_PARAM)
    response.statusCode = 302
    response.setHeader('location', `${url.pathname}${url.search}`)
    response.setHeader(
      'set-cookie',
      `${PREVIEW_CAPABILITY_COOKIE}=${this.#token}; Path=/; SameSite=Lax; HttpOnly`
    )
    response.end()
  }
}

async function verifyOpenedFile(root: string, canonicalTarget: string, handle: FileHandle) {
  const openedStat = await handle.stat()
  if (!openedStat.isFile()) {
    const error = new Error('Preview target changed to a non-file during validation') as NodeJS.ErrnoException
    error.code = 'EPERM'
    throw error
  }
  const resolvedAfterOpen = await realpath(canonicalTarget)
  if (!isInside(root, resolvedAfterOpen)) {
    const error = new Error('Preview file escaped publication root after open') as NodeJS.ErrnoException
    error.code = 'EPERM'
    throw error
  }
  const pathStat = await stat(resolvedAfterOpen)
  if (openedStat.dev !== pathStat.dev || openedStat.ino !== pathStat.ino) {
    const error = new Error('Preview file changed during validation') as NodeJS.ErrnoException
    error.code = 'EPERM'
    throw error
  }
  return openedStat
}

function selectPublishRoot(workspaceRoot: string, safePath: string, canonicalEntry: string): string {
  const segments = safePath.split('/')
  const markerIndex = segments.findLastIndex((segment) => PUBLISH_ROOT_MARKERS.has(segment.toLowerCase()))
  return markerIndex === -1
    ? dirname(canonicalEntry)
    : join(workspaceRoot, ...segments.slice(0, markerIndex + 1))
}

function isPublishablePath(path: string, allowDirectory: boolean): boolean {
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return false
  if (hasSensitivePath(path)) return false
  const extension = extname(segments.at(-1)!).toLowerCase()
  return (allowDirectory && extension.length === 0) || PUBLISHABLE_EXTENSIONS.has(extension)
}

function hasSensitivePath(path: string): boolean {
  return path.split('/').filter(Boolean).some((segment) => isSensitiveSegment(segment))
}

function isSensitiveSegment(segment: string): boolean {
  const value = segment.toLowerCase()
  if (value.startsWith('.')) return true
  if (value === 'node_modules' || value === 'credentials' || value === 'secrets') return true
  if (/^(id_rsa|id_ed25519|known_hosts|authorized_keys)$/.test(value)) return true
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(value)) return true
  return /(^|[-_.])(secret|secrets|credential|credentials|private[-_]?key|service[-_]?account)([-_.]|$)/.test(value)
}

function toWorkspacePath(value: string): string {
  return value.split(sep).join('/')
}

function parsePathname(rawUrl: string | undefined): string | null {
  if (rawUrl === undefined || rawUrl.length > MAX_PREVIEW_PATH * 3) return null
  try {
    const pathname = decodeURIComponent(new URL(rawUrl, 'http://preview.local').pathname)
    if (pathname.includes('\0')) return null
    return pathname.replace(/^\/+/, '')
  } catch {
    return null
  }
}

function ticketFromUrl(rawUrl: string | undefined): string | null {
  if (rawUrl === undefined || rawUrl.length > MAX_PREVIEW_PATH * 3) return null
  try {
    return new URL(rawUrl, 'http://preview.local').searchParams.get(PREVIEW_TICKET_PARAM)
  } catch {
    return null
  }
}

function cookieCapability(rawCookie: string | string[] | undefined): string | null {
  const header = Array.isArray(rawCookie) ? rawCookie.join(';') : rawCookie
  if (header === undefined) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === PREVIEW_CAPABILITY_COOKIE) return rest.join('=')
  }
  return null
}

function isInside(root: string, target: string): boolean {
  const offset = relative(root, target)
  return offset === '' || (!offset.startsWith(`..${sep}`) && offset !== '..' && !isAbsolute(offset))
}

function hasDotfileSegment(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.startsWith('.'))
}

function isLoopback(value: string | undefined): boolean {
  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/')
}

function applySecurityHeaders(response: ServerResponse): void {
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('referrer-policy', 'no-referrer')
  response.setHeader('cross-origin-resource-policy', 'same-origin')
}

function sendText(response: ServerResponse, status: number, message: string): void {
  if (response.writableEnded) return
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end(message)
}

function mediaType(path: string): string {
  return ({
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.wasm': 'application/wasm'
  } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream'
}
