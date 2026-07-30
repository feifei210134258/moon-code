import { describe, expect, it } from 'vitest'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'
import {
  SessionPetStateReducer,
  type PetSessionFact
} from '../../src/main/pet/SessionPetStateReducer.js'

function session(overrides: Partial<PetSessionFact> & Pick<PetSessionFact, 'id'>): PetSessionFact {
  return {
    id: overrides.id,
    workspaceId: overrides.workspaceId ?? 'workspace-1',
    title: overrides.title ?? overrides.id,
    busy: overrides.busy ?? false,
    mainTurnActive: overrides.mainTurnActive ?? false,
    pendingInteraction: overrides.pendingInteraction ?? 'none',
    lastTurnReason: overrides.lastTurnReason ?? null,
    updatedAt: overrides.updatedAt ?? '2026-07-23T08:00:00.000Z'
  }
}

describe('SessionPetStateReducer', () => {
  it('keeps the latest idle session available for the static desktop pet', () => {
    const reducer = new SessionPetStateReducer()
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [
      session({ id: 'older', updatedAt: '2026-07-23T07:00:00.000Z' }),
      session({ id: 'latest', updatedAt: '2026-07-23T08:00:00.000Z' })
    ])
    reducer.setConnected(true)

    expect(reducer.getRoster().items).toEqual([
      expect.objectContaining({ sessionId: 'latest', status: 'idle' })
    ])
    expect(reducer.trackedSessionIds).toEqual(['latest'])
  })

  it('starts from real active sessions and ignores old completed history', () => {
    const reducer = new SessionPetStateReducer()
    reducer.reset('server-1')
    reducer.seed(
      [{ id: 'workspace-1', name: 'Kimi Agent' }],
      [
        session({ id: 'running', busy: true, mainTurnActive: true }),
        session({ id: 'waiting', busy: true, pendingInteraction: 'approval' }),
        session({ id: 'old', lastTurnReason: 'completed' })
      ]
    )
    reducer.setConnected(true)

    expect(reducer.getRoster().items.map((item) => [item.sessionId, item.status])).toEqual([
      ['waiting', 'waiting'],
      ['running', 'running']
    ])
    expect(reducer.trackedSessionIds).toEqual(['running', 'waiting'])
  })

  it('maps completion to a transient animation and then unread review', () => {
    let now = Date.parse('2026-07-23T08:00:00.000Z')
    const reducer = new SessionPetStateReducer({ now: () => now, completedDurationMs: 5_000 })
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [session({ id: 'task', busy: true })])
    reducer.setConnected(true)

    now += 1_000
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [session({
      id: 'task',
      busy: false,
      lastTurnReason: 'completed',
      updatedAt: new Date(now).toISOString()
    })])
    expect(reducer.getRoster().items[0]).toMatchObject({ status: 'completed', unread: true })

    now += 5_001
    expect(reducer.getRoster().items[0]).toMatchObject({ status: 'review', unread: true })

    reducer.markViewed('task')
    expect(reducer.getRoster().items[0]).toMatchObject({ status: 'idle', unread: false })
  })

  it('keeps Waiting and Failed ahead of Running and limits the visible flock', () => {
    const reducer = new SessionPetStateReducer({ maxVisible: 2 })
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [
      session({ id: 'running', busy: true }),
      session({ id: 'waiting', busy: true, pendingInteraction: 'question' }),
      session({ id: 'failed', busy: true })
    ])
    reducer.setConnected(true)
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [
      session({ id: 'running', busy: true }),
      session({ id: 'waiting', busy: true, pendingInteraction: 'question' }),
      session({ id: 'failed', busy: false, lastTurnReason: 'failed' })
    ])

    const roster = reducer.getRoster()
    expect(roster.items.map((item) => item.status)).toEqual(['waiting', 'failed'])
    expect(roster.overflow).toBe(1)
  })

  it('projects subscribed work events without changing the Session binding', () => {
    const reducer = new SessionPetStateReducer()
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [session({ id: 'task', busy: true })])
    reducer.setConnected(true)

    const frame = {
      type: 'event',
      session_id: 'task',
      seq: 2,
      timestamp: '2026-07-23T08:01:00.000Z',
      payload: {
        type: 'event.session.work_changed',
        busy: true,
        main_turn_active: false,
        pending_interaction: 'approval'
      }
    } as SessionEventFrame

    expect(reducer.applyEvent(frame)).toBe(true)
    expect(reducer.getRoster().items[0]).toMatchObject({
      serverId: 'server-1',
      workspaceId: 'workspace-1',
      sessionId: 'task',
      status: 'waiting',
      backgroundActivity: true
    })
  })

  it('settles the running pet from a terminal prompt event without work_changed', () => {
    const reducer = new SessionPetStateReducer({ completedDurationMs: 5_000 })
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [session({ id: 'task', busy: true, mainTurnActive: true })])
    reducer.setConnected(true)

    const frame = {
      type: 'prompt.completed',
      session_id: 'task',
      seq: 2,
      timestamp: '2026-07-23T08:01:00.000Z',
      payload: {
        type: 'prompt.completed',
        promptId: 'prompt-1',
        finishedAt: '2026-07-23T08:01:00.000Z'
      }
    } as SessionEventFrame

    expect(reducer.applyEvent(frame)).toBe(true)
    expect(reducer.getRoster().items[0]).toMatchObject({
      sessionId: 'task',
      status: 'completed',
      unread: true,
      backgroundActivity: false
    })
  })

  it('shows tracked sessions as disconnected without fabricating new pets', () => {
    const reducer = new SessionPetStateReducer()
    reducer.reset('server-1')
    reducer.seed([{ id: 'workspace-1', name: 'Project' }], [
      session({ id: 'task', busy: true }),
      session({ id: 'history', lastTurnReason: 'completed' })
    ])
    reducer.setConnected(false)

    expect(reducer.getRoster().items).toHaveLength(1)
    expect(reducer.getRoster().items[0]).toMatchObject({ sessionId: 'task', status: 'disconnected' })
  })
})
