import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { CursorLedger, type CursorDecision } from '../reducer/CursorLedger.js'
import {
  parseServerFrame,
  type ClientHelloFrame,
  type KimiCursor,
  type KnownControlFrame,
  type SessionEventFrame,
  type SubscribeFrame,
  type TerminalAttachFrame,
  type TerminalCloseFrame,
  type TerminalDetachFrame,
  type TerminalInputFrame,
  type TerminalResizeFrame,
  type TerminalServerFrame,
  type UnsubscribeFrame
} from '../wire/ws.js'

export interface WebSocketMessageEventLike {
  data: unknown
}

interface WebSocketCloseEventLike {
  code?: number
  reason?: string
}

export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: () => void): void
  addEventListener(type: 'message', listener: (event: WebSocketMessageEventLike) => void): void
  addEventListener(type: 'close', listener: (event: WebSocketCloseEventLike) => void): void
  addEventListener(type: 'error', listener: () => void): void
}

export type WebSocketFactory = (url: string, protocols: string[]) => WebSocketLike

export interface KimiWsClientOptions {
  origin: string
  token: string
  clientId?: string
  requestTimeoutMs?: number
  webSocketFactory?: WebSocketFactory
}

interface PendingRequest {
  resolve: (frame: Extract<KnownControlFrame, { type: 'ack' }>) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

interface TerminalAttachment {
  sessionId: string
  terminalId: string
  lastSeq: number
}

type AckFrame = Extract<KnownControlFrame, { type: 'ack' }>

export interface ConnectOptions {
  subscriptions?: string[]
  cursors?: Record<string, KimiCursor>
}

export class KimiWsClient extends EventEmitter {
  readonly #url: string
  readonly #token: string
  readonly #clientId: string
  readonly #requestTimeoutMs: number
  readonly #factory: WebSocketFactory
  readonly #ledger = new CursorLedger()
  readonly #pending = new Map<string, PendingRequest>()
  readonly #terminalAttachments = new Map<string, TerminalAttachment>()
  #socket: WebSocketLike | null = null
  #helloSent = false
  #messageSeq = 0
  #connectRequest: { id: string; frame: ClientHelloFrame } | null = null

  constructor(options: KimiWsClientOptions) {
    super()
    this.#url = toWebSocketUrl(options.origin)
    this.#token = options.token
    this.#clientId = options.clientId ?? `kimi-agent-${randomUUID()}`
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 10_000
    this.#factory = options.webSocketFactory ?? defaultWebSocketFactory
  }

  get cursors(): Record<string, KimiCursor> {
    return this.#ledger.snapshot()
  }

  setCursor(sessionId: string, cursor: KimiCursor): void {
    this.#ledger.set(sessionId, cursor)
  }

  async connect(options: ConnectOptions = {}): Promise<void> {
    if (this.#socket !== null) throw new Error('Kimi WebSocket is already connected or connecting')
    if (options.cursors !== undefined) this.#ledger.seed(options.cursors)

    const id = this.#nextId()
    this.#connectRequest = {
      id,
      frame: {
        type: 'client_hello',
        id,
        payload: {
          client_id: this.#clientId,
          subscriptions: options.subscriptions ?? [],
          ...(options.cursors === undefined ? {} : { cursors: options.cursors })
        }
      }
    }

    const socket = this.#factory(withClientId(this.#url, this.#clientId), [`kimi-code.bearer.${this.#token}`])
    this.#socket = socket
    socket.addEventListener('open', () => this.emit('open'))
    socket.addEventListener('message', (event) => void this.#handleMessage(event.data))
    socket.addEventListener('error', () => this.emit('transport-error', new Error('Kimi WebSocket transport error')))
    socket.addEventListener('close', (event) => this.#handleClose(event))

    await this.#awaitAck(id)
    for (const attachment of this.#terminalAttachments.values()) this.#sendTerminalAttach(attachment)
  }

  async subscribe(sessionIds: string[]): Promise<AckFrame> {
    const id = this.#nextId()
    const frame: SubscribeFrame = {
      type: 'subscribe',
      id,
      payload: {
        session_ids: sessionIds,
        cursors: this.#ledger.snapshot()
      }
    }
    const ack = this.#awaitAck(id)
    this.#send(frame)
    return await ack
  }

  async unsubscribe(sessionIds: string[]): Promise<AckFrame> {
    const id = this.#nextId()
    const frame: UnsubscribeFrame = {
      type: 'unsubscribe',
      id,
      payload: { session_ids: sessionIds }
    }
    const ack = this.#awaitAck(id)
    this.#send(frame)
    const result = await ack
    for (const sessionId of sessionIds) this.#ledger.delete(sessionId)
    return result
  }

  attachTerminal(sessionId: string, terminalId: string, sinceSeq?: number): void {
    const key = terminalKey(sessionId, terminalId)
    const existing = this.#terminalAttachments.get(key)
    const attachment: TerminalAttachment = {
      sessionId,
      terminalId,
      lastSeq: sinceSeq ?? existing?.lastSeq ?? -1
    }
    this.#terminalAttachments.set(key, attachment)
    this.#sendTerminalAttach(attachment)
  }

  detachTerminal(sessionId: string, terminalId: string): void {
    this.#terminalAttachments.delete(terminalKey(sessionId, terminalId))
    const id = this.#nextId()
    const frame: TerminalDetachFrame = {
      type: 'terminal_detach',
      id,
      payload: { session_id: sessionId, terminal_id: terminalId }
    }
    this.#send(frame)
  }

  sendTerminalInput(sessionId: string, terminalId: string, data: string): void {
    const id = this.#nextId()
    const frame: TerminalInputFrame = {
      type: 'terminal_input',
      id,
      payload: { session_id: sessionId, terminal_id: terminalId, data }
    }
    this.#send(frame)
  }

  resizeTerminal(
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number
  ): void {
    const id = this.#nextId()
    const frame: TerminalResizeFrame = {
      type: 'terminal_resize',
      id,
      payload: { session_id: sessionId, terminal_id: terminalId, cols, rows }
    }
    this.#send(frame)
  }

  closeTerminal(sessionId: string, terminalId: string): void {
    this.#terminalAttachments.delete(terminalKey(sessionId, terminalId))
    const id = this.#nextId()
    const frame: TerminalCloseFrame = {
      type: 'terminal_close',
      id,
      payload: { session_id: sessionId, terminal_id: terminalId }
    }
    this.#send(frame)
  }

  close(): void {
    const socket = this.#socket
    this.#socket = null
    this.#helloSent = false
    this.#connectRequest = null
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Kimi WebSocket closed'))
    }
    this.#pending.clear()
    socket?.close(1000, 'client shutdown')
  }

  async #handleMessage(data: unknown): Promise<void> {
    const raw = await messageDataToText(data)
    if (raw === null) {
      this.emit('protocol-error', new Error('Unsupported Kimi WebSocket frame encoding'))
      return
    }

    const parsed = parseServerFrame(raw)
    if (parsed.kind === 'invalid') {
      this.emit('protocol-error', parsed.error)
      return
    }
    if (parsed.kind === 'unknown') {
      this.emit('unknown-frame', parsed.value)
      return
    }
    if (parsed.kind === 'control') {
      this.#handleControlFrame(parsed.frame)
      return
    }
    if (parsed.kind === 'terminal') {
      this.#handleTerminalFrame(parsed.frame)
      return
    }

    const decision = this.#ledger.observe(parsed.frame)
    if (decision?.kind === 'duplicate') {
      this.emit('duplicate-event', parsed.frame)
      return
    }
    if (decision?.kind === 'gap' || decision?.kind === 'epoch-changed') {
      this.emit('resync-required', {
        sessionId: parsed.frame.session_id,
        reason: decision.kind,
        decision,
        frame: parsed.frame
      })
      return
    }
    this.emit('session-event', parsed.frame)
  }

  #handleControlFrame(frame: KnownControlFrame): void {
    if (frame.type === 'server_hello') {
      this.emit('server-hello', frame.payload)
      if (!this.#helloSent && this.#connectRequest !== null) {
        this.#helloSent = true
        this.#send(this.#connectRequest.frame)
      }
      return
    }
    if (frame.type === 'ack') {
      const pending = this.#pending.get(frame.id)
      if (pending === undefined) {
        this.emit('unknown-ack', frame)
        return
      }
      clearTimeout(pending.timer)
      this.#pending.delete(frame.id)
      if (frame.code === 0) pending.resolve(frame)
      else pending.reject(new Error(`Kimi WebSocket request failed (${frame.code}): ${frame.msg}`))
      return
    }
    if (frame.type === 'ping') {
      this.#send({ type: 'pong', payload: { nonce: frame.payload.nonce } })
      return
    }
    if (frame.type === 'resync_required') {
      this.emit('resync-required', {
        sessionId: frame.payload.session_id,
        reason: frame.payload.reason,
        frame
      })
      return
    }
    if (frame.type === 'error') {
      this.emit('server-error', frame.payload)
    }
  }

  #handleTerminalFrame(frame: TerminalServerFrame): void {
    const key = terminalKey(frame.session_id, frame.terminal_id)
    const attachment = this.#terminalAttachments.get(key)
    if (attachment === undefined) return

    if (frame.type === 'terminal_exit') {
      this.#terminalAttachments.delete(key)
      this.emit('terminal-exit', {
        sessionId: frame.session_id,
        terminalId: frame.terminal_id,
        exitCode: frame.payload.exit_code
      })
      return
    }

    if (frame.seq <= attachment.lastSeq) {
      this.emit('duplicate-terminal-output', frame)
      return
    }
    attachment.lastSeq = frame.seq
    this.emit('terminal-output', {
      sessionId: frame.session_id,
      terminalId: frame.terminal_id,
      seq: frame.seq,
      data: frame.payload.data
    })
  }

  #awaitAck(id: string): Promise<Extract<KnownControlFrame, { type: 'ack' }>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`Timed out waiting for Kimi WebSocket ack ${id}`))
      }, this.#requestTimeoutMs)
      timer.unref()
      this.#pending.set(id, { resolve, reject, timer })
    })
  }

  #sendTerminalAttach(attachment: TerminalAttachment): void {
    const id = this.#nextId()
    const frame: TerminalAttachFrame = {
      type: 'terminal_attach',
      id,
      payload: {
        session_id: attachment.sessionId,
        terminal_id: attachment.terminalId,
        ...(attachment.lastSeq < 0 ? {} : { since_seq: attachment.lastSeq })
      }
    }
    this.#send(frame)
  }

  #send(frame: object): void {
    const socket = this.#socket
    if (socket === null || socket.readyState !== 1) {
      throw new Error('Kimi WebSocket is not open')
    }
    socket.send(JSON.stringify(frame))
  }

  #nextId(): string {
    this.#messageSeq += 1
    return `c_${this.#messageSeq}`
  }

  #handleClose(event: WebSocketCloseEventLike): void {
    this.#socket = null
    this.#helloSent = false
    this.#connectRequest = null
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(`Kimi WebSocket closed (${event.code ?? 'unknown'}): ${event.reason ?? ''}`))
    }
    this.#pending.clear()
    this.emit('close', event)
  }
}

function toWebSocketUrl(origin: string): string {
  const url = new URL(origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/api/v1/ws'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function withClientId(url: string, clientId: string): string {
  const identifiedUrl = new URL(url)
  identifiedUrl.searchParams.set('client_id', clientId)
  return identifiedUrl.toString()
}

function defaultWebSocketFactory(url: string, protocols: string[]): WebSocketLike {
  return new WebSocket(url, protocols)
}

async function messageDataToText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) return await data.text()
  return null
}

export type ResyncDecision = Extract<CursorDecision, { kind: 'gap' | 'epoch-changed' }>

function terminalKey(sessionId: string, terminalId: string): string {
  return `${sessionId}\0${terminalId}`
}
