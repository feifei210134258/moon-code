import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkbenchStore } from '../../src/renderer/src/stores/workbench.js'
import type { SessionViewState } from '../../src/shared/contracts.js'

function sessionState(): SessionViewState {
  return {
    sessionId: 'session-1',
    title: 'Real session',
    workspaceRoot: '/tmp/project',
    busy: false,
    mainTurnActive: false,
    activePromptId: null,
    activePromptStatus: null,
    phase: 'ready',
    cursor: { seq: 12, epoch: 'epoch-1' },
    messages: [{
      id: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: [
        { type: 'thinking', text: 'Inspect the repository' },
        { type: 'tool', toolCallId: 'tool-1', toolName: 'Read', state: 'done', outputPreview: 'README.md' },
        { type: 'text', text: 'The repository is ready.' }
      ],
      createdAt: '2026-07-23T01:02:00.000Z',
      promptId: 'prompt-1',
      status: 'completed'
    }],
    markers: [],
    pendingApprovals: [],
    pendingQuestions: [],
    agents: [],
    usage: {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      totalCostUsd: null, contextTokens: 0, contextLimit: 0, turnCount: null
    },
    hasMoreMessages: false,
    resyncCount: 0,
    unknownEventCount: 0,
    error: null
  }
}

describe('workbench transcript hydration', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('maps the authoritative Kimi transcript into conversation turns without local mock activities', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    store.hydrateTranscript(sessionState())

    expect(store.transcriptPhase).toBe('ready')
    expect(store.turns).toEqual([
      expect.objectContaining({
        id: 'message-1',
        role: 'assistant',
        blocks: [
          expect.objectContaining({
            type: 'activity',
            activity: expect.objectContaining({ kind: 'thinking', description: 'Inspect the repository' })
          }),
          expect.objectContaining({
            type: 'activity',
            activity: expect.objectContaining({ kind: 'tool', label: 'Read', description: 'README.md', status: 'done' })
          }),
          expect.objectContaining({ type: 'text', text: 'The repository is ready.' })
        ]
      })
    ])
  })

  it('projects Kimi cron origin as a visible conversation notice', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    const state = sessionState()
    state.messages = [{
      id: 'cron-1', sessionId: 'session-1', role: 'user',
      content: [{ type: 'text', text: '检查构建状态' }],
      createdAt: '2026-07-23T01:02:00.000Z', promptId: null, status: 'completed',
      originKind: 'cron', originTaskId: 'task-42'
    }]

    store.hydrateTranscript(state)

    expect(store.turns[0]?.blocks[0]).toEqual(expect.objectContaining({
      type: 'activity',
      activity: expect.objectContaining({ kind: 'notice', description: expect.stringContaining('task-42') })
    }))
  })

  it('ignores late state from a previously selected session', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-2'
    const beforeIds = store.turns.map((turn) => turn.id)
    store.hydrateTranscript(sessionState())
    expect(store.turns.map((turn) => turn.id)).toEqual(beforeIds)
  })

  it('marks only server-accepted queued user prompts as queued', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    const state = sessionState()
    state.messages = [{
      id: 'queued-message',
      sessionId: 'session-1',
      role: 'user',
      content: [{ type: 'text', text: 'Queue this' }],
      createdAt: '2026-07-23T01:03:00.000Z',
      promptId: 'queued-prompt',
      status: 'pending'
    }]
    store.hydrateTranscript(state)
    expect(store.turns[0]).toEqual(expect.objectContaining({ queued: true }))
  })

  it('marks only a trailing pending Thinking block as running', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    const state = sessionState()
    state.messages = [
      {
        ...state.messages[0]!,
        id: 'thinking-before-tool',
        status: 'pending',
        content: [
          { type: 'thinking', text: 'Plan the command' },
          { type: 'tool', toolCallId: 'tool-running', toolName: 'Shell', state: 'running' }
        ]
      },
      {
        ...state.messages[0]!,
        id: 'thinking-trailing',
        status: 'pending',
        content: [{ type: 'thinking', text: 'Still reasoning' }]
      }
    ]
    store.hydrateTranscript(state)

    const firstThinking = store.turns[0]?.blocks[0]
    const trailingThinking = store.turns[1]?.blocks[0]
    expect(firstThinking?.type === 'activity' ? firstThinking.activity.status : null).toBe('done')
    expect(trailingThinking?.type === 'activity' ? trailingThinking.activity.status : null).toBe('running')
  })

  it('keeps a workspace selected even when it has no sessions', () => {
    const store = useWorkbenchStore()
    store.hydrateProjects([
      { id: 'workspace-empty', name: 'Empty', root: '/empty', sessions: [] },
      {
        id: 'workspace-active', name: 'Active', root: '/active', sessions: [{
          id: 'session-1', title: 'Session', updatedAt: null, busy: false,
          pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
        }]
      }
    ])

    store.toggleProject('workspace-empty')

    expect(store.activeWorkspaceId).toBe('workspace-empty')
    expect(store.activeSessionId).toBe('')
  })

  it('moves workspace selection with an explicitly selected session', () => {
    const store = useWorkbenchStore()
    store.hydrateProjects([
      {
        id: 'workspace-a', name: 'A', root: '/a', sessions: [{
          id: 'session-a', title: 'A', updatedAt: null, busy: false,
          pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
        }]
      },
      {
        id: 'workspace-b', name: 'B', root: '/b', sessions: [{
          id: 'session-b', title: 'B', updatedAt: null, busy: false,
          pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
        }]
      }
    ])

    store.selectSession('session-b')

    expect(store.activeWorkspaceId).toBe('workspace-b')
  })

  it('merges loaded child sessions beneath their Kimi parent', () => {
    const store = useWorkbenchStore()
    store.hydrateProjects([{
      id: 'workspace-a', name: 'A', root: '/a', sessions: [{
        id: 'session-parent', title: 'Parent', updatedAt: null, busy: false,
        pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
      }]
    }])
    store.mergeSessionChildren('session-parent', [{
      id: 'session-child', title: 'Child', updatedAt: null, busy: true,
      pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null,
      parentSessionId: 'session-parent'
    }])

    expect(store.projects[0]?.sessions[1]).toEqual(expect.objectContaining({
      id: 'session-child', parentSessionId: 'session-parent', tone: 'running'
    }))
  })
})
