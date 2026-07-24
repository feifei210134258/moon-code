import type { KimiCursor, SessionEventFrame } from '../wire/ws.js'

export type CursorDecision =
  | { kind: 'accepted'; cursor: KimiCursor }
  | { kind: 'duplicate'; cursor: KimiCursor }
  | { kind: 'gap'; expectedSeq: number; actualSeq: number; cursor: KimiCursor }
  | { kind: 'epoch-changed'; previousEpoch?: string; actualEpoch?: string; cursor: KimiCursor }

export class CursorLedger {
  readonly #cursors = new Map<string, KimiCursor>()

  seed(cursors: Record<string, KimiCursor>): void {
    for (const [sessionId, cursor] of Object.entries(cursors)) {
      this.#cursors.set(sessionId, { ...cursor })
    }
  }

  set(sessionId: string, cursor: KimiCursor): void {
    this.#cursors.set(sessionId, { ...cursor })
  }

  delete(sessionId: string): void {
    this.#cursors.delete(sessionId)
  }

  get(sessionId: string): KimiCursor | null {
    const cursor = this.#cursors.get(sessionId)
    return cursor === undefined ? null : { ...cursor }
  }

  snapshot(): Record<string, KimiCursor> {
    return Object.fromEntries([...this.#cursors].map(([sessionId, cursor]) => [sessionId, { ...cursor }]))
  }

  observe(frame: SessionEventFrame): CursorDecision | null {
    const sessionId = frame.session_id
    if (sessionId === undefined || frame.volatile === true) return null

    const next: KimiCursor = {
      seq: frame.seq,
      ...(frame.epoch === undefined ? {} : { epoch: frame.epoch })
    }
    const current = this.#cursors.get(sessionId)
    if (current === undefined) {
      this.#cursors.set(sessionId, next)
      return { kind: 'accepted', cursor: { ...next } }
    }

    if (current.epoch !== frame.epoch && (current.epoch !== undefined || frame.epoch !== undefined)) {
      return {
        kind: 'epoch-changed',
        ...(current.epoch === undefined ? {} : { previousEpoch: current.epoch }),
        ...(frame.epoch === undefined ? {} : { actualEpoch: frame.epoch }),
        cursor: { ...current }
      }
    }
    if (frame.seq <= current.seq) {
      return { kind: 'duplicate', cursor: { ...current } }
    }
    if (frame.seq !== current.seq + 1) {
      return {
        kind: 'gap',
        expectedSeq: current.seq + 1,
        actualSeq: frame.seq,
        cursor: { ...current }
      }
    }

    this.#cursors.set(sessionId, next)
    return { kind: 'accepted', cursor: { ...next } }
  }
}
