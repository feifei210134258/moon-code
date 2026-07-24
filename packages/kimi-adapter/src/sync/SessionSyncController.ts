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

export class SessionSyncController extends EventEmitter {
  readonly #rest: SyncRestClient
  readonly #socket: SyncSocket
  readonly #projector = new TranscriptProjector()
  readonly #agentProjector = new AgentProjector()
  readonly #states = new Map<string, SessionSyncView>()
  readonly #reconnectBaseMs: number
  #activeSessionId: string | null = null
  #connected = false
  #closed = false
  #generation = 0
  #resyncing = new Map<string, Promise<void>>()
  #optimisticSkills = new Map<string, OptimisticSkillState>()
  #reconnectAttempts = 0
  #reconnectTimer: NodeJS.Timeout | null = null

  readonly #onSessionEvent = (frame: SessionEventFrame): void => this.#handleSessionEvent(frame)
  readonly #onResyncRequired = (detail: unknown): void => {
    const sessionId = recordString(detail, 'sessionId')
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
    if (previousSessionId !== null && previousSessionId !== sessionId && this.#connected) {
      try {
        await this.#socket.unsubscribe([previousSessionId])
      } catch {
        // The socket may have closed during a fast session switch. The next
        // hello sends only the current active session, so stale delivery stops.
      }
    }

    const loading = this.#states.get(sessionId) ?? emptyView(sessionId)
    loading.phase = 'loading'
    loading.error = null
    this.#states.set(sessionId, loading)
    this.#emitState(loading)

    try {
      const [snapshot, markers] = await Promise.all([
        this.#rest.getSessionSnapshot(sessionId),
        this.#loadTranscriptMarkers(sessionId)
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
        markers,
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
    this.#socket.off('session-event', this.#onSessionEvent)
    this.#socket.off('resync-required', this.#onResyncRequired)
    this.#socket.off('close', this.#onClose)
    this.#socket.close()
    this.#connected = false
    this.#optimisticSkills.clear()
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
    const sessionId = frame.session_id
    if (sessionId === undefined || sessionId !== this.#activeSessionId || this.#resyncing.has(sessionId)) return
    const state = this.#states.get(sessionId)
    if (state === undefined) return
    if (isAuthoritativeSkillWorkFrame(frame.type)) this.#optimisticSkills.delete(sessionId)
    const workChanged = this.#applySessionWorkChanged(state, frame)
    const usageChanged = this.#applyAgentUsage(state, frame)
    if (this.#applyInteractionEvent(state, frame)) {
      const cursor = this.#socket.cursors[sessionId]
      if (cursor !== undefined) state.cursor = { ...cursor }
      this.#emitState(state)
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
    if (!result.changed && !agentsChanged && !workChanged && !usageChanged) return
    if (result.changed) this.#applyProjection(state, this.#projector.getProjection(sessionId))
    if (agentsChanged) state.agents = this.#agentProjector.getRoster(sessionId)
    this.#emitState(state)
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
      const [snapshot, markers] = await Promise.all([
        this.#rest.getSessionSnapshot(sessionId),
        this.#loadTranscriptMarkers(sessionId)
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
      state.markers = markers
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

  async #loadTranscriptMarkers(sessionId: string): Promise<SessionTranscriptMarkerView[]> {
    if (this.#rest.getSessionTranscript === undefined) return []
    try {
      const transcript: SessionTranscript = await this.#rest.getSessionTranscript(sessionId, { pageSize: 50 })
      return transcript.items.flatMap((item) => item.kind === 'marker'
        ? [{
            markerId: item.markerId,
            marker: item.marker,
            payload: item.payload,
            at: item.at ?? null
          }]
        : [])
    } catch {
      // Snapshot loading remains usable if an older compatible server omits transcript markers.
      return []
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
    this.emit('state-changed', cloneView(state))
  }
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
