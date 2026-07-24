import type { SessionTranscript } from '../../../packages/kimi-adapter/src/wire/schemas.js'
import type { KimiAgentTranscript, SessionTranscriptMessage, SessionTranscriptPart } from '../../shared/contracts.js'

const MAX_TEXT = 16_000

export function projectAgentTranscript(
  sessionId: string,
  agentId: string,
  transcript: SessionTranscript
): KimiAgentTranscript {
  const messages: SessionTranscriptMessage[] = []
  let usage: KimiAgentTranscript['usage'] = null
  for (const item of transcript.items) {
    if (item.kind !== 'turn') continue
    const turn = asRecord(item)
    const turnId = stringValue(turn?.turnId) ?? stringValue(turn?.turn_id)
    if (turnId === null) continue
    const createdAt = timestampValue(turn?.startedAt)
      ?? timestampValue(turn?.createdAt)
      ?? timestampValue(turn?.created_at)
      ?? ''
    const status = turnStatus(turn?.state)
    usage = mergeUsage(usage, turn?.usage)
    const prompt = boundedText(turn?.prompt)
    if (prompt !== null) {
      messages.push({
        id: `${turnId}:user`,
        sessionId,
        role: 'user',
        content: [{ type: 'text', text: prompt }],
        createdAt,
        promptId: turnId,
        status
      })
    }
    const assistantParts: SessionTranscriptPart[] = []
    for (const step of arrayValue(turn?.steps)) {
      const stepRecord = asRecord(step)
      for (const frame of arrayValue(stepRecord?.frames)) {
        const projected = projectFrame(frame)
        if (projected !== null) assistantParts.push(projected)
      }
    }
    if (assistantParts.length > 0) {
      messages.push({
        id: `${turnId}:assistant`,
        sessionId,
        role: 'assistant',
        content: assistantParts,
        createdAt,
        promptId: turnId,
        status
      })
    }
  }
  return { agentId, messages, hasMore: transcript.has_more, usage }
}

function mergeUsage(current: KimiAgentTranscript['usage'], value: unknown): KimiAgentTranscript['usage'] {
  const raw = asRecord(value)
  if (raw === null) return current
  const inputTokens = nonNegativeNumber(raw.inputTokens)
  const outputTokens = nonNegativeNumber(raw.outputTokens)
  const cachedTokens = nonNegativeNumber(raw.cachedTokens)
  if (inputTokens === null && outputTokens === null && cachedTokens === null) return current
  return {
    inputTokens: (current?.inputTokens ?? 0) + (inputTokens ?? 0),
    outputTokens: (current?.outputTokens ?? 0) + (outputTokens ?? 0),
    cacheReadTokens: (current?.cacheReadTokens ?? 0) + (cachedTokens ?? 0),
    cacheCreationTokens: current?.cacheCreationTokens ?? 0,
    contextTokens: current?.contextTokens ?? null
  }
}

function projectFrame(value: unknown): SessionTranscriptPart | null {
  const frame = asRecord(value)
  const kind = stringValue(frame?.kind)
  if (kind === 'text') {
    if (frame?.role === 'user') return null
    const text = boundedText(frame?.text)
    return text === null ? null : { type: 'text', text }
  }
  if (kind === 'thinking') {
    const text = boundedText(frame?.text)
    return text === null ? null : { type: 'thinking', text }
  }
  if (kind === 'tool') {
    const toolCallId = stringValue(frame?.toolCallId) ?? stringValue(frame?.tool_call_id)
    if (toolCallId === null) return null
    const outputPreview = preview(frame?.output) ?? preview(frame?.error)
    const inputPreview = preview(frame?.input)
    const description = preview(frame?.display)
    return {
      type: 'tool',
      toolCallId,
      toolName: stringValue(frame?.name) ?? 'tool',
      state: toolState(frame?.state),
      ...(description === null ? {} : { description }),
      ...(inputPreview === null ? {} : { inputPreview }),
      ...(outputPreview === null ? {} : { outputPreview })
    }
  }
  if (kind === 'notice') {
    const message = boundedText(frame?.message)
    if (message === null) return null
    const level = stringValue(frame?.level)
    return { type: 'text', text: level === null ? message : `[${level}] ${message}` }
  }
  return null
}

function turnStatus(value: unknown): SessionTranscriptMessage['status'] {
  return value === 'failed' ? 'error' : value === 'queued' || value === 'running' ? 'pending' : 'completed'
}

function toolState(value: unknown): 'running' | 'done' | 'error' {
  return value === 'running' ? 'running' : value === 'error' || value === 'failed' ? 'error' : 'done'
}

function preview(value: unknown): string | null {
  if (typeof value === 'string') return boundedText(value)
  if (value === undefined || value === null) return null
  try {
    return boundedText(JSON.stringify(value))
  } catch {
    return null
  }
}

function boundedText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value
}

function timestampValue(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
