import { describe, expect, it } from 'vitest'
import { CursorLedger } from '../../packages/kimi-adapter/src/reducer/CursorLedger.js'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

function frame(seq: number, epoch = 'epoch-1'): SessionEventFrame {
  return {
    type: 'event.session.work_changed',
    seq,
    epoch,
    session_id: 'session-1',
    timestamp: '2026-07-23T00:00:00.000Z',
    payload: { type: 'event.session.work_changed', busy: true }
  }
}

describe('CursorLedger', () => {
  it('accepts the next event and rejects duplicates without moving the cursor', () => {
    const ledger = new CursorLedger()
    ledger.seed({ 'session-1': { seq: 10, epoch: 'epoch-1' } })

    expect(ledger.observe(frame(11))?.kind).toBe('accepted')
    expect(ledger.observe(frame(11))?.kind).toBe('duplicate')
    expect(ledger.get('session-1')).toEqual({ seq: 11, epoch: 'epoch-1' })
  })

  it('reports a sequence gap and epoch change without accepting the frame', () => {
    const ledger = new CursorLedger()
    ledger.seed({ 'session-1': { seq: 10, epoch: 'epoch-1' } })

    expect(ledger.observe(frame(13))).toEqual(
      expect.objectContaining({ kind: 'gap', expectedSeq: 11, actualSeq: 13 })
    )
    expect(ledger.observe(frame(11, 'epoch-2'))).toEqual(
      expect.objectContaining({ kind: 'epoch-changed', previousEpoch: 'epoch-1', actualEpoch: 'epoch-2' })
    )
    expect(ledger.get('session-1')).toEqual({ seq: 10, epoch: 'epoch-1' })
  })
})
