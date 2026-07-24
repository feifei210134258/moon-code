import { EventEmitter } from 'node:events'
import type { KimiWsClient } from '../../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import type { SessionEventFrame } from '../../../packages/kimi-adapter/src/wire/ws.js'
import type { PetRosterState, RuntimePublicState } from '../../shared/contracts.js'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import {
  SessionPetStateReducer,
  type PetSessionFact
} from './SessionPetStateReducer.js'

export interface KimiPetServiceOptions {
  refreshIntervalMs?: number
  reconnectBaseMs?: number
  reducer?: SessionPetStateReducer
}

export class KimiPetService extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #reducer: SessionPetStateReducer
  readonly #refreshIntervalMs: number
  readonly #reconnectBaseMs: number
  #socket: KimiWsClient | null = null
  #subscribed = new Set<string>()
  #lastSeqBySession = new Map<string, number>()
  #refreshTimer: NodeJS.Timeout | null = null
  #tickTimer: NodeJS.Timeout | null = null
  #reconnectTimer: NodeJS.Timeout | null = null
  #refreshing: Promise<void> | null = null
  #closed = false
  #generation = 0
  #reconnectAttempts = 0
  #lastEmitted = ''

  readonly #onRuntimeState = (state: RuntimePublicState): void => {
    void this.#handleRuntimeState(state)
  }

  constructor(runtime: KimiRuntimeManager, options: KimiPetServiceOptions = {}) {
    super()
    this.#runtime = runtime
    this.#reducer = options.reducer ?? new SessionPetStateReducer()
    this.#refreshIntervalMs = options.refreshIntervalMs ?? 3_000
    this.#reconnectBaseMs = options.reconnectBaseMs ?? 750
  }

  get state(): PetRosterState {
    return this.#reducer.getRoster()
  }

  start(): void {
    if (this.#closed) throw new Error('Kimi pet service is closed')
    this.#runtime.on('state-changed', this.#onRuntimeState)
    this.#tickTimer = setInterval(() => this.#emitIfChanged(), 1_000)
    this.#tickTimer.unref()
    void this.#handleRuntimeState(this.#runtime.state)
  }

  markViewed(sessionId: string): void {
    this.#reducer.markViewed(sessionId)
    this.#emitIfChanged()
  }

  async refresh(): Promise<void> {
    if (this.#closed || this.#runtime.state.status !== 'running') return
    if (this.#refreshing !== null) return await this.#refreshing
    const generation = this.#generation
    this.#refreshing = this.#refreshNow(generation).finally(() => {
      this.#refreshing = null
    })
    return await this.#refreshing
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#generation += 1
    this.#runtime.off('state-changed', this.#onRuntimeState)
    if (this.#refreshTimer !== null) clearInterval(this.#refreshTimer)
    if (this.#tickTimer !== null) clearInterval(this.#tickTimer)
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer)
    this.#refreshTimer = null
    this.#tickTimer = null
    this.#reconnectTimer = null
    this.#closeSocket()
  }

  async #handleRuntimeState(state: RuntimePublicState): Promise<void> {
    const generation = ++this.#generation
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null

    if (state.status !== 'running' || state.serverId === null) {
      if (this.#refreshTimer !== null) clearInterval(this.#refreshTimer)
      this.#refreshTimer = null
      this.#reducer.setConnected(false)
      this.#closeSocket()
      this.#emitIfChanged()
      return
    }

    this.#reducer.reset(state.serverId)
    this.#lastSeqBySession.clear()
    this.#reconnectAttempts = 0
    await this.#refreshNow(generation)
    if (generation !== this.#generation || this.#closed) return
    if (this.#refreshTimer !== null) clearInterval(this.#refreshTimer)
    this.#refreshTimer = setInterval(() => void this.refresh(), this.#refreshIntervalMs)
    this.#refreshTimer.unref()
  }

  async #refreshNow(generation: number): Promise<void> {
    try {
      const client = this.#runtime.createRestClient()
      const [workspaces, sessions] = await Promise.all([
        client.listWorkspaces(),
        client.listSessions({ includeArchive: false })
      ])
      if (generation !== this.#generation || this.#closed) return

      const facts: PetSessionFact[] = sessions.map((session) => ({
        id: session.id,
        workspaceId: session.workspace_id,
        title: session.title,
        busy: session.busy,
        mainTurnActive: session.main_turn_active === true,
        pendingInteraction: session.pending_interaction ?? 'none',
        lastTurnReason: session.last_turn_reason ?? null,
        updatedAt: timestampString(session.updated_at)
      }))
      for (const session of sessions) this.#lastSeqBySession.set(session.id, session.last_seq)
      this.#reducer.seed(
        workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name.trim() || workspace.root })),
        facts
      )
      await this.#ensureSocket(generation)
      this.#emitIfChanged()
    } catch (error) {
      if (generation !== this.#generation || this.#closed) return
      this.#reducer.setConnected(false)
      this.#closeSocket()
      this.#emitIfChanged()
      this.emit('service-error', error)
      this.#scheduleReconnect()
    }
  }

  async #ensureSocket(generation: number): Promise<void> {
    if (this.#socket === null) {
      const socket = this.#runtime.createWsClient({ clientId: 'kimi-agent-desktop-pets' })
      this.#socket = socket
      socket.on('session-event', (frame: SessionEventFrame) => this.#onSessionEvent(frame))
      socket.on('resync-required', () => void this.refresh())
      socket.on('close', () => this.#onSocketClosed(socket))
      socket.on('transport-error', (error: unknown) => this.emit('service-error', error))
      socket.on('protocol-error', (error: unknown) => this.emit('service-error', error))

      const ids = this.#reducer.trackedSessionIds
      const cursors = Object.fromEntries(ids.map((id) => [id, { seq: this.#lastSeqBySession.get(id) ?? 0 }]))
      await socket.connect({ subscriptions: ids, cursors })
      if (generation !== this.#generation || socket !== this.#socket) {
        socket.close()
        return
      }
      this.#subscribed = new Set(ids)
      this.#reducer.setConnected(true)
      this.#reconnectAttempts = 0
      return
    }

    const desired = new Set(this.#reducer.trackedSessionIds)
    const added = [...desired].filter((id) => !this.#subscribed.has(id))
    const removed = [...this.#subscribed].filter((id) => !desired.has(id))
    if (added.length > 0) {
      for (const id of added) this.#socket.setCursor(id, { seq: this.#lastSeqBySession.get(id) ?? 0 })
      await this.#socket.subscribe(added)
    }
    if (removed.length > 0) await this.#socket.unsubscribe(removed)
    this.#subscribed = desired
    this.#reducer.setConnected(true)
  }

  #onSessionEvent(frame: SessionEventFrame): void {
    if (this.#reducer.applyEvent(frame)) this.#emitIfChanged()
    else if (frame.payload.type === 'event.session.created') void this.refresh()
  }

  #onSocketClosed(socket: KimiWsClient): void {
    if (socket !== this.#socket) return
    this.#socket = null
    this.#subscribed.clear()
    this.#reducer.setConnected(false)
    this.#emitIfChanged()
    this.#scheduleReconnect()
  }

  #scheduleReconnect(): void {
    if (
      this.#closed ||
      this.#reconnectTimer !== null ||
      this.#runtime.state.status !== 'running'
    ) return
    const delay = Math.min(30_000, this.#reconnectBaseMs * (2 ** this.#reconnectAttempts))
    this.#reconnectAttempts += 1
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      void this.refresh()
    }, delay)
    this.#reconnectTimer.unref()
  }

  #closeSocket(): void {
    const socket = this.#socket
    this.#socket = null
    this.#subscribed.clear()
    socket?.close()
  }

  #emitIfChanged(): void {
    const state = this.#reducer.getRoster()
    const serialized = JSON.stringify({ ...state, updatedAt: '' })
    if (serialized === this.#lastEmitted) return
    this.#lastEmitted = serialized
    this.emit('state-changed', state)
  }
}

function timestampString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return null
}
