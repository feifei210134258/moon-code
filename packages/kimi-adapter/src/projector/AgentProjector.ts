import type { SessionSnapshot, SnapshotSubagent } from '../wire/schemas.js'
import type { SessionEventFrame } from '../wire/ws.js'

const MAIN_AGENT_ID = 'main'
const MAX_AGENT_TEXT = 4_000

export interface AgentUsageView {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  contextTokens: number | null
}

export interface AgentRosterItem {
  id: string
  role: 'main' | 'subagent'
  name: string
  description: string
  status: 'idle' | 'queued' | 'working' | 'suspended' | 'completed' | 'failed' | 'cancelled'
  subagentType: string | null
  parentAgentId: string | null
  parentToolCallId: string | null
  swarmIndex: number | null
  /** kimi 0.39 Tower：主 agent 为 true 时处于协调者角色；worker（tower-worker profile）为 false。 */
  towerMode: boolean | null
  runInBackground: boolean
  model: string | null
  thinkingEffort: string | null
  createdAt: string | null
  startedAt: string | null
  completedAt: string | null
  suspendedReason: string | null
  outputPreview: string | null
  usage: AgentUsageView | null
}

export class AgentProjector {
  readonly #sessions = new Map<string, Map<string, AgentRosterItem>>()

  seedSnapshot(sessionId: string, snapshot: SessionSnapshot): AgentRosterItem[] {
    const roster = new Map<string, AgentRosterItem>()
    const main = mainAgent(snapshot.session.main_turn_active === true ? 'working' : 'idle')
    main.model = snapshot.session.agent_config.model
    roster.set(MAIN_AGENT_ID, main)
    for (const task of snapshot.subagents ?? []) {
      if (task.kind !== 'subagent' || task.run_in_background === true) continue
      roster.set(task.agent_id ?? task.id, mapSnapshotSubagent(task))
    }
    this.#sessions.set(sessionId, roster)
    return this.getRoster(sessionId)
  }

  project(frame: SessionEventFrame): boolean {
    const sessionId = frame.session_id
    if (sessionId === undefined) return false
    const roster = this.#getOrCreate(sessionId)
    const payload = frame.payload
    switch (frame.type) {
      case 'subagent.spawned': {
        if (payload.runInBackground === true) return false
        const id = stringValue(payload.subagentId)
        if (id === null) return false
        roster.set(id, {
          id,
          role: 'subagent',
          name: stringValue(payload.subagentName) ?? 'Subagent',
          description: previewText(payload.description) ?? previewText(payload.subagentName) ?? 'Subagent',
          status: 'queued',
          subagentType: stringValue(payload.subagentName),
          parentAgentId: stringValue(payload.parentAgentId) ?? stringValue(payload.callerAgentId),
          parentToolCallId: stringValue(payload.parentToolCallId),
          swarmIndex: numberValue(payload.swarmIndex),
          towerMode: null,
          runInBackground: false,
          model: stringValue(payload.model),
          thinkingEffort: stringValue(payload.thinkingEffort),
          createdAt: frame.timestamp,
          startedAt: null,
          completedAt: null,
          suspendedReason: null,
          outputPreview: null,
          usage: null
        })
        return true
      }
      case 'subagent.started':
        return patchSubagent(roster, payload, (agent) => {
          agent.status = 'working'
          agent.startedAt ??= frame.timestamp
          agent.suspendedReason = null
        })
      case 'subagent.suspended':
        return patchSubagent(roster, payload, (agent) => {
          agent.status = 'suspended'
          agent.suspendedReason = stringValue(payload.reason)
        })
      case 'subagent.completed':
        return patchSubagent(roster, payload, (agent) => {
          agent.status = 'completed'
          agent.completedAt = frame.timestamp
          agent.outputPreview = previewText(payload.resultSummary)
          agent.usage = mapUsage(payload.usage, payload.contextTokens)
        })
      case 'subagent.failed':
        return patchSubagent(roster, payload, (agent) => {
          agent.status = 'failed'
          agent.completedAt = frame.timestamp
          agent.outputPreview = previewText(payload.error)
        })
      case 'turn.started': {
        if (!isMainAgentFrame(payload)) return false
        for (const [id, agent] of roster) {
          if (id !== MAIN_AGENT_ID && !agent.runInBackground) roster.delete(id)
        }
        const main = roster.get(MAIN_AGENT_ID) ?? mainAgent('idle')
        main.status = 'working'
        main.startedAt = frame.timestamp
        main.completedAt = null
        roster.set(MAIN_AGENT_ID, main)
        return true
      }
      case 'turn.ended': {
        if (!isMainAgentFrame(payload)) return false
        const main = roster.get(MAIN_AGENT_ID) ?? mainAgent('idle')
        const reason = stringValue(payload.reason)
        main.status = reason === 'failed' || reason === 'blocked'
          ? 'failed'
          : reason === 'cancelled'
            ? 'cancelled'
            : 'completed'
        main.completedAt = frame.timestamp
        roster.set(MAIN_AGENT_ID, main)
        if (reason !== null && reason !== 'completed') {
          for (const agent of roster.values()) {
            if (agent.role !== 'subagent' || !isLiveSubagent(agent.status)) continue
            agent.status = 'failed'
            agent.completedAt = frame.timestamp
            agent.outputPreview ??= `Main turn ${reason}`
          }
        }
        return true
      }
      case 'task.started': {
        const info = recordValue(payload.info)
        if (info?.kind !== 'agent' || info.detached !== true) return false
        const agentId = stringValue(info.agentId)
        return agentId === null ? false : roster.delete(agentId)
      }
      case 'agent.status.updated': {
        const id = stringValue(payload.agentId) ?? stringValue(payload.agent_id) ?? MAIN_AGENT_ID
        if (id !== MAIN_AGENT_ID) return false
        const agent = roster.get(id)
        if (agent === undefined) return false
        const contextTokens = numberValue(payload.contextTokens) ?? numberValue(payload.context_tokens)
        const model = stringValue(payload.model)
        const thinkingEffort = stringValue(payload.thinkingEffort)
        // kimi 0.39：tower_mode.enter/exit 事件会附带 towerMode 状态更新。
        const towerMode = typeof payload.towerMode === 'boolean' ? payload.towerMode : null
        if (contextTokens === null && model === null && thinkingEffort === null && towerMode === null) return false
        if (contextTokens !== null) {
          agent.usage = {
            inputTokens: agent.usage?.inputTokens ?? 0,
            outputTokens: agent.usage?.outputTokens ?? 0,
            cacheReadTokens: agent.usage?.cacheReadTokens ?? 0,
            cacheCreationTokens: agent.usage?.cacheCreationTokens ?? 0,
            contextTokens
          }
        }
        if (model !== null) agent.model = model
        if (thinkingEffort !== null) agent.thinkingEffort = thinkingEffort
        if (towerMode !== null) agent.towerMode = towerMode
        return true
      }
      case 'agent.created':
      case 'agent.disposed':
        return false
      default:
        return false
    }
  }

  getRoster(sessionId: string): AgentRosterItem[] {
    const roster = this.#sessions.get(sessionId)
    if (roster === undefined) return []
    return [...roster.values()]
      .sort((left, right) => {
        if (left.role !== right.role) return left.role === 'main' ? -1 : 1
        return (left.swarmIndex ?? Number.MAX_SAFE_INTEGER) - (right.swarmIndex ?? Number.MAX_SAFE_INTEGER)
      })
      .map(cloneAgent)
  }

  #getOrCreate(sessionId: string): Map<string, AgentRosterItem> {
    const existing = this.#sessions.get(sessionId)
    if (existing !== undefined) return existing
    const roster = new Map<string, AgentRosterItem>([[MAIN_AGENT_ID, mainAgent('idle')]])
    this.#sessions.set(sessionId, roster)
    return roster
  }
}

function mainAgent(status: AgentRosterItem['status']): AgentRosterItem {
  return {
    id: MAIN_AGENT_ID,
    role: 'main',
    name: 'Kimi',
    description: '当前会话的主 Agent',
    status,
    subagentType: null,
    parentAgentId: null,
    parentToolCallId: null,
    swarmIndex: null,
    towerMode: null,
    runInBackground: false,
    model: null,
    thinkingEffort: null,
    createdAt: null,
    startedAt: null,
    completedAt: null,
    suspendedReason: null,
    outputPreview: null,
    usage: null
  }
}

function mapSnapshotSubagent(task: SnapshotSubagent): AgentRosterItem {
  return {
    // 0.37.2+ 快照 task 携带 agent_id；有则用 agent_id 作为 roster 键，保证与
    // 实时事件（subagentId）同键，缺失时回退 task.id。
    id: task.agent_id ?? task.id,
    role: 'subagent',
    name: task.subagent_type ?? 'Subagent',
    description: previewText(task.description) ?? '',
    status: snapshotStatus(task),
    subagentType: task.subagent_type ?? null,
    parentAgentId: null,
    parentToolCallId: task.parent_tool_call_id ?? null,
    swarmIndex: task.swarm_index ?? null,
    towerMode: null,
    runInBackground: task.run_in_background === true,
    model: task.model ?? null,
    thinkingEffort: task.thinking_effort ?? null,
    createdAt: timestampValue(task.created_at),
    startedAt: timestampValue(task.started_at),
    completedAt: timestampValue(task.completed_at),
    suspendedReason: previewText(task.suspended_reason),
    outputPreview: previewText(task.output_preview),
    usage: null
  }
}

function snapshotStatus(task: SnapshotSubagent): AgentRosterItem['status'] {
  if (task.subagent_phase !== undefined) return task.subagent_phase
  return task.status === 'running' ? 'working' : task.status
}

function isLiveSubagent(status: AgentRosterItem['status']): boolean {
  return status === 'queued' || status === 'working' || status === 'suspended'
}

function patchSubagent(
  roster: Map<string, AgentRosterItem>,
  payload: Record<string, unknown>,
  patch: (agent: AgentRosterItem) => void
): boolean {
  const id = stringValue(payload.subagentId)
  if (id === null) return false
  const agent = roster.get(id)
  if (agent === undefined) return false
  patch(agent)
  roster.set(id, agent)
  return true
}

function mapUsage(raw: unknown, rawContextTokens: unknown): AgentUsageView | null {
  const usage = recordValue(raw)
  const contextTokens = numberValue(rawContextTokens)
  if (usage === null && contextTokens === null) return null
  return {
    inputTokens: numberValue(usage?.inputOther) ?? 0,
    outputTokens: numberValue(usage?.output) ?? 0,
    cacheReadTokens: numberValue(usage?.inputCacheRead) ?? 0,
    cacheCreationTokens: numberValue(usage?.inputCacheCreation) ?? 0,
    contextTokens
  }
}

function isMainAgentFrame(payload: Record<string, unknown>): boolean {
  return (stringValue(payload.agentId) ?? stringValue(payload.agent_id) ?? MAIN_AGENT_ID) === MAIN_AGENT_ID
}

function cloneAgent(agent: AgentRosterItem): AgentRosterItem {
  return { ...agent, usage: agent.usage === null ? null : { ...agent.usage } }
}

function timestampValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function previewText(value: unknown): string | null {
  const text = stringValue(value)
  if (text === null) return null
  return text.length > MAX_AGENT_TEXT ? `${text.slice(0, MAX_AGENT_TEXT)}…` : text
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
