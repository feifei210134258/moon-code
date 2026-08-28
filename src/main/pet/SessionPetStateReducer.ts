import type { SessionEventFrame } from '../../../packages/kimi-adapter/src/wire/ws.js'
import type { PetRosterState, PetSessionState, PetVisualState } from '../../shared/contracts.js'

export interface PetWorkspaceFact {
  id: string
  name: string
}

export interface PetSessionFact {
  id: string
  workspaceId: string
  title: string
  busy: boolean
  mainTurnActive: boolean
  pendingInteraction: 'none' | 'approval' | 'question'
  lastTurnReason: 'completed' | 'cancelled' | 'failed' | null
  updatedAt: string | null
}

interface TrackedPetSession extends PetSessionFact {
  firstSeenBusyAt: number | null
  completedUntil: number | null
  retainUntil: number | null
  unread: boolean
  tracked: boolean
}

export interface SessionPetStateReducerOptions {
  now?: () => number
  completedDurationMs?: number
  retentionDurationMs?: number
  maxVisible?: number
}

const DEFAULT_COMPLETED_DURATION_MS = 6_000
const DEFAULT_RETENTION_DURATION_MS = 5 * 60_000
const DEFAULT_MAX_VISIBLE = 5

export class SessionPetStateReducer {
  readonly #now: () => number
  readonly #completedDurationMs: number
  readonly #retentionDurationMs: number
  readonly #maxVisible: number
  readonly #workspaces = new Map<string, string>()
  readonly #sessions = new Map<string, TrackedPetSession>()
  #serverId: string | null = null
  #connected = false
  #viewedSessionId: string | null = null

  constructor(options: SessionPetStateReducerOptions = {}) {
    this.#now = options.now ?? Date.now
    this.#completedDurationMs = options.completedDurationMs ?? DEFAULT_COMPLETED_DURATION_MS
    this.#retentionDurationMs = options.retentionDurationMs ?? DEFAULT_RETENTION_DURATION_MS
    this.#maxVisible = options.maxVisible ?? DEFAULT_MAX_VISIBLE
  }

  get trackedSessionIds(): string[] {
    const tracked = [...this.#sessions.values()]
      .filter((session) => session.tracked)
      .map((session) => session.id)
    if (tracked.length > 0) return tracked
    const fallback = this.#latestSession()
    return fallback === null ? [] : [fallback.id]
  }

  reset(serverId: string | null): void {
    this.#serverId = serverId
    this.#connected = false
    this.#workspaces.clear()
    this.#sessions.clear()
    this.#viewedSessionId = null
  }

  setConnected(connected: boolean): void {
    this.#connected = connected
  }

  seed(workspaces: PetWorkspaceFact[], sessions: PetSessionFact[]): void {
    const now = this.#now()
    this.#workspaces.clear()
    for (const workspace of workspaces) this.#workspaces.set(workspace.id, workspace.name)

    const seen = new Set<string>()
    for (const fact of sessions) {
      seen.add(fact.id)
      const existing = this.#sessions.get(fact.id)
      if (existing === undefined) {
        const initiallyTrack = fact.busy || fact.pendingInteraction !== 'none'
        this.#sessions.set(fact.id, {
          ...fact,
          firstSeenBusyAt: fact.busy ? now : null,
          completedUntil: null,
          retainUntil: initiallyTrack ? now + this.#retentionDurationMs : null,
          unread: false,
          tracked: initiallyTrack
        })
      } else {
        this.#applyFact(existing, fact, now)
      }
    }

    for (const [sessionId, session] of this.#sessions) {
      if (!seen.has(sessionId)) this.#sessions.delete(sessionId)
      else this.#expireTracking(session, now)
    }
  }

  applyEvent(frame: SessionEventFrame): boolean {
    const sessionId = frame.session_id
    if (sessionId === undefined) return false
    const session = this.#sessions.get(sessionId)
    if (session === undefined) return false

    const now = this.#now()
    const payload = frame.payload
    if (payload.type === 'event.session.work_changed') {
      this.#applyFact(session, {
        ...session,
        busy: payload.busy === true,
        mainTurnActive: typeof payload.main_turn_active === 'boolean'
          ? payload.main_turn_active
          : session.mainTurnActive,
        pendingInteraction: isPendingInteraction(payload.pending_interaction)
          ? payload.pending_interaction
          : session.pendingInteraction,
        lastTurnReason: isLastTurnReason(payload.last_turn_reason)
          ? payload.last_turn_reason
          : session.lastTurnReason,
        updatedAt: frame.timestamp
      }, now)
      return true
    }
    if (payload.type === 'event.session.status_changed') {
      const status = payload.status
      this.#applyFact(session, {
        ...session,
        busy: status === 'running' || status === 'awaiting_approval' || status === 'awaiting_question',
        mainTurnActive: status === 'running',
        pendingInteraction: status === 'awaiting_approval'
          ? 'approval'
          : status === 'awaiting_question'
            ? 'question'
            : 'none',
        updatedAt: frame.timestamp
      }, now)
      return true
    }
    if (
      payload.type === 'turn.started' &&
      isMainAgentFrame(payload)
    ) {
      this.#applyFact(session, {
        ...session,
        busy: true,
        mainTurnActive: true,
        pendingInteraction: 'none',
        lastTurnReason: null,
        updatedAt: frame.timestamp
      }, now)
      return true
    }
    if (
      (payload.type === 'turn.ended' ||
        payload.type === 'prompt.completed' ||
        payload.type === 'prompt.aborted') &&
      isMainAgentFrame(payload)
    ) {
      this.#applyFact(session, {
        ...session,
        busy: false,
        mainTurnActive: false,
        pendingInteraction: 'none',
        lastTurnReason: terminalReason(payload.type, payload.reason),
        updatedAt: frame.timestamp
      }, now)
      return true
    }
    if (payload.type === 'session.meta.updated') {
      if (typeof payload.title === 'string') session.title = payload.title
      session.updatedAt = frame.timestamp
      return true
    }
    return false
  }

  markViewed(sessionId: string): void {
    this.#viewedSessionId = sessionId
    const session = this.#sessions.get(sessionId)
    if (session === undefined) return
    session.unread = false
    const now = this.#now()
    if (!session.busy && session.pendingInteraction === 'none' && session.completedUntil === null) {
      session.retainUntil = Math.min(session.retainUntil ?? now + 20_000, now + 20_000)
    }
  }

  getRoster(): PetRosterState {
    const now = this.#now()
    for (const session of this.#sessions.values()) this.#expireTracking(session, now)

    let candidates = [...this.#sessions.values()]
      .filter((session) => session.tracked)
      .map((session) => this.#toPublicState(session, now))
      .sort(comparePetPriority)
    if (candidates.length === 0) {
      const fallback = this.#latestSession()
      if (fallback !== null) candidates = [this.#toPublicState(fallback, now)]
    }
    const items = candidates.slice(0, this.#maxVisible).map((item) => ({ ...item }))
    const overflow = Math.max(0, candidates.length - items.length)
    if (overflow > 0 && items.length > 0) items[items.length - 1]!.overflowCount = overflow + 1
    return {
      connected: this.#connected,
      items,
      overflow,
      updatedAt: new Date(now).toISOString()
    }
  }

  #applyFact(session: TrackedPetSession, fact: PetSessionFact, now: number): void {
    const wasBusy = session.busy
    const wasPending = session.pendingInteraction !== 'none'
    const becameFailed = fact.lastTurnReason === 'failed' && session.lastTurnReason !== 'failed'
    const completed = wasBusy && !fact.busy && fact.lastTurnReason === 'completed'

    Object.assign(session, fact)

    if (fact.busy || fact.pendingInteraction !== 'none') {
      session.tracked = true
      session.retainUntil = now + this.#retentionDurationMs
      if (!wasBusy) session.firstSeenBusyAt = now
    }
    if (completed) {
      session.tracked = true
      session.completedUntil = now + this.#completedDurationMs
      session.retainUntil = now + this.#retentionDurationMs
      session.unread = this.#viewedSessionId !== session.id
    } else if (becameFailed) {
      session.tracked = true
      session.completedUntil = null
      session.retainUntil = now + this.#retentionDurationMs
      session.unread = this.#viewedSessionId !== session.id
    } else if (wasPending && fact.pendingInteraction === 'none' && !fact.busy) {
      session.retainUntil = now + this.#retentionDurationMs
    }
  }

  #expireTracking(session: TrackedPetSession, now: number): void {
    if (session.completedUntil !== null && session.completedUntil <= now) session.completedUntil = null
    if (
      !session.busy &&
      session.pendingInteraction === 'none' &&
      !session.unread &&
      session.retainUntil !== null &&
      session.retainUntil <= now
    ) {
      session.tracked = false
    }
  }

  #toPublicState(session: TrackedPetSession, now: number): PetSessionState {
    const status = this.#statusFor(session, now)
    return {
      serverId: this.#serverId ?? '',
      workspaceId: session.workspaceId,
      workspaceName: this.#workspaces.get(session.workspaceId) ?? '未命名项目',
      sessionId: session.id,
      title: session.title || '未命名任务',
      status,
      pendingInteraction: session.pendingInteraction,
      backgroundActivity: session.busy && !session.mainTurnActive,
      unread: session.unread,
      startedAt: session.firstSeenBusyAt === null ? null : new Date(session.firstSeenBusyAt).toISOString(),
      updatedAt: session.updatedAt,
      latestTool: null,
      overflowCount: 0
    }
  }

  #latestSession(): TrackedPetSession | null {
    let latest: TrackedPetSession | null = null
    let latestTime = Number.NEGATIVE_INFINITY
    for (const session of this.#sessions.values()) {
      const timestamp = session.updatedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(session.updatedAt)
      const time = Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
      if (latest === null || time > latestTime) {
        latest = session
        latestTime = time
      }
    }
    return latest
  }

  #statusFor(session: TrackedPetSession, now: number): PetVisualState {
    if (!this.#connected) return 'disconnected'
    if (session.pendingInteraction !== 'none') return 'waiting'
    // 0.39 的 busy 是“任意 agent 持有活动 turn 或后台 lease”：dev server、
    // 后台 Bash 都会让它持续为 true。主 turn 已结束时（lastTurnReason 已
    // 置为 completed/failed），完成/失败态必须优先于 running 展示，否则
    // 任务明明完成了、宠物却因为一个挂着的服务一直保持动态，用户无从
    // 察觉任务已结束。纯后台活动（主 turn 从未开始/已结束很久）由
    // backgroundActivity 字段单独表达。
    const mainTurnOver = !session.mainTurnActive && session.lastTurnReason !== null
    if (!mainTurnOver && session.busy) return 'running'
    if (session.lastTurnReason === 'failed' && (session.unread || !mainTurnOver)) return 'failed'
    if (session.completedUntil !== null && session.completedUntil > now) return 'completed'
    if (session.unread) return 'review'
    return 'idle'
  }
}

const PET_PRIORITY: Record<PetVisualState, number> = {
  disconnected: 7,
  waiting: 6,
  failed: 5,
  running: 4,
  completed: 3,
  review: 2,
  idle: 1
}

function comparePetPriority(left: PetSessionState, right: PetSessionState): number {
  const priority = PET_PRIORITY[right.status] - PET_PRIORITY[left.status]
  if (priority !== 0) return priority
  const leftUpdated = left.updatedAt === null ? 0 : Date.parse(left.updatedAt)
  const rightUpdated = right.updatedAt === null ? 0 : Date.parse(right.updatedAt)
  return (Number.isFinite(rightUpdated) ? rightUpdated : 0) - (Number.isFinite(leftUpdated) ? leftUpdated : 0)
}

function isPendingInteraction(value: unknown): value is PetSessionFact['pendingInteraction'] {
  return value === 'none' || value === 'approval' || value === 'question'
}

function isLastTurnReason(value: unknown): value is PetSessionFact['lastTurnReason'] {
  return value === 'completed' || value === 'cancelled' || value === 'failed'
}

function isMainAgentFrame(payload: Record<string, unknown>): boolean {
  const agentId = typeof payload.agentId === 'string'
    ? payload.agentId
    : typeof payload.agent_id === 'string'
      ? payload.agent_id
      : 'main'
  return agentId === 'main'
}

function terminalReason(
  type: unknown,
  reason: unknown
): PetSessionFact['lastTurnReason'] {
  if (type === 'prompt.aborted' || reason === 'cancelled') return 'cancelled'
  if (reason === 'failed' || reason === 'blocked') return 'failed'
  return 'completed'
}
