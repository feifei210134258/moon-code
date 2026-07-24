import { z } from 'zod'

export const cursorSchema = z.object({
  seq: z.number().int().nonnegative(),
  epoch: z.string().min(1).optional()
})

export interface KimiCursor {
  seq: number
  epoch?: string
}

export const sessionEventFrameSchema = z.object({
  type: z.string().min(1),
  seq: z.number().int().nonnegative(),
  epoch: z.string().optional(),
  volatile: z.boolean().optional(),
  offset: z.number().int().nonnegative().optional(),
  session_id: z.string().optional(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown())
})

export type SessionEventFrame = z.infer<typeof sessionEventFrameSchema>

const serverHelloSchema = z.object({
  type: z.literal('server_hello'),
  timestamp: z.string(),
  payload: z.object({
    ws_connection_id: z.string(),
    protocol_version: z.number().int().positive(),
    heartbeat_ms: z.number().int().positive().optional(),
    max_event_buffer_size: z.number().int().positive(),
    capabilities: z.object({
      event_batching: z.boolean(),
      compression: z.boolean()
    })
  })
})

const ackSchema = z.object({
  type: z.literal('ack'),
  id: z.string(),
  code: z.number().int(),
  msg: z.string(),
  payload: z.record(z.string(), z.unknown())
})

const resyncRequiredSchema = z.object({
  type: z.literal('resync_required'),
  timestamp: z.string(),
  payload: z.object({
    session_id: z.string(),
    reason: z.enum(['buffer_overflow', 'session_recreated', 'epoch_changed']),
    current_seq: z.number().int().nonnegative(),
    epoch: z.string().min(1).optional()
  })
})

const pingSchema = z.object({
  type: z.literal('ping'),
  timestamp: z.string(),
  payload: z.object({ nonce: z.string() })
})

const errorSchema = z.object({
  type: z.literal('error'),
  timestamp: z.string(),
  payload: z.object({
    code: z.number().int(),
    msg: z.string(),
    fatal: z.boolean(),
    request_id: z.string().optional(),
    details: z.unknown().optional()
  })
})

export const terminalOutputFrameSchema = z.object({
  type: z.literal('terminal_output'),
  session_id: z.string().min(1),
  terminal_id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  payload: z.object({ data: z.string() })
}).passthrough()

export const terminalExitFrameSchema = z.object({
  type: z.literal('terminal_exit'),
  session_id: z.string().min(1),
  terminal_id: z.string().min(1),
  payload: z.object({ exit_code: z.number().int().nullable() })
}).passthrough()

export const terminalServerFrameSchema = z.discriminatedUnion('type', [
  terminalOutputFrameSchema,
  terminalExitFrameSchema
])

export type TerminalServerFrame = z.infer<typeof terminalServerFrameSchema>

export const knownControlFrameSchema = z.discriminatedUnion('type', [
  serverHelloSchema,
  ackSchema,
  resyncRequiredSchema,
  pingSchema,
  errorSchema
])

export type KnownControlFrame = z.infer<typeof knownControlFrameSchema>

export type ParsedServerFrame =
  | { kind: 'control'; frame: KnownControlFrame }
  | { kind: 'terminal'; frame: TerminalServerFrame }
  | { kind: 'session-event'; frame: SessionEventFrame }
  | { kind: 'unknown'; value: Record<string, unknown> }
  | { kind: 'invalid'; error: z.ZodError | Error }

export function parseServerFrame(raw: string): ParsedServerFrame {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return { kind: 'invalid', error: error instanceof Error ? error : new Error(String(error)) }
  }

  const control = knownControlFrameSchema.safeParse(value)
  if (control.success) return { kind: 'control', frame: control.data }

  const terminal = terminalServerFrameSchema.safeParse(value)
  if (terminal.success) return { kind: 'terminal', frame: terminal.data }

  const sessionEvent = sessionEventFrameSchema.safeParse(value)
  if (sessionEvent.success) return { kind: 'session-event', frame: sessionEvent.data }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return { kind: 'unknown', value: value as Record<string, unknown> }
  }
  return { kind: 'invalid', error: sessionEvent.error }
}

export interface ClientHelloFrame {
  type: 'client_hello'
  id: string
  payload: {
    client_id: string
    subscriptions: string[]
    cursors?: Record<string, KimiCursor>
  }
}

export interface SubscribeFrame {
  type: 'subscribe'
  id: string
  payload: {
    session_ids: string[]
    cursors?: Record<string, KimiCursor>
  }
}

export interface UnsubscribeFrame {
  type: 'unsubscribe'
  id: string
  payload: {
    session_ids: string[]
  }
}

export interface TerminalAttachFrame {
  type: 'terminal_attach'
  id: string
  payload: {
    session_id: string
    terminal_id: string
    since_seq?: number
  }
}

export interface TerminalDetachFrame {
  type: 'terminal_detach'
  id: string
  payload: { session_id: string; terminal_id: string }
}

export interface TerminalInputFrame {
  type: 'terminal_input'
  id: string
  payload: { session_id: string; terminal_id: string; data: string }
}

export interface TerminalResizeFrame {
  type: 'terminal_resize'
  id: string
  payload: { session_id: string; terminal_id: string; cols: number; rows: number }
}

export interface TerminalCloseFrame {
  type: 'terminal_close'
  id: string
  payload: { session_id: string; terminal_id: string }
}

export interface PongFrame {
  type: 'pong'
  payload: { nonce: string }
}
