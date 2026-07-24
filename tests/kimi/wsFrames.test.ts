import { describe, expect, it } from 'vitest'
import { parseServerFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

describe('Kimi WebSocket frames', () => {
  it('parses an unknown future session event as a session event instead of crashing', () => {
    const result = parseServerFrame(
      JSON.stringify({
        type: 'future.event',
        seq: 12,
        session_id: 'session-1',
        timestamp: '2026-07-23T00:00:00.000Z',
        payload: { type: 'future.event', value: 42 }
      })
    )
    expect(result.kind).toBe('session-event')
  })

  it('returns an invalid result for malformed JSON', () => {
    expect(parseServerFrame('{not-json').kind).toBe('invalid')
  })

  it('routes terminal output outside the Session cursor stream', () => {
    const result = parseServerFrame(JSON.stringify({
      type: 'terminal_output',
      session_id: 'session-1',
      terminal_id: 'terminal-1',
      seq: 7,
      payload: { data: '\u001b[32mok\u001b[0m\r\n' }
    }))

    expect(result).toEqual({
      kind: 'terminal',
      frame: expect.objectContaining({ type: 'terminal_output', seq: 7 })
    })
  })
})
