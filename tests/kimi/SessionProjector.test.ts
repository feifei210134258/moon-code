import { describe, expect, it } from 'vitest'
import {
  createSessionProjectionState,
  projectSessionEvent
} from '../../packages/kimi-adapter/src/projector/SessionProjector.js'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

function frame(payload: Record<string, unknown>, seq = 1): SessionEventFrame {
  return {
    type: String(payload.type),
    seq,
    epoch: 'epoch-1',
    session_id: 'session-1',
    timestamp: '2026-07-23T00:00:00.000Z',
    payload
  }
}

describe('SessionProjector', () => {
  it('projects created and waiting state events into a stable session summary', () => {
    const state = createSessionProjectionState()
    projectSessionEvent(
      state,
      frame({
        type: 'event.session.created',
        session: {
          id: 'session-1',
          workspace_id: 'workspace-1',
          title: 'Build desktop client',
          updated_at: '2026-07-23T00:00:00.000Z',
          busy: false,
          pending_interaction: 'none'
        }
      })
    )
    projectSessionEvent(
      state,
      frame({ type: 'event.session.work_changed', busy: true, pending_interaction: 'approval' }, 2)
    )

    expect(state.sessions.get('session-1')).toEqual(
      expect.objectContaining({
        title: 'Build desktop client',
        busy: true,
        pendingInteraction: 'approval'
      })
    )
  })

  it('counts unknown events without throwing or corrupting known sessions', () => {
    const state = createSessionProjectionState()
    expect(() => projectSessionEvent(state, frame({ type: 'future.event', value: 42 }))).not.toThrow()
    expect(state.unknownEventCount).toBe(1)
    expect(state.sessions.size).toBe(0)
  })
})
