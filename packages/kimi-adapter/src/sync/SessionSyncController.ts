import { EventEmitter } from 'node:events'
import type { TranscriptMessage, TranscriptProjection } from '../projector/TranscriptProjector.js'
import { TranscriptProjector } from '../projector/TranscriptProjector.js'
import { AgentProjector, type AgentRosterItem } from '../projector/AgentProjector.js'
import type { KimiRestClient } from '../transport/KimiRestClient.js'
import type { ConnectOptions } from '../transport/KimiWsClient.js'
import type { KimiCursor, SessionEventFrame } from '../wire/ws.js'
import {
  approvalRequestSchema,
  questionRequestSchema,
  type ApprovalRequest,
  type PromptSubmitResult,
  type QuestionRequest,
  type SessionSnapshot,
  type SessionTodo,
  type SessionTranscript
} from '../wire/schemas.js'

export type SessionSyncPhase = 'idle' | 'loading' | 'ready' | 'resyncing' | 'reconnecting' | 'error'

export interface PendingApprovalView {
  approvalId: string
  toolCallId: string
  toolName: string
  action: string
  display: string
  createdAt: string
  expiresAt: string
}

export interface QuestionOptionView {
  id: string
  label: string
  description?: string
  recommended: boolean
}

export interface QuestionItemView {
  id: string
  question: string
  header?: string
  body?: string
  options: QuestionOptionView[]
  multiSelect: boolean
  allowOther: boolean
  otherLabel?: string
  otherDescription?: string
}

export interface PendingQuestionView {
  questionId: string
  toolCallId: string | null
  questions: QuestionItemView[]
  createdAt: string
}

export interface SessionSyncView {
  sessionId: string
  title: string
  workspaceRoot: string
  busy: boolean
  mainTurnActive: boolean
  activePromptId: string | null
  activePromptStatus: 'running' | 'queued' | 'blocked' | null
  phase: SessionSyncPhase
  cursor: KimiCursor | null
  messages: TranscriptMessage[]
  markers: SessionTranscriptMarkerView[]
  todos: SessionTodoView[]
  sideChat: SessionSideChatView | null
  pendingApprovals: PendingApprovalView[]
  pendingQuestions: PendingQuestionView[]
  agents: AgentRosterItem[]
  usage: SessionUsageView
  hasMoreMessages: boolean
  resyncCount: number
  unknownEventCount: number
  error: string | null
}

export interface SessionTranscriptMarkerView {
  markerId: string
  marker: string
  payload: unknown
  at: string | null
}

export interface SessionTodoItemView {
  title: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface SessionTodoView {
  todoId: string
  items: SessionTodoItemView[]
  updatedAt: string | null
}

export interface SessionSideChatView {
  agentId: string
  messages: TranscriptMessage[]
  active: boolean
  error: string | null
}

interface TranscriptSupplement {
  markers: SessionTranscriptMarkerView[]
  todos: SessionTodoView[]
}

interface SideChatEventResult {
  matched: boolean
  changed: boolean
}

export interface SessionUsageView {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number | null
  contextTokens: number
  contextLimit: number
  turnCount: number | null
}

/**
 * Kimi Server broadcasts these events to every open Session subscription.
 * They invalidate cross-session navigation or global configuration, but never
 * carry config data across the desktop IPC boundary.
 */
export interface GlobalSyncEvent {
  scope: 'navigation' | 'config'
  eventType: string
}

interface SyncRestClient {
  getSessionSnapshot: KimiRestClient['getSessionSnapshot']
  getSessionTranscript?: KimiRestClient['getSessionTranscript']
}

interface SyncSocket {
  connect(options?: ConnectOptions): Promise<void>
  subscribe(sessionIds: string[]): Promise<unknown>
  unsubscribe(sessionIds: string[]): Promise<unknown>
  setCursor(sessionId: string, cursor: KimiCursor): void
  readonly cursors: Record<string, KimiCursor>
  close(): void
  on(eventName: string, listener: (...args: any[]) => void): unknown
  off(eventName: string, listener: (...args: any[]) => void): unknown
}

interface OptimisticSkillState {
  busy: boolean
  mainTurnActive: boolean
  activePromptId: string | null
  activePromptStatus: SessionSyncView['activePromptStatus']
}

export interface SessionSyncControllerOptions {
  rest: SyncRestClient
  socket: SyncSocket
  reconnectBaseMs?: number
}

const LIVE_STATE_EMIT_INTERVAL_MS = 16

export class SessionSyncController extends EventEmitter {
  readonly #rest: SyncRestClient
  readonly #socket: SyncSocket
  readonly #projector = new TranscriptProjector()
  readonly #agentProjector = new AgentProjector()
  readonly #states = new Map<string, SessionSyncView>()
  readonly #pendingProjections = new Set<string>()
  readonly #reconnectBaseMs: number
  #sideChatProjector: { sessionId: string; agentId: string; projector: TranscriptProjector } | null = null
  #activeSessionId: string | null = null
  #connected = false
  #closed = false
  #generation = 0
  #resyncing = new Map<string, Promise<void>>()
  #optimisticSkills = new Map<string, OptimisticSkillState>()
  #reconnectAttempts = 0
  #reconnectTimer: NodeJS.Timeout | null = null
  #liveStateTimer: NodeJS.Timeout | null = null
  #pendingLiveState: SessionSyncView | null = null

  readonly #onSessionEvent = (frame: SessionEventFrame): void => this.#handleSessionEvent(frame)
  readonly #onResyncRequired = (detail: unknown): void => {
    const sessionId = recordString(detail, 'sessionId')
    if (sessionId === '__global__') {
      this.#emitGlobalResync()
      return
    }
    if (sessionId !== null) void this.#resync(sessionId)
  }
  readonly #onClose = (): void => {
    this.#connected = false
    if (!this.#closed) this.#scheduleReconnect()
  }

  constructor(options: SessionSyncControllerOptions) {
    super()
    this.#rest = options.rest
    this.#socket = options.socket
    this.#reconnectBaseMs = options.reconnectBaseMs ?? 750
    this.#socket.on('session-event', this.#onSessionEvent)
    this.#socket.on('resync-required', this.#onResyncRequired)
    this.#socket.on('close', this.#onClose)
  }

  get activeSessionId(): string | null {
    return this.#activeSessionId
  }

  getState(sessionId: string): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    if (state !== undefined) this.#applyPendingProjection(state)
    return state === undefined ? null : cloneView(state)
  }

  async refreshSession(sessionId: string): Promise<SessionSyncView> {
    if (this.#closed) throw new Error('Session sync controller is closed')
    if (sessionId !== this.#activeSessionId) throw new Error('Kimi session is not active')
    await this.#resync(sessionId)
    const state = this.#states.get(sessionId)
    if (state === undefined) throw new Error('Kimi session state is unavailable')
    if (state.phase === 'error') throw new Error(state.error ?? 'Kimi session refresh failed')
    return cloneView(state)
  }

  async openSession(sessionId: string): Promise<SessionSyncView> {
    if (this.#closed) throw new Error('Session sync controller is closed')
    const generation = ++this.#generation
    const previousSessionId = this.#activeSessionId
    this.#activeSessionId = sessionId
    this.#cancelLiveStateEmission()
    this.#pendingProjections.clear()
    if (this.#sideChatProjector?.sessionId !== sessionId) this.#sideChatProjector = null
    if (previousSessionId !== null && previousSessionId !== sessionId && this.#connected) {
      try {
        await this.#socket.unsubscribe([previousSessionId])
      } catch {
        // The socket may have closed during a fast session switch. The next
        // hello sends only the current active session, so stale delivery stops.
      }
    }

    const loading = this.#states.get(sessionId) ?? emptyView(sessionId)
    if (this.#sideChatProjector?.sessionId !== sessionId) loading.sideChat = null
    loading.phase = 'loading'
    loading.error = null
    this.#states.set(sessionId, loading)
    this.#emitState(loading)

    try {
      const [snapshot, transcript] = await Promise.all([
        this.#rest.getSessionSnapshot(sessionId),
        this.#loadTranscriptSupplement(sessionId)
      ])
      if (generation !== this.#generation || this.#activeSessionId !== sessionId) return cloneView(loading)

      const projection = this.#projector.seedSnapshot(sessionId, snapshot)
      this.#optimisticSkills.delete(sessionId)
      const agents = this.#agentProjector.seedSnapshot(sessionId, snapshot)
      const cursor = { seq: snapshot.as_of_seq, epoch: snapshot.epoch }
      this.#socket.setCursor(sessionId, cursor)
      const ready: SessionSyncView = {
        sessionId,
        title: snapshot.session.title,
        workspaceRoot: snapshot.session.metadata.cwd,
        busy: snapshot.session.busy,
        mainTurnActive: snapshot.session.main_turn_active === true || projection.active,
        activePromptId: snapshot.in_flight_turn?.current_prompt_id
          ?? snapshot.session.current_prompt_id
          ?? authoritativePromptId(projection.activePromptId),
        activePromptStatus: snapshot.in_flight_turn === null ? null : 'running',
        phase: 'ready',
        cursor,
        messages: projection.messages,
        markers: transcript.markers,
        todos: transcript.todos,
        sideChat: cloneSideChat(loading.sideChat),
        pendingApprovals: snapshot.pending_approvals.map(mapApproval),
        pendingQuestions: snapshot.pending_questions.map(mapQuestion),
        agents,
        usage: mapSnapshotUsage(snapshot.session.usage),
        hasMoreMessages: snapshot.messages.has_more,
        resyncCount: loading.resyncCount,
        unknownEventCount: projection.unknownEventCount,
        error: null
      }
      this.#states.set(sessionId, ready)

      if (!this.#connected) {
        await this.#socket.connect({
          subscriptions: [sessionId],
          cursors: { [sessionId]: cursor }
        })
        this.#connected = true
        this.#reconnectAttempts = 0
      } else {
        await this.#socket.subscribe([sessionId])
      }
      this.#emitState(ready)
      return cloneView(ready)
    } catch (error) {
      const failed = this.#states.get(sessionId) ?? loading
      failed.phase = 'error'
      failed.error = errorMessage(error)
      this.#states.set(sessionId, failed)
      this.#emitState(failed)
      return cloneView(failed)
    }
  }

  close(): void {
    if (this.#closed) return
    this.#closed = true
    this.#generation += 1
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer)
    this.#reconnectTimer = null
    this.#cancelLiveStateEmission()
    this.#pendingProjections.clear()
    this.#socket.off('session-event', this.#onSessionEvent)
    this.#socket.off('resync-required', this.#onResyncRequired)
    this.#socket.off('close', this.#onClose)
    this.#socket.close()
    this.#connected = false
    this.#optimisticSkills.clear()
    this.#sideChatProjector = null
  }

  acceptSubmittedPrompt(sessionId: string, prompt: PromptSubmitResult): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    if (state === undefined || sessionId !== this.#activeSessionId) return null
    const cursor = state.cursor
    this.#projector.project({
      type: 'prompt.submitted',
      seq: cursor?.seq ?? 0,
      ...(cursor?.epoch === undefined ? {} : { epoch: cursor.epoch }),
      volatile: true,
      session_id: sessionId,
      timestamp: typeof prompt.created_at === 'string' ? prompt.created_at : new Date().toISOString(),
      payload: {
        promptId: prompt.prompt_id,
        userMessageId: prompt.user_message_id,
        status: prompt.status,
        content: prompt.content,
        createdAt: prompt.created_at
      }
    })
    this.#applyProjection(state, this.#projector.getProjection(sessionId))
    state.activePromptId = prompt.prompt_id
    state.activePromptStatus = prompt.status
    if (prompt.status === 'running') {
      state.busy = true
      state.mainTurnActive = true
    }
    this.#emitState(state)
    return cloneView(state)
  }

  startSideChat(sessionId: string, agentId: string): SessionSideChatView {
    const state = this.#states.get(sessionId)
    if (state === undefined || sessionId !== this.#activeSessionId) throw new Error('Kimi session is not active')
    const projector = new TranscriptProjector(agentId)
    projector.reset(sessionId)
    this.#sideChatProjector = { sessionId, agentId, projector }
    state.sideChat = { agentId, messages: [], active: false, error: null }
    this.#emitState(state)
    return cloneSideChat(state.sideChat)!
  }

  acceptSideChatPrompt(sessionId: string, agentId: string, prompt: PromptSubmitResult): SessionSideChatView {
    const state = this.#states.get(sessionId)
    const sideChat = state?.sideChat
    const projector = this.#sideChatProjector
    if (
      state === undefined || sessionId !== this.#activeSessionId || sideChat?.agentId !== agentId ||
      projector?.sessionId !== sessionId || projector.agentId !== agentId
    ) throw new Error('Kimi Side Chat is not active')
    projector.projector.project({
      type: 'prompt.submitted',
      seq: state.cursor?.seq ?? 0,
      ...(state.cursor?.epoch === undefined ? {} : { epoch: state.cursor.epoch }),
      volatile: true,
      session_id: sessionId,
      timestamp: typeof prompt.created_at === 'string' ? prompt.created_at : new Date().toISOString(),
      payload: {
        agentId,
        promptId: prompt.prompt_id,
        userMessageId: prompt.user_message_id,
        status: prompt.status,
        content: prompt.content,
        createdAt: prompt.created_at
      }
    })
    const projection = projector.projector.getProjection(sessionId)
    state.sideChat = {
      agentId,
      messages: projection.messages,
      active: prompt.status === 'running',
      error: null
    }
    this.#emitState(state)
    return cloneSideChat(state.sideChat)!
  }

  closeSideChat(sessionId: string, agentId: string): void {
    const state = this.#states.get(sessionId)
    if (state === undefined || sessionId !== this.#activeSessionId || state.sideChat?.agentId !== agentId) {
      throw new Error('Kimi Side Chat is not active')
    }
    state.sideChat = null
    this.#sideChatProjector = null
    this.#emitState(state)
  }

  beginSkillActivation(sessionId: string): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    if (state === undefined || sessionId !== this.#activeSessionId) return null
    if (!this.#optimisticSkills.has(sessionId)) {
      this.#optimisticSkills.set(sessionId, {
        busy: state.busy,
        mainTurnActive: state.mainTurnActive,
        activePromptId: state.activePromptId,
        activePromptStatus: state.activePromptStatus
      })
    }
    state.busy = true
    state.mainTurnActive = true
    state.activePromptId = null
    state.activePromptStatus = 'running'
    this.#emitState(state)
    return cloneView(state)
  }

  rejectSkillActivation(sessionId: string): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    const previous = this.#optimisticSkills.get(sessionId)
    if (state === undefined) return null
    if (previous === undefined) return cloneView(state)
    this.#optimisticSkills.delete(sessionId)
    state.busy = previous.busy
    state.mainTurnActive = previous.mainTurnActive
    state.activePromptId = previous.activePromptId
    state.activePromptStatus = previous.activePromptStatus
    if (sessionId === this.#activeSessionId) this.#emitState(state)
    return cloneView(state)
  }

  resolveApproval(sessionId: string, approvalId: string): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    if (state === undefined) return null
    state.pendingApprovals = state.pendingApprovals.filter((item) => item.approvalId !== approvalId)
    if (sessionId === this.#activeSessionId) this.#emitState(state)
    return cloneView(state)
  }

  resolveQuestion(sessionId: string, questionId: string): SessionSyncView | null {
    const state = this.#states.get(sessionId)
    if (state === undefined) return null
    state.pendingQuestions = state.pendingQuestions.filter((item) => item.questionId !== questionId)
    if (sessionId === this.#activeSessionId) this.#emitState(state)
    return cloneView(state)
  }

  #handleSessionEvent(frame: SessionEventFrame): void {
    const globalEvent = globalSyncEvent(frame)
    if (globalEvent !== null) this.emit('global-event', globalEvent)
    const sessionId = frame.session_id
    if (sessionId === '__global__') return
    if (sessionId === undefined || sessionId !== this.#activeSessionId || this.#resyncing.has(sessionId)) return
    const state = this.#states.get(sessionId)
    if (state === undefined) return
    const sideChat = this.#applySideChatEvent(state, frame)
    if (sideChat.matched) {
      const cursor = this.#socket.cursors[sessionId]
      if (cursor !== undefined) state.cursor = { ...cursor }
      if (sideChat.changed) this.#scheduleLiveStateEmission(state)
      return
    }
    if (isAuthoritativeSkillWorkFrame(frame.type)) this.#optimisticSkills.delete(sessionId)
    const workChanged = this.#applySessionWorkChanged(state, frame)
    const usageChanged = this.#applyAgentUsage(state, frame)
    const todosChanged = this.#applyTodoEvent(state, frame)
    if (this.#applyInteractionEvent(state, frame)) {
      const cursor = this.#socket.cursors[sessionId]
      if (cursor !== undefined) state.cursor = { ...cursor }
      this.#scheduleLiveStateEmission(state)
      return
    }
    const result = this.#projector.project(frame)
    const agentsChanged = this.#agentProjector.project(frame)
    if (result.resyncRequired) {
      void this.#resync(sessionId)
      return
    }
    const cursor = this.#socket.cursors[sessionId]
    if (cursor !== undefined) state.cursor = { ...cursor }
    if (!result.changed && !agentsChanged && !workChanged && !usageChanged && !todosChanged) return
    if (result.changed) this.#pendingProjections.add(sessionId)
    if (agentsChanged) state.agents = this.#agentProjector.getRoster(sessionId)
    this.#scheduleLiveStateEmission(state)
  }

  #applySessionWorkChanged(state: SessionSyncView, frame: SessionEventFrame): boolean {
    if (frame.type !== 'event.session.work_changed') return false
    const busy = booleanValue(frame.payload.busy)
    if (busy === null) return false
    let changed = state.busy !== busy
    state.busy = busy
    const mainTurnActive = booleanValue(frame.payload.main_turn_active)
    if (mainTurnActive !== null) {
      changed ||= state.mainTurnActive !== mainTurnActive
      state.mainTurnActive = mainTurnActive
      if (!mainTurnActive) {
        changed ||= state.activePromptId !== null || state.activePromptStatus !== null
        state.activePromptId = null
        state.activePromptStatus = null
      } else if (state.activePromptStatus === null) {
        state.activePromptStatus = 'running'
        changed = true
      }
    }
    return changed
  }

  #applyAgentUsage(state: SessionSyncView, frame: SessionEventFrame): boolean {
    if (frame.type !== 'agent.status.updated') return false
    const payload = frame.payload
    const agentId = typeof payload.agentId === 'string'
      ? payload.agentId
      : typeof payload.agent_id === 'string'
        ? payload.agent_id
        : 'main'
    if (agentId !== 'main') return false
    const total = recordValue(recordValue(payload.usage)?.total)
    const next: SessionUsageView = {
      ...state.usage,
      inputTokens: nonNegativeNumber(total?.inputOther) ?? state.usage.inputTokens,
      outputTokens: nonNegativeNumber(total?.output) ?? state.usage.outputTokens,
      cacheReadTokens: nonNegativeNumber(total?.inputCacheRead) ?? state.usage.cacheReadTokens,
      cacheCreationTokens: nonNegativeNumber(total?.inputCacheCreation) ?? state.usage.cacheCreationTokens,
      contextTokens: nonNegativeNumber(payload.contextTokens) ?? state.usage.contextTokens,
      contextLimit: nonNegativeNumber(payload.maxContextTokens) ?? state.usage.contextLimit
    }
    const changed = Object.entries(next).some(([key, value]) => (
      state.usage[key as keyof SessionUsageView] !== value
    ))
    if (changed) state.usage = next
    return changed
  }

  #applyTodoEvent(state: SessionSyncView, frame: SessionEventFrame): boolean {
    const next = liveTodo(frame)
    if (next === null) return false
    const index = state.todos.findIndex((todo) => todo.todoId === next.todoId)
    if (index < 0) {
      state.todos = [...state.todos, next]
      return true
    }
    const previous = state.todos[index]!
    if (sameTodo(previous, next)) return false
    state.todos = state.todos.map((todo, todoIndex) => todoIndex === index ? next : todo)
    return true
  }

  #applySideChatEvent(state: SessionSyncView, frame: SessionEventFrame): SideChatEventResult {
    const sideChat = state.sideChat
    const projector = this.#sideChatProjector
    if (
      sideChat === null || projector === null || projector.sessionId !== state.sessionId ||
      projector.agentId !== sideChat.agentId || !isSideChatFrame(frame, sideChat)
    ) return { matched: false, changed: false }
    const result = projector.projector.project(frame)
    if (result.resyncRequired) {
      state.sideChat = {
        ...sideChat,
        active: false,
        error: 'Side Chat 的实时历史需要重新打开。'
      }
      return { matched: true, changed: true }
    }
    const projection = projector.projector.getProjection(state.sessionId)
    const next: SessionSideChatView = {
      agentId: sideChat.agentId,
      messages: projection.messages,
      active: projection.active,
      error: null
    }
    const changed = !sameSideChat(sideChat, next)
    if (changed) state.sideChat = next
    return { matched: true, changed }
  }

  #resync(sessionId: string): Promise<void> {
    const existing = this.#resyncing.get(sessionId)
    if (existing !== undefined) return existing
    const operation = this.#performResync(sessionId).finally(() => this.#resyncing.delete(sessionId))
    this.#resyncing.set(sessionId, operation)
    return operation
  }

  async #performResync(sessionId: string): Promise<void> {
    const state = this.#states.get(sessionId)
    if (state === undefined || this.#closed) return
    state.phase = 'resyncing'
    state.resyncCount += 1
    state.error = null
    this.#emitState(state)
    try {
      const [snapshot, transcript] = await Promise.all([
        this.#rest.getSessionSnapshot(sessionId),
        this.#loadTranscriptSupplement(sessionId)
      ])
      if (this.#closed || sessionId !== this.#activeSessionId) return
      const projection = this.#projector.seedSnapshot(sessionId, snapshot)
      this.#optimisticSkills.delete(sessionId)
      const agents = this.#agentProjector.seedSnapshot(sessionId, snapshot)
      const cursor = { seq: snapshot.as_of_seq, epoch: snapshot.epoch }
      this.#socket.setCursor(sessionId, cursor)
      state.title = snapshot.session.title
      state.workspaceRoot = snapshot.session.metadata.cwd
      state.busy = snapshot.session.busy
      state.mainTurnActive = snapshot.session.main_turn_active === true || projection.active
      state.activePromptId = snapshot.in_flight_turn?.current_prompt_id
        ?? snapshot.session.current_prompt_id
        ?? authoritativePromptId(projection.activePromptId)
      state.activePromptStatus = snapshot.in_flight_turn === null ? null : 'running'
      state.cursor = cursor
      state.messages = projection.messages
      state.markers = transcript.markers
      state.todos = transcript.todos
      state.pendingApprovals = snapshot.pending_approvals.map(mapApproval)
      state.pendingQuestions = snapshot.pending_questions.map(mapQuestion)
      state.agents = agents
      state.usage = mapSnapshotUsage(snapshot.session.usage)
      state.hasMoreMessages = snapshot.messages.has_more
      state.unknownEventCount = projection.unknownEventCount
      if (this.#connected) await this.#socket.subscribe([sessionId])
      state.phase = 'ready'
      this.#emitState(state)
    } catch (error) {
      state.phase = 'error'
      state.error = errorMessage(error)
      this.#emitState(state)
    }
  }

  async #loadTranscriptSupplement(sessionId: string): Promise<TranscriptSupplement> {
    if (this.#rest.getSessionTranscript === undefined) return { markers: [], todos: [] }
    try {
      const transcript: SessionTranscript = await this.#rest.getSessionTranscript(sessionId, { pageSize: 50 })
      return {
        markers: transcript.items.flatMap((item) => item.kind === 'marker'
          ? [{
              markerId: item.markerId,
              marker: item.marker,
              payload: item.payload,
              at: item.at ?? null
            }]
          : []),
        todos: transcript.todos.map(mapTodo)
      }
    } catch {
      // Snapshot loading remains usable if an older compatible server omits transcript extras.
      return { markers: [], todos: [] }
    }
  }

  #scheduleReconnect(): void {
    const sessionId = this.#activeSessionId
    if (this.#closed || sessionId === null || this.#reconnectTimer !== null) return
    const state = this.#states.get(sessionId)
    if (state !== undefined) {
      state.phase = 'reconnecting'
      this.#emitState(state)
    }
    const delay = Math.min(30_000, this.#reconnectBaseMs * 2 ** this.#reconnectAttempts)
    this.#reconnectAttempts += 1
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      void this.#reconnect()
    }, delay)
    this.#reconnectTimer.unref()
  }

  async #reconnect(): Promise<void> {
    const sessionId = this.#activeSessionId
    if (this.#closed || sessionId === null) return
    const state = this.#states.get(sessionId)
    const cursor = state?.cursor ?? { seq: 0 }
    try {
      await this.#socket.connect({ subscriptions: [sessionId], cursors: { [sessionId]: cursor } })
      this.#connected = true
      this.#reconnectAttempts = 0
      this.#emitGlobalResync()
      if (state !== undefined) {
        state.phase = 'ready'
        state.error = null
        this.#emitState(state)
      }
    } catch (error) {
      if (state !== undefined) state.error = errorMessage(error)
      this.#scheduleReconnect()
    }
  }

  #applyProjection(state: SessionSyncView, projection: TranscriptProjection): void {
    state.messages = projection.messages
    state.mainTurnActive = projection.active
    state.activePromptId = authoritativePromptId(projection.activePromptId)
    state.activePromptStatus = projection.activePromptId === null
      ? null
      : state.activePromptStatus ?? 'running'
    state.unknownEventCount = projection.unknownEventCount
  }

  #applyInteractionEvent(state: SessionSyncView, frame: SessionEventFrame): boolean {
    const type = frame.type.startsWith('event.') ? frame.type.slice('event.'.length) : frame.type
    if (type === 'approval.requested') {
      const parsed = approvalRequestSchema.safeParse(frame.payload)
      if (!parsed.success) return false
      const approval = mapApproval(parsed.data)
      state.pendingApprovals = [
        ...state.pendingApprovals.filter((item) => item.approvalId !== approval.approvalId),
        approval
      ]
      return true
    }
    if (type === 'approval.resolved' || type === 'approval.expired') {
      const approvalId = recordString(frame.payload, 'approval_id')
      if (approvalId === null) return false
      state.pendingApprovals = state.pendingApprovals.filter((item) => item.approvalId !== approvalId)
      return true
    }
    if (type === 'question.requested') {
      const parsed = questionRequestSchema.safeParse(frame.payload)
      if (!parsed.success) return false
      const question = mapQuestion(parsed.data)
      state.pendingQuestions = [
        ...state.pendingQuestions.filter((item) => item.questionId !== question.questionId),
        question
      ]
      return true
    }
    if (type === 'question.answered' || type === 'question.dismissed') {
      const questionId = recordString(frame.payload, 'question_id')
      if (questionId === null) return false
      state.pendingQuestions = state.pendingQuestions.filter((item) => item.questionId !== questionId)
      return true
    }
    return false
  }

  #emitState(state: SessionSyncView): void {
    this.#applyPendingProjection(state)
    if (this.#pendingLiveState?.sessionId === state.sessionId) this.#cancelLiveStateEmission()
    this.emit('state-changed', cloneView(state))
  }

  #applyPendingProjection(state: SessionSyncView): void {
    if (!this.#pendingProjections.delete(state.sessionId)) return
    this.#applyProjection(state, this.#projector.getProjection(state.sessionId))
  }

  #scheduleLiveStateEmission(state: SessionSyncView): void {
    if (this.#closed || state.sessionId !== this.#activeSessionId) return
    this.#pendingLiveState = state
    if (this.#liveStateTimer !== null) return
    this.#liveStateTimer = setTimeout(() => {
      this.#liveStateTimer = null
      const pending = this.#pendingLiveState
      this.#pendingLiveState = null
      if (pending !== null && !this.#closed && pending.sessionId === this.#activeSessionId) {
        this.#emitState(pending)
      }
    }, LIVE_STATE_EMIT_INTERVAL_MS)
    this.#liveStateTimer.unref()
  }

  #cancelLiveStateEmission(): void {
    if (this.#liveStateTimer !== null) clearTimeout(this.#liveStateTimer)
    this.#liveStateTimer = null
    this.#pendingLiveState = null
  }

  #emitGlobalResync(): void {
    this.emit('global-event', { scope: 'navigation', eventType: 'resync' } satisfies GlobalSyncEvent)
    this.emit('global-event', { scope: 'config', eventType: 'resync' } satisfies GlobalSyncEvent)
  }
}

function globalSyncEvent(frame: SessionEventFrame): GlobalSyncEvent | null {
  if (
    frame.type === 'event.workspace.created' ||
    frame.type === 'event.workspace.updated' ||
    frame.type === 'event.workspace.deleted' ||
    frame.type === 'event.session.created' ||
    frame.type === 'event.session.updated' ||
    frame.type === 'event.session.deleted' ||
    frame.type === 'event.session.work_changed' ||
    frame.type === 'event.session.status_changed' ||
    frame.type === 'session.meta.updated'
  ) return { scope: 'navigation', eventType: frame.type }
  if (frame.type === 'event.config.changed' || frame.type === 'event.model_catalog.changed') {
    return { scope: 'config', eventType: frame.type }
  }
  return null
}

function emptyView(sessionId: string): SessionSyncView {
  return {
    sessionId,
    title: '',
    workspaceRoot: '',
    busy: false,
    mainTurnActive: false,
    activePromptId: null,
    activePromptStatus: null,
    phase: 'idle',
    cursor: null,
    messages: [],
    markers: [],
    todos: [],
    sideChat: null,
    pendingApprovals: [],
    pendingQuestions: [],
    agents: [],
    usage: emptyUsage(),
    hasMoreMessages: false,
    resyncCount: 0,
    unknownEventCount: 0,
    error: null
  }
}

function cloneView(state: SessionSyncView): SessionSyncView {
  return {
    ...state,
    cursor: state.cursor === null ? null : { ...state.cursor },
    messages: state.messages.map((message) => ({
      ...message,
      content: message.content.map((part) => ({ ...part }))
    })),
    markers: state.markers.map((marker) => ({ ...marker })),
    todos: state.todos.map((todo) => ({ ...todo, items: todo.items.map((item) => ({ ...item })) })),
    sideChat: cloneSideChat(state.sideChat),
    pendingApprovals: state.pendingApprovals.map((item) => ({ ...item })),
    pendingQuestions: state.pendingQuestions.map((item) => ({
      ...item,
      questions: item.questions.map((question) => ({
        ...question,
        options: question.options.map((option) => ({ ...option }))
      }))
    })),
    agents: state.agents.map((agent) => ({
      ...agent,
      usage: agent.usage === null ? null : { ...agent.usage }
    })),
    usage: { ...state.usage }
  }
}

function emptyUsage(): SessionUsageView {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    totalCostUsd: null,
    contextTokens: 0,
    contextLimit: 0,
    turnCount: null
  }
}

function mapSnapshotUsage(usage: SessionSnapshot['session']['usage']): SessionUsageView {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_tokens ?? 0,
    cacheCreationTokens: usage.cache_creation_tokens ?? 0,
    totalCostUsd: usage.total_cost_usd ?? null,
    contextTokens: usage.context_tokens,
    contextLimit: usage.context_limit,
    turnCount: usage.turn_count ?? null
  }
}

function recordString(value: unknown, key: string): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' ? candidate : null
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null
}

function mapTodo(todo: SessionTodo): SessionTodoView {
  return {
    todoId: todo.todoId,
    items: todo.items.map((item) => ({ title: item.title, status: item.status })),
    updatedAt: todo.updatedAt ?? null
  }
}

function liveTodo(frame: SessionEventFrame): SessionTodoView | null {
  // 与服务端 hydrate 路径保持一致：实时帧替换同 id 的条目，而不是追加第二条
  const todoId = recordString(frame.payload, 'todoId')
    ?? recordString(frame.payload, 'todo_id')
    ?? 'todo'
  const updatedAt = typeof frame.timestamp === 'string' ? frame.timestamp : null
  const display = recordValue(frame.payload.display)
  if (display?.kind === 'todo_list') {
    const items = parseTodoItems(display.items)
    return items === null ? null : { todoId, items, updatedAt }
  }
  // agent-core-v2 的 TodoList 帧不带 display，全量清单在 args.todos
  if (frame.type === 'tool.call.started' && (frame.payload.name === 'TodoList' || frame.payload.name === 'TodoWrite')) {
    const agentId = recordString(frame.payload, 'agentId') ?? recordString(frame.payload, 'agent_id')
    // 子代理自己的 todo 不覆盖主计划
    if (agentId !== null && agentId !== 'main') return null
    const items = parseTodoItems(recordValue(frame.payload.args)?.todos)
    return items === null ? null : { todoId, items, updatedAt }
  }
  return null
}

function parseTodoItems(value: unknown): SessionTodoItemView[] | null {
  if (!Array.isArray(value)) return null
  const items: SessionTodoItemView[] = []
  for (const item of value) {
    const record = recordValue(item)
    const title = typeof record?.title === 'string' ? record.title : null
    const status = record?.status
    if (title === null || (status !== 'pending' && status !== 'in_progress' && status !== 'done')) return null
    items.push({ title, status })
  }
  return items
}

function sameTodo(left: SessionTodoView, right: SessionTodoView): boolean {
  return left.updatedAt === right.updatedAt &&
    left.items.length === right.items.length &&
    left.items.every((item, index) => (
      item.title === right.items[index]?.title && item.status === right.items[index]?.status
    ))
}

function cloneSideChat(value: SessionSideChatView | null): SessionSideChatView | null {
  if (value === null) return null
  return {
    ...value,
    messages: value.messages.map((message) => ({
      ...message,
      content: message.content.map((part) => ({ ...part }))
    }))
  }
}

function sameSideChat(left: SessionSideChatView, right: SessionSideChatView): boolean {
  if (left.agentId !== right.agentId || left.active !== right.active || left.error !== right.error) return false
  if (left.messages.length !== right.messages.length) return false
  return left.messages.every((message, index) => (
    message.id === right.messages[index]?.id &&
    message.status === right.messages[index]?.status &&
    JSON.stringify(message.content) === JSON.stringify(right.messages[index]?.content)
  ))
}

function isSideChatFrame(frame: SessionEventFrame, sideChat: SessionSideChatView): boolean {
  const agentId = frameAgentId(frame)
  if (agentId !== null) return agentId === sideChat.agentId
  const messageId = recordString(frame.payload, 'message_id') ?? recordString(frame.payload, 'messageId')
  if (messageId !== null && sideChat.messages.some((message) => message.id === messageId)) return true
  const toolCallId = recordString(frame.payload, 'tool_call_id') ?? recordString(frame.payload, 'toolCallId')
  return toolCallId !== null && sideChat.messages.some((message) => message.content.some((part) => (
    part.type === 'tool' && part.toolCallId === toolCallId
  )))
}

function frameAgentId(frame: SessionEventFrame): string | null {
  const direct = recordString(frame.payload, 'agentId') ?? recordString(frame.payload, 'agent_id')
  if (direct !== null) return direct
  const message = recordValue(frame.payload.message)
  const metadata = recordValue(message?.metadata)
  return recordString(message, 'agentId')
    ?? recordString(message, 'agent_id')
    ?? recordString(metadata, 'agentId')
    ?? recordString(metadata, 'agent_id')
}

function isAuthoritativeSkillWorkFrame(type: string): boolean {
  return type === 'turn.started' || type === 'turn.ended' || type === 'event.session.work_changed'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function authoritativePromptId(promptId: string | null): string | null {
  return promptId?.startsWith('local:prompt:') === true ? null : promptId
}

function mapApproval(approval: ApprovalRequest): PendingApprovalView {
  return {
    approvalId: approval.approval_id,
    toolCallId: approval.tool_call_id,
    toolName: approval.tool_name,
    action: approval.action,
    display: interactionPreview(approval.tool_input_display),
    createdAt: timestampString(approval.created_at),
    expiresAt: timestampString(approval.expires_at)
  }
}

function mapQuestion(question: QuestionRequest): PendingQuestionView {
  return {
    questionId: question.question_id,
    toolCallId: question.tool_call_id ?? null,
    questions: question.questions.map((item) => ({
      id: item.id,
      question: item.question,
      ...(item.header === undefined ? {} : { header: item.header }),
      ...(item.body === undefined ? {} : { body: item.body }),
      options: item.options.map((option) => ({
        id: option.id,
        label: option.label,
        ...(option.description === undefined ? {} : { description: option.description }),
        recommended: option.recommended === true || option.is_recommended === true
      })),
      multiSelect: item.multi_select,
      allowOther: item.allow_other,
      ...(item.other_label === undefined ? {} : { otherLabel: item.other_label }),
      ...(item.other_description === undefined ? {} : { otherDescription: item.other_description })
    })),
    createdAt: timestampString(question.created_at)
  }
}

function interactionPreview(value: unknown): string {
  let text: string
  if (typeof value === 'string') text = value
  else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text
}

function timestampString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return ''
}
