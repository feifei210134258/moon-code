import type { SessionEventFrame } from '../wire/ws.js'

export type PendingInteraction = 'none' | 'approval' | 'question'
export type LastTurnReason = 'completed' | 'cancelled' | 'failed'

export interface SessionView {
  id: string
  workspaceId: string | null
  title: string
  updatedAt: string | null
  busy: boolean
  mainTurnActive: boolean
  pendingInteraction: PendingInteraction
  lastTurnReason: LastTurnReason | null
  lastPrompt: string | null
}

export interface SessionProjectionState {
  sessions: Map<string, SessionView>
  unknownEventCount: number
}

interface RawSession {
  id?: unknown
  workspace_id?: unknown
  title?: unknown
  updated_at?: unknown
  busy?: unknown
  main_turn_active?: unknown
  pending_interaction?: unknown
  last_turn_reason?: unknown
  last_prompt?: unknown
}

export function createSessionProjectionState(): SessionProjectionState {
  return { sessions: new Map(), unknownEventCount: 0 }
}

export function projectSessionEvent(state: SessionProjectionState, frame: SessionEventFrame): void {
  const payload = frame.payload
  switch (payload.type) {
    case 'event.session.created': {
      const raw = payload.session as RawSession | undefined
      if (raw === undefined || typeof raw.id !== 'string') return
      state.sessions.set(raw.id, {
        id: raw.id,
        workspaceId: typeof raw.workspace_id === 'string' ? raw.workspace_id : null,
        title: typeof raw.title === 'string' ? raw.title : '',
        updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : null,
        busy: raw.busy === true,
        mainTurnActive: raw.main_turn_active === true,
        pendingInteraction: isPendingInteraction(raw.pending_interaction) ? raw.pending_interaction : 'none',
        lastTurnReason: isLastTurnReason(raw.last_turn_reason) ? raw.last_turn_reason : null,
        lastPrompt: typeof raw.last_prompt === 'string' ? raw.last_prompt : null
      })
      return
    }
    case 'event.session.work_changed': {
      updateSession(state, frame.session_id, (session) => {
        session.busy = payload.busy === true
        if (typeof payload.main_turn_active === 'boolean') session.mainTurnActive = payload.main_turn_active
        if (isPendingInteraction(payload.pending_interaction)) {
          session.pendingInteraction = payload.pending_interaction
        }
        if (isLastTurnReason(payload.last_turn_reason)) session.lastTurnReason = payload.last_turn_reason
      })
      return
    }
    case 'event.session.status_changed': {
      updateSession(state, frame.session_id, (session) => {
        if (payload.status === 'running') {
          session.busy = true
          session.mainTurnActive = true
          session.pendingInteraction = 'none'
        } else if (payload.status === 'awaiting_approval') {
          session.busy = true
          session.pendingInteraction = 'approval'
        } else if (payload.status === 'awaiting_question') {
          session.busy = true
          session.pendingInteraction = 'question'
        } else {
          session.busy = false
          session.mainTurnActive = false
          session.pendingInteraction = 'none'
        }
      })
      return
    }
    case 'session.meta.updated': {
      updateSession(state, frame.session_id, (session) => {
        if (typeof payload.title === 'string') session.title = payload.title
        session.updatedAt = frame.timestamp
      })
      return
    }
    // 0.37.2+ 新增的全局事件：已知但与会话视图无关，不计入未知事件
    case 'event.plugin.changed':
    case 'event.capability.changed':
      return
    default:
      state.unknownEventCount += 1
  }
}

function updateSession(
  state: SessionProjectionState,
  sessionId: string | undefined,
  updater: (session: SessionView) => void
): void {
  if (sessionId === undefined) return
  const session = state.sessions.get(sessionId)
  if (session !== undefined) updater(session)
}

function isPendingInteraction(value: unknown): value is PendingInteraction {
  return value === 'none' || value === 'approval' || value === 'question'
}

function isLastTurnReason(value: unknown): value is LastTurnReason {
  return value === 'completed' || value === 'cancelled' || value === 'failed'
}
