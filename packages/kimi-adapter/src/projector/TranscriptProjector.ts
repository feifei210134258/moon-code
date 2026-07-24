import type {
  InFlightTurn,
  MessageContentPart,
  SessionMessage,
  SessionSnapshot
} from '../wire/schemas.js'
import type { SessionEventFrame } from '../wire/ws.js'

const MAIN_AGENT_ID = 'main'
const IGNORED_AGENT_ID = '__non_main__'
const MAX_TOOL_PREVIEW = 4_000

export type TranscriptPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool'
      toolCallId: string
      toolName: string
      state: 'running' | 'done' | 'error'
      description?: string
      inputPreview?: string
      outputPreview?: string
      outputStream?: 'stdout' | 'stderr' | 'mixed'
      progress?: number
      toolDiff?: {
        path: string
        before: string
        after: string
        hunks: number | null
      }
    }
  | { type: 'file'; fileId: string; name: string; mediaType: string; size: number }
  | {
      type: 'media'
      mediaType: 'image' | 'video'
      sourceKind: string
      fileId: string | null
      sourceUrl: string | null
      sourceMediaType: string | null
      base64Data: string | null
    }
  | { type: 'unknown'; rawType: string }

export interface TranscriptMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: TranscriptPart[]
  createdAt: string
  promptId: string | null
  status: 'pending' | 'completed' | 'error'
  agentId?: string
  originKind?: string
  originTaskId?: string
}

export interface TranscriptProjection {
  sessionId: string
  messages: TranscriptMessage[]
  active: boolean
  activePromptId: string | null
  unknownEventCount: number
}

export interface TranscriptProjectionResult {
  changed: boolean
  resyncRequired: boolean
  reason?: 'delta_gap' | 'history_rewrite'
}

interface ProjectorSessionState {
  messages: TranscriptMessage[]
  currentAssistantMessageId: string | null
  currentPromptId: string | null
  turnPromptIds: Map<number, string>
  streamOffsets: Map<string, { text: number; thinking: number }>
  streamSources: Map<string, 'raw' | 'durable'>
  pendingRawBySlot: Map<string, string>
  terminalTools: Map<string, ToolTerminalState>
  retryTarget: { messageId: string; turnId: number | null; step: number | null; stepId: string | null } | null
  nonMainMessageIds: Set<string>
  nonMainToolCallIds: Set<string>
  hiddenMessageIds: Set<string>
  sanitizedMessageIds: Set<string>
  active: boolean
  unknownEventCount: number
  syntheticId: number
}

interface ToolTerminalState {
  state: 'done' | 'error'
  outputPreview?: string
  outputStream?: 'stdout' | 'stderr' | 'mixed'
  progress: number
}

export class TranscriptProjector {
  readonly #sessions = new Map<string, ProjectorSessionState>()
  readonly #targetAgentId: string

  constructor(targetAgentId = MAIN_AGENT_ID) {
    this.#targetAgentId = targetAgentId
  }

  reset(sessionId: string): void {
    this.#sessions.set(sessionId, createState())
  }

  seedSnapshot(sessionId: string, snapshot: SessionSnapshot): TranscriptProjection {
    const state = createState()
    for (const rawMessage of snapshot.messages.items) {
      const message = projectMessage(rawMessage)
      if (message === null) {
        state.hiddenMessageIds.add(rawMessage.id)
        continue
      }
      if (isSanitizedSlashMessage(rawMessage)) state.sanitizedMessageIds.add(rawMessage.id)
      if (message.agentId !== undefined && message.agentId !== this.#targetAgentId) {
        rememberNonMainMessage(state, message)
      } else {
        rememberTerminalTools(state, message.content)
        state.messages.push(message)
      }
    }
    for (const message of state.messages) applyTerminalTools(state, message.content)
    state.active = snapshot.session.main_turn_active === true
    this.#sessions.set(sessionId, state)
    if (snapshot.in_flight_turn !== null) this.#seedInFlight(state, sessionId, snapshot.in_flight_turn)
    return this.getProjection(sessionId)
  }

  getProjection(sessionId: string): TranscriptProjection {
    const state = this.#getOrCreate(sessionId)
    const messages = state.messages.map(cloneMessage)
    reconcileToolMessages(messages)
    return {
      sessionId,
      messages,
      active: state.active,
      activePromptId: state.currentPromptId,
      unknownEventCount: state.unknownEventCount
    }
  }

  project(frame: SessionEventFrame): TranscriptProjectionResult {
    const sessionId = frame.session_id
    if (sessionId === undefined) return { changed: false, resyncRequired: false }
    const state = this.#getOrCreate(sessionId)
    const payload = frame.payload
    const agentId = transcriptFrameAgentId(frame.type, payload, state)
    if (agentId !== null && agentId !== this.#targetAgentId && isMainTranscriptFrame(frame.type)) {
      rememberNonMainFrame(frame.type, payload, state)
      return { changed: false, resyncRequired: false }
    }

    switch (frame.type) {
      case 'event.message.created': {
        const message = parseWireMessage(payload.message)
        if (message === null) return this.#unknown(state)
        const projected = projectMessage(message)
        if (projected === null) {
          state.hiddenMessageIds.add(message.id)
          return { changed: false, resyncRequired: false }
        }
        if (isSanitizedSlashMessage(message)) state.sanitizedMessageIds.add(message.id)
        rememberTerminalTools(state, projected.content)
        applyTerminalTools(state, projected.content)
        this.#adoptDurableAssistant(state, projected)
        upsertMessage(state.messages, projected)
        return changed()
      }
      case 'event.message.updated': {
        const messageId = stringValue(payload.message_id)
        if (messageId === null || !Array.isArray(payload.content)) return this.#unknown(state)
        if (state.hiddenMessageIds.has(messageId)) return { changed: false, resyncRequired: false }
        const message = state.messages.find((item) => item.id === messageId)
        if (message === undefined) return { changed: false, resyncRequired: true, reason: 'history_rewrite' }
        if (!state.sanitizedMessageIds.has(messageId)) {
          message.content = payload.content.map((part) => projectContentPart(asPart(part)))
        }
        rememberTerminalTools(state, message.content)
        applyTerminalTools(state, message.content)
        message.status = payload.status === 'error' ? 'error' : payload.status === 'pending' ? 'pending' : 'completed'
        if (message.role === 'assistant') {
          markDurableContentStreams(state, message)
        }
        return changed()
      }
      case 'event.assistant.delta': {
        const messageId = stringValue(payload.message_id)
        const contentIndex = numberValue(payload.content_index)
        const delta = recordValue(payload.delta)
        if (messageId === null || contentIndex === null || delta === null) return this.#unknown(state)
        const message = state.messages.find((item) => item.id === messageId)
        if (message === undefined) return { changed: false, resyncRequired: true, reason: 'history_rewrite' }
        const textDelta = stringValue(delta.text)
        const thinkingDelta = stringValue(delta.thinking)
        const kind = textDelta !== null ? 'text' : thinkingDelta !== null ? 'thinking' : null
        const value = textDelta ?? thinkingDelta
        if (kind === null || value === null || value.length === 0) return { changed: false, resyncRequired: false }
        if (state.retryTarget?.messageId === message.id) state.retryTarget = null
        const sourceKey = streamSourceKey(message.id, kind)
        const existing = message.content[contentIndex]
        if (existing === undefined && contentIndex === message.content.length) {
          message.content.push({ type: kind, text: value })
          getStreamOffsets(state, message.id)[kind] = contentStreamLengths(message)[kind]
          state.streamSources.set(sourceKey, 'durable')
          return changed()
        }
        if (existing?.type !== kind) return { changed: false, resyncRequired: true, reason: 'history_rewrite' }
        const rawSlotKey = streamSlotKey(message.id, kind, contentIndex)
        const pendingRaw = state.pendingRawBySlot.get(rawSlotKey) ?? ''
        const reconciled = reconcileDurableDelta(existing.text, pendingRaw, value)
        const nextText = reconciled.text
        const didChange = nextText !== existing.text
        existing.text = nextText
        if (reconciled.pendingRaw.length === 0) state.pendingRawBySlot.delete(rawSlotKey)
        else state.pendingRawBySlot.set(rawSlotKey, reconciled.pendingRaw)
        getStreamOffsets(state, message.id)[kind] = contentStreamLengths(message)[kind]
        state.streamSources.set(sourceKey, 'durable')
        return didChange ? changed() : { changed: false, resyncRequired: false }
      }
      case 'event.session.history_compacted': {
        const reason = stringValue(payload.reason)
        if (reason === 'auto_compact' || reason === 'manual_compact') return changed()
        return { changed: false, resyncRequired: true, reason: 'history_rewrite' }
      }
      case 'prompt.submitted': {
        const promptId = stringValue(payload.promptId)
        const userMessageId = stringValue(payload.userMessageId)
        if (promptId === null || userMessageId === null || !Array.isArray(payload.content)) {
          return this.#unknown(state)
        }
        state.currentPromptId = promptId
        upsertMessage(state.messages, {
          id: userMessageId,
          sessionId,
          role: 'user',
          content: payload.content.map((part) => projectContentPart(asPart(part))),
          createdAt: timestampValue(payload.createdAt, frame.timestamp),
          promptId,
          status: payload.status === 'queued' || payload.status === 'blocked' ? 'pending' : 'completed'
        })
        return changed()
      }
      case 'turn.started': {
        const turnId = numberValue(payload.turnId)
        const promptId = state.currentPromptId ?? this.#syntheticId(state, 'prompt')
        state.currentPromptId = promptId
        if (turnId !== null) state.turnPromptIds.set(turnId, promptId)
        state.active = true
        return changed()
      }
      case 'turn.step.started': {
        const turnId = numberValue(payload.turnId)
        const promptId = (turnId === null ? null : state.turnPromptIds.get(turnId))
          ?? state.currentPromptId
          ?? this.#syntheticId(state, 'prompt')
        state.currentPromptId = promptId
        if (turnId !== null) state.turnPromptIds.set(turnId, promptId)
        if (retryMatches(state.retryTarget, payload)) {
          const retryMessage = state.messages.find((message) => message.id === state.retryTarget?.messageId)
          state.retryTarget = null
          if (retryMessage !== undefined) {
            retryMessage.status = 'pending'
            state.currentAssistantMessageId = retryMessage.id
            resetStreamOffsets(state, retryMessage.id)
            return changed()
          }
        }
        state.retryTarget = null
        const message: TranscriptMessage = {
          id: this.#syntheticId(state, 'assistant'),
          sessionId,
          role: 'assistant',
          content: [],
          createdAt: frame.timestamp,
          promptId,
          status: 'pending'
        }
        state.messages.push(message)
        state.currentAssistantMessageId = message.id
        resetStreamOffsets(state, message.id)
        return changed()
      }
      case 'thinking.delta':
        return this.#appendDelta(state, 'thinking', payload, frame.offset)
      case 'assistant.delta':
        return this.#appendDelta(state, 'text', payload, frame.offset)
      case 'tool.use':
      case 'tool.call.started': {
        const message = currentAssistant(state)
        const toolCallId = stringValue(payload.toolCallId)
        if (message === null || toolCallId === null) return this.#unknown(state)
        const toolName = previewLabel(payload.name, 160) ?? previewLabel(payload.toolName, 160) ?? 'tool'
        const existing = findTool(state.messages, toolCallId)
        const presentation = toolPresentation(payload.display)
        const description = previewLabel(payload.description) ?? presentationDescription(presentation)
        if (existing === null) {
          message.content.push({
            type: 'tool',
            toolCallId,
            toolName,
            state: 'running',
            ...optionalString('description', description),
            ...optionalPreview('inputPreview', payload.args ?? payload.input),
            ...optionalToolDiff(presentation)
          })
        } else {
          existing.toolName = toolName
          if (existing.state === 'running') existing.state = 'running'
          if (description !== undefined) existing.description = description
          const input = previewValue(payload.args ?? payload.input)
          if (input !== undefined) existing.inputPreview = input
          const diff = toolDiffPresentation(presentation)
          if (diff !== undefined) existing.toolDiff = diff
        }
        return changed()
      }
      case 'tool.call.delta':
        return { changed: false, resyncRequired: false }
      case 'tool.progress': {
        const toolCallId = stringValue(payload.toolCallId)
        const tool = toolCallId === null ? null : findTool(state.messages, toolCallId)
        if (tool === null) return { changed: false, resyncRequired: false }
        const update = recordValue(payload.update)
        const next = stringValue(update?.text)
          ?? stringValue(update?.message)
          ?? stringValue(payload.chunk)
          ?? stringValue(payload.output)
          ?? stringValue(payload.message)
        const percent = numberValue(update?.percent) ?? numberValue(payload.progress)
        let didChange = false
        if (next !== null && next.length > 0) {
          tool.outputPreview = appendPreview(tool.outputPreview, next)
          const stream = progressStream(update?.kind ?? payload.stream)
          if (stream !== undefined) tool.outputStream = mergeOutputStream(tool.outputStream, stream)
          didChange = true
        }
        if (percent !== null) {
          tool.progress = clampPercent(percent)
          didChange = true
        }
        return didChange ? changed() : { changed: false, resyncRequired: false }
      }
      case 'tool.result': {
        const toolCallId = stringValue(payload.toolCallId)
        if (toolCallId === null) return this.#unknown(state)
        const existing = findTool(state.messages, toolCallId)
        const isError = payload.isError === true
        const outputPreview = previewValue(payload.output)
        if (existing !== null) {
          const terminal: ToolTerminalState = {
            state: isError ? 'error' : 'done',
            progress: 100,
            ...(outputPreview === undefined ? {} : { outputPreview }),
            ...(existing.outputStream === undefined ? {} : { outputStream: existing.outputStream })
          }
          state.terminalTools.set(toolCallId, terminal)
          applyTerminalTool(existing, terminal)
        } else {
          state.messages.push({
            id: this.#syntheticId(state, 'tool'),
            sessionId,
            role: 'tool',
            content: [{
              type: 'tool',
              toolCallId,
              toolName: previewLabel(payload.name, 160) ?? 'tool',
              state: isError ? 'error' : 'done',
              progress: 100,
              ...(outputPreview === undefined ? {} : { outputPreview })
            }],
            createdAt: frame.timestamp,
            promptId: state.currentPromptId,
            status: isError ? 'error' : 'completed'
          })
          state.terminalTools.set(toolCallId, {
            state: isError ? 'error' : 'done',
            progress: 100,
            ...(outputPreview === undefined ? {} : { outputPreview })
          })
        }
        return changed()
      }
      case 'event.tool.output': {
        const toolCallId = stringValue(payload.tool_call_id)
        const chunk = stringValue(payload.chunk)
        const tool = toolCallId === null ? null : findTool(state.messages, toolCallId)
        if (tool === null || chunk === null || chunk.length === 0) return { changed: false, resyncRequired: false }
        tool.outputPreview = appendPreview(tool.outputPreview, chunk)
        const stream = progressStream(payload.stream)
        if (stream !== undefined) tool.outputStream = mergeOutputStream(tool.outputStream, stream)
        return changed()
      }
      case 'event.tool.progress': {
        const toolCallId = stringValue(payload.tool_call_id)
        const tool = toolCallId === null ? null : findTool(state.messages, toolCallId)
        if (tool === null) return { changed: false, resyncRequired: false }
        const message = stringValue(payload.message)
        const progress = numberValue(payload.progress)
        let didChange = false
        if (message !== null && message.length > 0) {
          tool.outputPreview = appendPreview(tool.outputPreview, message)
          tool.outputStream = mergeOutputStream(tool.outputStream, 'stdout')
          didChange = true
        }
        if (progress !== null) {
          tool.progress = clampPercent(progress)
          didChange = true
        }
        return didChange ? changed() : { changed: false, resyncRequired: false }
      }
      case 'event.assistant.tool_use_started':
      case 'event.assistant.tool_use_delta':
      case 'event.assistant.tool_use_completed':
      case 'event.assistant.completed':
      case 'event.tool.started':
      case 'event.tool.completed':
        return { changed: false, resyncRequired: false }
      case 'turn.step.retrying': {
        const message = currentAssistant(state)
        if (message !== null) {
          message.content = message.content.filter((part) =>
            part.type !== 'text' && part.type !== 'thinking' && part.type !== 'tool'
          )
          message.status = 'pending'
          state.retryTarget = {
            messageId: message.id,
            turnId: numberValue(payload.turnId),
            step: numberValue(payload.step),
            stepId: stringValue(payload.stepId)
          }
          resetStreamOffsets(state, message.id)
        }
        return message === null ? { changed: false, resyncRequired: false } : changed()
      }
      case 'turn.step.completed': {
        const message = currentAssistant(state)
        if (message !== null) message.status = 'completed'
        state.retryTarget = null
        return changed()
      }
      case 'turn.step.interrupted': {
        const message = currentAssistant(state)
        if (message !== null) message.status = 'error'
        state.currentAssistantMessageId = null
        state.retryTarget = null
        return changed()
      }
      case 'turn.ended': {
        const message = currentAssistant(state)
        const reason = stringValue(payload.reason)
        if (message !== null) message.status = reason === 'failed' || reason === 'blocked' ? 'error' : 'completed'
        state.currentAssistantMessageId = null
        state.currentPromptId = null
        state.retryTarget = null
        state.active = false
        return changed()
      }
      case 'session.meta.updated':
      case 'agent.status.updated':
      case 'event.session.work_changed':
      case 'event.session.status_changed':
      case 'prompt.completed':
      case 'prompt.aborted': {
        const promptId = stringValue(payload.promptId)
        if (promptId !== null && promptId === state.currentPromptId) {
          state.currentPromptId = null
          if (frame.type === 'prompt.aborted' || payload.reason === 'blocked') state.active = false
          return changed()
        }
        return { changed: false, resyncRequired: false }
      }
      case 'ping':
      case 'hook.result':
      case 'compaction.blocked':
      case 'mcp.server.status':
      case 'skill.activated':
      case 'tool.list.updated':
      case 'subagent.spawned':
      case 'subagent.started':
      case 'subagent.suspended':
      case 'subagent.completed':
      case 'subagent.failed':
      case 'agent.created':
      case 'agent.disposed':
        return { changed: false, resyncRequired: false }
      default:
        return this.#unknown(state)
    }
  }

  #seedInFlight(state: ProjectorSessionState, sessionId: string, turn: InFlightTurn): void {
    const promptId = turn.current_prompt_id ?? this.#syntheticId(state, 'prompt')
    state.currentPromptId = promptId
    state.turnPromptIds.set(turn.turn_id, promptId)
    const content: TranscriptPart[] = []
    if (turn.thinking_text.length > 0) content.push({ type: 'thinking', text: turn.thinking_text })
    if (turn.assistant_text.length > 0) content.push({ type: 'text', text: turn.assistant_text })
    for (const tool of turn.running_tools) {
      const presentation = toolPresentation(tool.display)
      content.push({
        type: 'tool',
        toolCallId: tool.tool_call_id,
        toolName: previewLabel(tool.name, 160) ?? 'tool',
        state: 'running',
        ...optionalString('description', previewLabel(tool.description) ?? presentationDescription(presentation)),
        ...optionalPreview('inputPreview', tool.args),
        ...optionalPreview('outputPreview', tool.last_progress?.text),
        ...optionalToolDiff(presentation),
        ...(tool.last_progress?.percent === undefined ? {} : { progress: clampPercent(tool.last_progress.percent) }),
        ...(progressStream(tool.last_progress?.kind) === undefined
          ? {}
          : { outputStream: progressStream(tool.last_progress?.kind) as 'stdout' | 'stderr' })
      })
    }
    const message: TranscriptMessage = {
      id: `inflight:${sessionId}:${turn.turn_id}`,
      sessionId,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      promptId,
      status: 'pending'
    }
    state.messages.push(message)
    state.currentAssistantMessageId = message.id
    state.streamOffsets.set(message.id, {
      text: turn.assistant_text.length,
      thinking: turn.thinking_text.length
    })
    state.active = true
  }

  #appendDelta(
    state: ProjectorSessionState,
    kind: 'text' | 'thinking',
    payload: Record<string, unknown>,
    offset: number | undefined
  ): TranscriptProjectionResult {
    const message = currentAssistant(state)
    const delta = stringValue(payload.delta)
    if (message === null || delta === null || delta.length === 0) return this.#unknown(state)
    if (state.retryTarget?.messageId === message.id) {
      if (!retryDeltaMatches(state.retryTarget, payload)) return { changed: false, resyncRequired: false }
      state.retryTarget = null
    }
    const sourceKey = streamSourceKey(message.id, kind)
    if (state.streamSources.get(sourceKey) === 'durable') return { changed: false, resyncRequired: false }
    const offsets = getStreamOffsets(state, message.id)
    const localLength = offsets[kind]
    if (offset !== undefined && offset < localLength) return { changed: false, resyncRequired: false }
    if (offset !== undefined && offset > localLength) {
      return { changed: false, resyncRequired: true, reason: 'delta_gap' }
    }
    const last = message.content.at(-1)
    let contentIndex: number
    if (last?.type === kind) {
      last.text += delta
      contentIndex = message.content.length - 1
    } else {
      message.content.push({ type: kind, text: delta })
      contentIndex = message.content.length - 1
    }
    const rawSlotKey = streamSlotKey(message.id, kind, contentIndex)
    state.pendingRawBySlot.set(rawSlotKey, `${state.pendingRawBySlot.get(rawSlotKey) ?? ''}${delta}`)
    offsets[kind] = localLength + delta.length
    state.streamSources.set(sourceKey, 'raw')
    return changed()
  }

  #adoptDurableAssistant(state: ProjectorSessionState, message: TranscriptMessage): void {
    if (message.role !== 'assistant') return
    const currentId = state.currentAssistantMessageId
    if (currentId !== null && isSyntheticMessageId(currentId)) {
      const current = state.messages.find((item) => item.id === currentId)
      if (current !== undefined && shouldAdoptDurableAssistant(current, message)) {
        const durableContent = message.content.map((part) => ({ ...part }))
        const merged = mergeSyntheticAssistantContent(current.content, durableContent)
        message.content = merged.content
        transferRawSlots(state, currentId, message.id, merged.syntheticIndexMap)
        for (const match of merged.streamMatches) {
          const part = message.content[match.mergedIndex]
          const durablePart = durableContent[match.durableIndex]
          if (
            (part?.type !== 'text' && part?.type !== 'thinking') ||
            durablePart?.type !== part.type
          ) continue
          const slotKey = streamSlotKey(message.id, part.type, match.mergedIndex)
          const reconciled = reconcileDurableSnapshot(
            part.text,
            state.pendingRawBySlot.get(slotKey) ?? '',
            durablePart.text
          )
          part.text = reconciled.text
          if (reconciled.pendingRaw.length === 0) state.pendingRawBySlot.delete(slotKey)
          else state.pendingRawBySlot.set(slotKey, reconciled.pendingRaw)
        }
        state.messages = state.messages.filter((item) => item.id !== currentId)
        state.currentAssistantMessageId = message.id
        state.streamOffsets.delete(currentId)
        transferStreamSource(state, currentId, message.id, 'text')
        transferStreamSource(state, currentId, message.id, 'thinking')
        if (state.retryTarget?.messageId === currentId) state.retryTarget.messageId = message.id
        state.streamOffsets.set(message.id, contentStreamLengths(message))
        for (const kind of durableStreamKinds(durableContent)) {
          state.streamSources.set(streamSourceKey(message.id, kind), 'durable')
        }
        return
      }
    }
    markDurableContentStreams(state, message)
  }

  #unknown(state: ProjectorSessionState): TranscriptProjectionResult {
    state.unknownEventCount += 1
    return { changed: false, resyncRequired: false }
  }

  #syntheticId(state: ProjectorSessionState, kind: string): string {
    state.syntheticId += 1
    return `local:${kind}:${state.syntheticId}`
  }

  #getOrCreate(sessionId: string): ProjectorSessionState {
    const existing = this.#sessions.get(sessionId)
    if (existing !== undefined) return existing
    const state = createState()
    this.#sessions.set(sessionId, state)
    return state
  }
}

function createState(): ProjectorSessionState {
  return {
    messages: [],
    currentAssistantMessageId: null,
    currentPromptId: null,
    turnPromptIds: new Map(),
    streamOffsets: new Map(),
    streamSources: new Map(),
    pendingRawBySlot: new Map(),
    terminalTools: new Map(),
    retryTarget: null,
    nonMainMessageIds: new Set(),
    nonMainToolCallIds: new Set(),
    hiddenMessageIds: new Set(),
    sanitizedMessageIds: new Set(),
    active: false,
    unknownEventCount: 0,
    syntheticId: 0
  }
}

function projectMessage(message: SessionMessage): TranscriptMessage | null {
  const agentId = stringValue(message.metadata?.agentId) ?? stringValue(message.metadata?.agent_id)
  const origin = recordValue(message.metadata?.origin)
  const originKind = stringValue(origin?.kind)
  const originTaskId = stringValue(origin?.taskId) ?? stringValue(origin?.task_id)
  const content = projectDisplayableMessageContent(message)
  if (content === null) return null
  return {
    id: message.id,
    sessionId: message.session_id,
    role: message.role,
    content,
    createdAt: timestampValue(message.created_at),
    promptId: message.prompt_id ?? null,
    status: 'completed',
    ...(agentId === null ? {} : { agentId }),
    ...(originKind === null ? {} : { originKind }),
    ...(originTaskId === null ? {} : { originTaskId })
  }
}

function projectDisplayableMessageContent(message: SessionMessage): TranscriptPart[] | null {
  if (message.role !== 'user') return message.content.map(projectContentPart)
  const origin = recordValue(message.metadata?.origin)
  const kind = stringValue(origin?.kind)
  if (kind === null || kind === 'user' || kind === 'cron' || kind === 'compaction') {
    return message.content.map(projectContentPart)
  }
  if (origin?.trigger !== 'user-slash') return null
  if (kind === 'skill_activation') {
    const skillName = stringValue(origin.skillName)
    if (skillName === null) return null
    return [{ type: 'text', text: slashCommandText(skillName, stringValue(origin.skillArgs)) }]
  }
  if (kind === 'plugin_command') {
    const pluginId = stringValue(origin.pluginId)
    const commandName = stringValue(origin.commandName)
    if (pluginId === null || commandName === null) return null
    return [{ type: 'text', text: slashCommandText(`${pluginId}:${commandName}`, stringValue(origin.commandArgs)) }]
  }
  return null
}

function isSanitizedSlashMessage(message: SessionMessage): boolean {
  if (message.role !== 'user') return false
  const origin = recordValue(message.metadata?.origin)
  return origin?.trigger === 'user-slash'
    && (origin.kind === 'skill_activation' || origin.kind === 'plugin_command')
}

function slashCommandText(name: string, args: string | null): string {
  const command = `/${name.replace(/[\r\n]/g, '')}`
  return args === null || args.length === 0 ? command : `${command} ${args}`
}

function projectContentPart(part: MessageContentPart): TranscriptPart {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: stringValue(part.text) ?? '' }
    case 'thinking':
      return { type: 'thinking', text: stringValue(part.thinking) ?? '' }
    case 'tool_use':
      return {
        type: 'tool',
        toolCallId: stringValue(part.tool_call_id) ?? 'unknown',
        toolName: previewLabel(part.tool_name, 160) ?? 'tool',
        state: 'running',
        ...optionalPreview('inputPreview', part.input)
      }
    case 'tool_result':
      return {
        type: 'tool',
        toolCallId: stringValue(part.tool_call_id) ?? 'unknown',
        toolName: 'tool',
        state: part.is_error === true ? 'error' : 'done',
        progress: 100,
        ...optionalPreview('outputPreview', part.output)
      }
    case 'file':
      return {
        type: 'file',
        fileId: stringValue(part.file_id) ?? '',
        name: stringValue(part.name) ?? '未命名文件',
        mediaType: stringValue(part.media_type) ?? 'application/octet-stream',
        size: numberValue(part.size) ?? 0
      }
    case 'image':
    case 'video': {
      const source = recordValue(part.source)
      return {
        type: 'media',
        mediaType: part.type,
        sourceKind: stringValue(source?.kind) ?? 'unknown',
        fileId: stringValue(source?.file_id),
        sourceUrl: stringValue(source?.url),
        sourceMediaType: stringValue(source?.media_type),
        base64Data: stringValue(source?.data)
      }
    }
    default:
      return { type: 'unknown', rawType: part.type }
  }
}

function parseWireMessage(value: unknown): SessionMessage | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const id = stringValue(raw.id)
  const sessionId = stringValue(raw.session_id)
  const role = raw.role
  if (
    id === null ||
    sessionId === null ||
    (role !== 'user' && role !== 'assistant' && role !== 'tool' && role !== 'system') ||
    !Array.isArray(raw.content)
  ) return null
  return {
    id,
    session_id: sessionId,
    role,
    content: raw.content.map(asPart),
    created_at: raw.created_at,
    ...(stringValue(raw.prompt_id) === null ? {} : { prompt_id: stringValue(raw.prompt_id) as string }),
    ...(stringValue(raw.parent_message_id) === null
      ? {}
      : { parent_message_id: stringValue(raw.parent_message_id) as string }),
    ...(recordValue(raw.metadata) === null ? {} : { metadata: recordValue(raw.metadata) as Record<string, unknown> })
  }
}

function asPart(value: unknown): MessageContentPart {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    return { ...record, type: stringValue(record.type) ?? 'unknown' }
  }
  return { type: 'unknown' }
}

function currentAssistant(state: ProjectorSessionState): TranscriptMessage | null {
  if (state.currentAssistantMessageId === null) return null
  return state.messages.find((message) => message.id === state.currentAssistantMessageId) ?? null
}

function streamSourceKey(messageId: string, kind: 'text' | 'thinking'): string {
  return `${messageId}:${kind}`
}

function streamSlotKey(messageId: string, kind: 'text' | 'thinking', contentIndex: number): string {
  return `${messageId}\u0000${kind}\u0000${contentIndex}`
}

function getStreamOffsets(
  state: ProjectorSessionState,
  messageId: string
): { text: number; thinking: number } {
  const existing = state.streamOffsets.get(messageId)
  if (existing !== undefined) return existing
  const offsets = { text: 0, thinking: 0 }
  state.streamOffsets.set(messageId, offsets)
  return offsets
}

function resetStreamOffsets(state: ProjectorSessionState, messageId: string): void {
  state.streamOffsets.set(messageId, { text: 0, thinking: 0 })
  state.streamSources.delete(streamSourceKey(messageId, 'text'))
  state.streamSources.delete(streamSourceKey(messageId, 'thinking'))
  clearRawSlots(state, messageId)
}

function markDurableContentStreams(state: ProjectorSessionState, message: TranscriptMessage): void {
  const lengths = contentStreamLengths(message)
  state.streamOffsets.set(message.id, lengths)
  clearRawSlots(state, message.id)
  if (lengths.text > 0) state.streamSources.set(streamSourceKey(message.id, 'text'), 'durable')
  if (lengths.thinking > 0) state.streamSources.set(streamSourceKey(message.id, 'thinking'), 'durable')
}

function clearRawSlots(state: ProjectorSessionState, messageId: string): void {
  const prefix = `${messageId}\u0000`
  for (const key of state.pendingRawBySlot.keys()) {
    if (key.startsWith(prefix)) state.pendingRawBySlot.delete(key)
  }
}

function transferRawSlots(
  state: ProjectorSessionState,
  fromMessageId: string,
  toMessageId: string,
  syntheticIndexMap: Map<number, number>
): void {
  const prefix = `${fromMessageId}\u0000`
  for (const [key, value] of [...state.pendingRawBySlot.entries()]) {
    if (!key.startsWith(prefix)) continue
    state.pendingRawBySlot.delete(key)
    const [kind, rawIndex] = key.slice(prefix.length).split('\u0000')
    const mergedIndex = syntheticIndexMap.get(Number(rawIndex))
    if ((kind !== 'text' && kind !== 'thinking') || mergedIndex === undefined) continue
    state.pendingRawBySlot.set(streamSlotKey(toMessageId, kind, mergedIndex), value)
  }
}

function transferStreamSource(
  state: ProjectorSessionState,
  fromMessageId: string,
  toMessageId: string,
  kind: 'text' | 'thinking'
): void {
  const fromKey = streamSourceKey(fromMessageId, kind)
  const source = state.streamSources.get(fromKey)
  state.streamSources.delete(fromKey)
  if (source !== undefined) state.streamSources.set(streamSourceKey(toMessageId, kind), source)
}

function reconcileDurableDelta(
  current: string,
  pendingRaw: string,
  incoming: string
): { text: string; pendingRaw: string } {
  if (pendingRaw.length === 0) return { text: `${current}${incoming}`, pendingRaw: '' }
  if (pendingRaw.startsWith(incoming)) {
    return { text: current, pendingRaw: pendingRaw.slice(incoming.length) }
  }
  if (incoming.startsWith(pendingRaw)) {
    return { text: `${current}${incoming.slice(pendingRaw.length)}`, pendingRaw: '' }
  }
  const stable = current.endsWith(pendingRaw) ? current.slice(0, -pendingRaw.length) : current
  return { text: `${stable}${incoming}`, pendingRaw: '' }
}

function reconcileDurableSnapshot(
  current: string,
  pendingRaw: string,
  durable: string
): { text: string; pendingRaw: string } {
  if (pendingRaw.length === 0 || !current.endsWith(pendingRaw)) return { text: durable, pendingRaw: '' }
  const stable = current.slice(0, -pendingRaw.length)
  if (!durable.startsWith(stable)) return { text: durable, pendingRaw: '' }
  const coveredRaw = durable.slice(stable.length)
  if (pendingRaw.startsWith(coveredRaw)) {
    return { text: current, pendingRaw: pendingRaw.slice(coveredRaw.length) }
  }
  if (coveredRaw.startsWith(pendingRaw)) return { text: durable, pendingRaw: '' }
  return { text: durable, pendingRaw: '' }
}

function durableStreamKinds(content: TranscriptPart[]): Array<'text' | 'thinking'> {
  const kinds = new Set<'text' | 'thinking'>()
  for (const part of content) {
    if (part.type === 'text' || part.type === 'thinking') kinds.add(part.type)
  }
  return [...kinds]
}

function shouldAdoptDurableAssistant(current: TranscriptMessage, durable: TranscriptMessage): boolean {
  if (current.promptId !== null && durable.promptId !== null && current.promptId !== durable.promptId) return false
  if (assistantContentOverlaps(current.content, durable.content)) return true
  if (
    current.promptId !== null &&
    current.promptId === durable.promptId &&
    current.content.length === 0 &&
    Date.parse(durable.createdAt) >= Date.parse(current.createdAt)
  ) return true
  return false
}

function assistantContentOverlaps(current: TranscriptPart[], durable: TranscriptPart[]): boolean {
  const currentToolIds = new Set(current.flatMap((part) => part.type === 'tool' ? [part.toolCallId] : []))
  if (durable.some((part) => part.type === 'tool' && currentToolIds.has(part.toolCallId))) return true
  return durable.some((durablePart) => current.some((currentPart) =>
    (durablePart.type === 'text' || durablePart.type === 'thinking') &&
    currentPart.type === durablePart.type &&
    (durablePart.text.startsWith(currentPart.text) || currentPart.text.startsWith(durablePart.text))
  ))
}

function mergeSyntheticAssistantContent(
  synthetic: TranscriptPart[],
  durable: TranscriptPart[]
): {
    content: TranscriptPart[]
    streamMatches: Array<{ durableIndex: number; mergedIndex: number }>
    syntheticIndexMap: Map<number, number>
  } {
  const matches: Array<{ syntheticIndex: number; durableIndex: number }> = []
  let syntheticCursor = 0
  for (const [durableIndex, durablePart] of durable.entries()) {
    const syntheticIndex = synthetic.findIndex((part, index) =>
      index >= syntheticCursor && assistantPartsMatch(part, durablePart)
    )
    if (syntheticIndex === -1) continue
    matches.push({ syntheticIndex, durableIndex })
    syntheticCursor = syntheticIndex + 1
  }

  const content: TranscriptPart[] = []
  const streamMatches: Array<{ durableIndex: number; mergedIndex: number }> = []
  const syntheticIndexMap = new Map<number, number>()
  let nextSynthetic = 0
  let nextDurable = 0
  const appendSynthetic = (index: number): void => {
    const part = synthetic[index]
    if (part === undefined) return
    syntheticIndexMap.set(index, content.length)
    content.push({ ...part })
  }
  const appendDurable = (index: number): void => {
    const part = durable[index]
    if (part !== undefined) content.push({ ...part })
  }

  for (const match of matches) {
    while (nextSynthetic < match.syntheticIndex) {
      appendSynthetic(nextSynthetic)
      nextSynthetic += 1
    }
    while (nextDurable < match.durableIndex) {
      appendDurable(nextDurable)
      nextDurable += 1
    }
    const syntheticPart = synthetic[match.syntheticIndex]
    const durablePart = durable[match.durableIndex]
    const mergedIndex = content.length
    if (syntheticPart === undefined || durablePart === undefined) continue
    const mergedPart = { ...syntheticPart }
    if (mergedPart.type === 'tool' && durablePart.type === 'tool') {
      mergeToolCall(mergedPart, durablePart)
      mergeToolResult(mergedPart, durablePart)
    } else if (
      (mergedPart.type === 'text' || mergedPart.type === 'thinking') &&
      durablePart.type === mergedPart.type
    ) {
      streamMatches.push({ durableIndex: match.durableIndex, mergedIndex })
    }
    syntheticIndexMap.set(match.syntheticIndex, mergedIndex)
    content.push(mergedPart)
    nextSynthetic = match.syntheticIndex + 1
    nextDurable = match.durableIndex + 1
  }
  while (nextSynthetic < synthetic.length) {
    appendSynthetic(nextSynthetic)
    nextSynthetic += 1
  }
  while (nextDurable < durable.length) {
    appendDurable(nextDurable)
    nextDurable += 1
  }
  return { content, streamMatches, syntheticIndexMap }
}

function assistantPartsMatch(synthetic: TranscriptPart, durable: TranscriptPart): boolean {
  if (synthetic.type === 'tool' && durable.type === 'tool') return synthetic.toolCallId === durable.toolCallId
  if (
    (synthetic.type === 'text' || synthetic.type === 'thinking') &&
    durable.type === synthetic.type
  ) return durable.text.startsWith(synthetic.text) || synthetic.text.startsWith(durable.text)
  return false
}

function contentStreamLengths(message: TranscriptMessage): { text: number; thinking: number } {
  let text = 0
  let thinking = 0
  for (const part of message.content) {
    if (part.type === 'text') text += part.text.length
    else if (part.type === 'thinking') thinking += part.text.length
  }
  return { text, thinking }
}

function retryMatches(
  target: ProjectorSessionState['retryTarget'],
  payload: Record<string, unknown>
): boolean {
  if (target === null) return false
  const turnId = numberValue(payload.turnId)
  const step = numberValue(payload.step)
  const stepId = stringValue(payload.stepId)
  if (target.turnId !== null && turnId !== target.turnId) return false
  if (target.stepId !== null && stepId !== null) return stepId === target.stepId
  return target.step === null || step === target.step
}

function retryDeltaMatches(
  target: NonNullable<ProjectorSessionState['retryTarget']>,
  payload: Record<string, unknown>
): boolean {
  const turnId = numberValue(payload.turnId)
  return target.turnId === null || turnId === target.turnId
}

function findTool(messages: TranscriptMessage[], toolCallId: string): Extract<TranscriptPart, { type: 'tool' }> | null {
  const owner = findToolOwner(messages, toolCallId)
  if (owner === null) return null
  for (let partIndex = owner.content.length - 1; partIndex >= 0; partIndex -= 1) {
    const part = owner.content[partIndex]
    if (part?.type === 'tool' && part.toolCallId === toolCallId) return part
  }
  return null
}

function findToolOwner(messages: TranscriptMessage[], toolCallId: string): TranscriptMessage | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]
    if (message === undefined) continue
    if (message.content.some((part) => part.type === 'tool' && part.toolCallId === toolCallId)) return message
  }
  return null
}

type ToolPart = Extract<TranscriptPart, { type: 'tool' }>

function rememberTerminalTools(state: ProjectorSessionState, content: TranscriptPart[]): void {
  for (const part of content) {
    if (part.type !== 'tool' || part.state === 'running') continue
    state.terminalTools.set(part.toolCallId, {
      state: part.state,
      progress: part.progress ?? 100,
      ...(part.outputPreview === undefined ? {} : { outputPreview: part.outputPreview }),
      ...(part.outputStream === undefined ? {} : { outputStream: part.outputStream })
    })
  }
}

function applyTerminalTools(state: ProjectorSessionState, content: TranscriptPart[]): void {
  for (const part of content) {
    if (part.type !== 'tool') continue
    const terminal = state.terminalTools.get(part.toolCallId)
    if (terminal !== undefined) applyTerminalTool(part, terminal)
  }
}

function applyTerminalTool(tool: ToolPart, terminal: ToolTerminalState): void {
  tool.state = terminal.state
  tool.progress = terminal.progress
  if (terminal.outputPreview === undefined) delete tool.outputPreview
  else tool.outputPreview = terminal.outputPreview
  if (terminal.outputStream !== undefined) tool.outputStream = terminal.outputStream
}

function reconcileToolMessages(messages: TranscriptMessage[]): void {
  const tools = new Map<string, { part: ToolPart; message: TranscriptMessage }>()
  const removed = new Set<TranscriptPart>()
  for (const message of messages) {
    for (const part of message.content) {
      if (part.type !== 'tool') continue
      const previous = tools.get(part.toolCallId)
      if (previous === undefined) {
        tools.set(part.toolCallId, { part, message })
        continue
      }
      const previousIsResult = isToolResultPart(previous.part)
      const currentIsResult = isToolResultPart(part)
      if (currentIsResult && !previousIsResult) {
        mergeToolResult(previous.part, part)
        removed.add(part)
      } else if (previousIsResult && !currentIsResult) {
        mergeToolResult(part, previous.part)
        mergeToolCall(part, previous.part)
        removed.add(previous.part)
        tools.set(part.toolCallId, { part, message })
      } else if (preferCurrentToolMessage(previous.message, message)) {
        mergeToolResult(part, previous.part)
        mergeToolCall(part, previous.part)
        removed.add(previous.part)
        tools.set(part.toolCallId, { part, message })
      } else {
        mergeToolResult(previous.part, part)
        mergeToolCall(previous.part, part)
        removed.add(part)
      }
    }
  }
  if (removed.size === 0) return
  for (const message of messages) message.content = message.content.filter((part) => !removed.has(part))
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'tool' && messages[index]?.content.length === 0) messages.splice(index, 1)
  }
}

function preferCurrentToolMessage(previous: TranscriptMessage, current: TranscriptMessage): boolean {
  return isSyntheticMessageId(previous.id) && !isSyntheticMessageId(current.id)
}

function isSyntheticMessageId(messageId: string): boolean {
  return messageId.startsWith('local:') || messageId.startsWith('inflight:')
}

function isToolResultPart(part: ToolPart): boolean {
  return part.state !== 'running' && part.inputPreview === undefined
}

function mergeToolResult(target: ToolPart, result: ToolPart): void {
  if (result.state !== 'running') target.state = result.state
  if (result.outputPreview !== undefined) target.outputPreview = result.outputPreview
  if (result.outputStream !== undefined) target.outputStream = mergeOutputStream(target.outputStream, result.outputStream)
  if (result.progress !== undefined) target.progress = result.progress
}

function mergeToolCall(target: ToolPart, source: ToolPart): void {
  if (target.inputPreview === undefined && source.inputPreview !== undefined) target.inputPreview = source.inputPreview
  if (target.description === undefined && source.description !== undefined) target.description = source.description
  if (target.toolName === 'tool' && source.toolName !== 'tool') target.toolName = source.toolName
}

function upsertMessage(messages: TranscriptMessage[], message: TranscriptMessage): void {
  const index = messages.findIndex((item) => item.id === message.id)
  if (index === -1) messages.push(message)
  else messages[index] = message
}

function cloneMessage(message: TranscriptMessage): TranscriptMessage {
  return { ...message, content: message.content.map((part) => ({ ...part })) }
}

function changed(): TranscriptProjectionResult {
  return { changed: true, resyncRequired: false }
}

function isMainTranscriptFrame(type: string): boolean {
  return type.startsWith('turn.') ||
    type === 'assistant.delta' ||
    type === 'thinking.delta' ||
    type.startsWith('tool.') ||
    type.startsWith('prompt.') ||
    type === 'event.message.created' ||
    type === 'event.message.updated' ||
    type.startsWith('event.assistant.') ||
    type.startsWith('event.tool.') ||
    type === 'error'
}

function transcriptFrameAgentId(
  type: string,
  payload: Record<string, unknown>,
  state: ProjectorSessionState
): string | null {
  const direct = stringValue(payload.agentId) ?? stringValue(payload.agent_id)
  if (direct !== null) return direct
  if (type === 'event.message.created') {
    const message = recordValue(payload.message)
    const metadata = recordValue(message?.metadata)
    return stringValue(message?.agentId)
      ?? stringValue(message?.agent_id)
      ?? stringValue(metadata?.agentId)
      ?? stringValue(metadata?.agent_id)
  }
  const messageId = stringValue(payload.message_id)
  if (messageId !== null) {
    if (state.nonMainMessageIds.has(messageId)) return IGNORED_AGENT_ID
    const message = state.messages.find((item) => item.id === messageId)
    if (message?.agentId !== undefined) return message.agentId
  }
  const toolCallId = stringValue(payload.tool_call_id) ?? stringValue(payload.toolCallId)
  if (toolCallId !== null) {
    if (state.nonMainToolCallIds.has(toolCallId)) return IGNORED_AGENT_ID
    const owner = findToolOwner(state.messages, toolCallId)
    if (owner?.agentId !== undefined) return owner.agentId
  }
  return null
}

function rememberNonMainFrame(
  type: string,
  payload: Record<string, unknown>,
  state: ProjectorSessionState
): void {
  if (type === 'event.message.created') {
    const rawMessage = recordValue(payload.message)
    const messageId = stringValue(rawMessage?.id)
    if (messageId !== null) state.nonMainMessageIds.add(messageId)
    rememberToolCallIds(state, rawMessage?.content)
  }
  const messageId = stringValue(payload.message_id)
  if (messageId !== null) state.nonMainMessageIds.add(messageId)
  const toolCallId = stringValue(payload.tool_call_id) ?? stringValue(payload.toolCallId)
  if (toolCallId !== null) state.nonMainToolCallIds.add(toolCallId)
  rememberToolCallIds(state, payload.content)
}

function rememberNonMainMessage(state: ProjectorSessionState, message: TranscriptMessage): void {
  state.nonMainMessageIds.add(message.id)
  for (const part of message.content) {
    if (part.type === 'tool') state.nonMainToolCallIds.add(part.toolCallId)
  }
}

function rememberToolCallIds(state: ProjectorSessionState, content: unknown): void {
  if (!Array.isArray(content)) return
  for (const rawPart of content) {
    const part = recordValue(rawPart)
    const toolCallId = stringValue(part?.tool_call_id) ?? stringValue(part?.toolCallId)
    if (toolCallId !== null) state.nonMainToolCallIds.add(toolCallId)
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function timestampValue(value: unknown, fallback = new Date().toISOString()): string {
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return fallback
}

function previewValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  let text: string
  try {
    const budget = { remaining: 240 }
    const sanitized = sanitizePreviewValue(value, 0, new WeakSet<object>(), budget)
    text = typeof sanitized === 'string' ? sanitized : JSON.stringify(sanitized) ?? String(sanitized)
  } catch {
    text = String(value)
  }
  text = sanitizePreviewText(text)
  return text.length > MAX_TOOL_PREVIEW ? `${text.slice(0, MAX_TOOL_PREVIEW)}…` : text
}

function sanitizePreviewValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  budget: { remaining: number }
): unknown {
  budget.remaining -= 1
  if (budget.remaining < 0) return '[preview truncated]'
  if (typeof value === 'string') return sanitizePreviewText(value.slice(0, MAX_TOOL_PREVIEW * 2))
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[circular]'
  if (depth >= 4) return '[nested value omitted]'
  seen.add(value)
  if (Array.isArray(value)) {
    const items = value.slice(0, 24).map((item) => sanitizePreviewValue(item, depth + 1, seen, budget))
    if (value.length > 24) items.push(`[${value.length - 24} more items]`)
    return items
  }
  const output: Record<string, unknown> = {}
  const object = value as Record<string, unknown>
  let fieldCount = 0
  let truncated = false
  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue
    if (fieldCount >= 32) {
      truncated = true
      break
    }
    fieldCount += 1
    const item = object[key]
    output[key] = SECRET_KEY_PATTERN.test(key)
      ? '[secret omitted]'
      : sanitizePreviewValue(item, depth + 1, seen, budget)
  }
  if (truncated) output['…'] = 'more fields omitted'
  return output
}

const SECRET_KEY_PATTERN = /(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|cookie)/i
const CREDENTIAL_ASSIGNMENT_PATTERN = /(["']?)(password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|secret|cookie)\1(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gi

function sanitizePreviewText(value: string): string {
  return value
    .replace(/data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/g, '[base64 media omitted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [secret omitted]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[secret omitted]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[token omitted]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/gi, '[token omitted]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[token omitted]')
    .replace(CREDENTIAL_ASSIGNMENT_PATTERN, (_match, quote: string, key: string, separator: string) =>
      `${quote}${key}${quote}${separator}[secret omitted]`
    )
    .replace(/\b[A-Za-z0-9+/]{160,}={0,2}(?=$|[^A-Za-z0-9+/=])/g, '[base64 data omitted]')
}

function previewLabel(value: unknown, maxLength = 500): string | undefined {
  const text = stringValue(value)
  if (text === null || text.length === 0) return undefined
  const sanitized = sanitizePreviewText(text.slice(0, maxLength * 2))
  return sanitized.length > maxLength ? `${sanitized.slice(0, maxLength)}…` : sanitized
}

function optionalString<Key extends 'description' | 'outputPreview'>(
  key: Key,
  value: string | undefined
): Record<Key, string> | Record<string, never> {
  return value === undefined || value.length === 0 ? {} : { [key]: value } as Record<Key, string>
}

function progressStream(value: unknown): 'stdout' | 'stderr' | undefined {
  return value === 'stderr' ? 'stderr' : value === 'stdout' ? 'stdout' : undefined
}

function mergeOutputStream(
  current: 'stdout' | 'stderr' | 'mixed' | undefined,
  next: 'stdout' | 'stderr' | 'mixed'
): 'stdout' | 'stderr' | 'mixed' {
  if (current === undefined || current === next) return next
  return 'mixed'
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

type ToolPresentation = {
  summary?: string
  detail?: string
  diff?: { path: string; before: string; after: string; hunks: number | null }
}

function toolPresentation(value: unknown): ToolPresentation | null {
  const display = recordValue(value)
  if (display === null) return null
  const kind = stringValue(display.kind)
  if (kind === 'command') {
    return compactPresentation(previewLabel(display.command), previewLabel(display.cwd) ?? previewLabel(display.description))
  }
  if (kind === 'file_io') {
    const operation = previewLabel(display.operation, 80)
    const path = previewLabel(display.path)
    return compactPresentation([operation, path].filter(Boolean).join(' · '), previewLabel(display.detail))
  }
  if (kind === 'diff') {
    const hunks = numberValue(display.hunks)
    const presentation = compactPresentation(previewLabel(display.path), hunks === null ? undefined : `${hunks} hunks`)
    const path = previewLabel(display.path)
    const before = previewValue(display.before)
    const after = previewValue(display.after)
    return {
      ...presentation,
      ...(path === undefined || before === undefined || after === undefined
        ? {}
        : { diff: { path, before, after, hunks } })
    }
  }
  if (kind === 'search') return compactPresentation(previewLabel(display.query), previewLabel(display.scope))
  if (kind === 'url_fetch') return compactPresentation(previewLabel(display.url), previewLabel(display.method, 80))
  if (kind === 'agent_call') return compactPresentation(previewLabel(display.agent_name), previewLabel(display.prompt))
  if (kind === 'skill_call') return compactPresentation(previewLabel(display.skill_name), previewLabel(display.args))
  if (kind === 'todo_list') {
    const items = Array.isArray(display.items) ? display.items.slice(0, 4) : []
    const titles = items.map((item) => previewLabel(recordValue(item)?.title, 120)).filter((item): item is string => item !== undefined)
    return compactPresentation(titles.join(' · '), Array.isArray(display.items) ? `${display.items.length} items` : undefined)
  }
  if (kind === 'task') {
    return compactPresentation(
      previewLabel(display.description),
      [previewLabel(display.task_kind, 80), previewLabel(display.status, 80)].filter(Boolean).join(' · ')
    )
  }
  if (kind === 'task_stop') {
    return compactPresentation(previewLabel(display.task_description), previewLabel(display.task_id, 160))
  }
  if (kind === 'plan_review') {
    return compactPresentation(previewLabel(display.path), previewLabel(display.plan))
  }
  if (kind === 'goal_start') {
    return compactPresentation(
      previewLabel(display.objective),
      [previewLabel(display.mode, 80), previewLabel(display.completionCriterion)].filter(Boolean).join(' · ')
    )
  }
  if (kind === 'generic') return compactPresentation(previewLabel(display.summary), previewValue(display.detail))
  return null
}

function compactPresentation(
  summary: string | null | undefined,
  detail: string | undefined | null
): { summary?: string; detail?: string } {
  return {
    ...(summary === null || summary === undefined || summary.length === 0 ? {} : { summary }),
    ...(detail === null || detail === undefined || detail.length === 0 ? {} : { detail })
  }
}

function toolDiffPresentation(
  presentation: ToolPresentation | null
): { path: string; before: string; after: string; hunks: number | null } | undefined {
  return presentation?.diff
}

function presentationDescription(presentation: ToolPresentation | null): string | undefined {
  if (presentation === null) return undefined
  return [presentation.summary, presentation.detail].filter((value): value is string => value !== undefined).join(' · ')
}

function optionalPreview<Key extends 'inputPreview' | 'outputPreview'>(
  key: Key,
  value: unknown
): Record<Key, string> | Record<string, never> {
  const preview = previewValue(value)
  return preview === undefined ? {} : { [key]: preview } as Record<Key, string>
}

function optionalToolDiff(
  presentation: ToolPresentation | null
): { toolDiff: NonNullable<ToolPart['toolDiff']> } | Record<string, never> {
  const diff = toolDiffPresentation(presentation)
  return diff === undefined ? {} : { toolDiff: diff }
}

function appendPreview(current: string | undefined, next: string): string {
  if (current !== undefined && current.length >= MAX_TOOL_PREVIEW) return current
  const safeNext = sanitizePreviewText(next.slice(0, MAX_TOOL_PREVIEW * 2))
  const prefix = current === undefined || current.length === 0 ? '' : `${current}\n`
  const remaining = MAX_TOOL_PREVIEW - prefix.length
  if (safeNext.length <= remaining) return `${prefix}${safeNext}`
  return `${prefix}${safeNext.slice(0, Math.max(0, remaining))}…`
}
