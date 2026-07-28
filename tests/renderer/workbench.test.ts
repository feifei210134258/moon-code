// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
    todos: [],
    sideChat: null,
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
  beforeEach(() => {
    setActivePinia(createPinia())
    window.localStorage.removeItem('moon-code:navigation-activity:v2')
  })

  afterEach(() => {
    window.localStorage.removeItem('moon-code:navigation-activity:v2')
  })

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

    /* 同一轮的连续 assistant 消息聚合为一个 Kimi 回合 */
    expect(store.turns).toHaveLength(1)
    const blocks = store.turns[0]?.blocks ?? []
    const firstThinking = blocks[0]
    const trailingThinking = blocks[2]
    expect(firstThinking?.type === 'activity' ? firstThinking.activity.status : null).toBe('done')
    expect(trailingThinking?.type === 'activity' ? trailingThinking.activity.status : null).toBe('running')
  })

  it('aggregates consecutive assistant messages of one round into a single Kimi turn', () => {
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    const state = sessionState()
    const base = state.messages[0]!
    state.messages = [
      { ...base, id: 'assistant-1', content: [{ type: 'tool', toolCallId: 'tool-1', toolName: 'Bash', state: 'done' }] },
      { ...base, id: 'assistant-2', content: [{ type: 'thinking', text: 'Reviewing output' }, { type: 'tool', toolCallId: 'tool-2', toolName: 'Read', state: 'done' }] },
      {
        id: 'user-2', sessionId: 'session-1', role: 'user',
        content: [{ type: 'text', text: '继续' }],
        createdAt: '2026-07-23T01:05:00.000Z', promptId: 'prompt-2', status: 'completed'
      },
      { ...base, id: 'assistant-3', content: [{ type: 'text', text: '已完成。' }] }
    ]
    store.hydrateTranscript(state)

    expect(store.turns.map((turn) => `${turn.role}:${turn.blocks.length}`)).toEqual([
      'assistant:3',
      'user:1',
      'assistant:1'
    ])
    /* 聚合回合保留首条消息的时间与 id */
    expect(store.turns[0]?.id).toBe('assistant-1')
  })

  it('only expands or collapses a workspace without replacing the selected session', () => {
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

    expect(store.projects[0]?.expanded).toBe(false)
    expect(store.activeWorkspaceId).toBe('workspace-active')
    expect(store.activeSessionId).toBe('session-1')
  })

  it('does not reorder projects or sessions when they are only selected or expanded', () => {
    const tree = [
      {
        id: 'workspace-created-first', name: 'Created first', root: '/first', sessions: [{
          id: 'session-created-first', title: 'Created first session', updatedAt: '2026-07-20T10:00:00.000Z',
          busy: false, pendingInteraction: 'none' as const, lastTurnReason: null, lastPrompt: null
        }]
      },
      {
        id: 'workspace-created-last', name: 'Created last', root: '/last', sessions: [{
          id: 'session-created-last', title: 'Created last session', updatedAt: '2026-07-25T10:00:00.000Z',
          busy: false, pendingInteraction: 'none' as const, lastTurnReason: null, lastPrompt: null
        }]
      }
    ]
    const store = useWorkbenchStore()
    store.hydrateProjects(tree)

    expect(store.projects.map((project) => project.id)).toEqual([
      'workspace-created-last', 'workspace-created-first'
    ])
    store.selectSession('session-created-first')
    expect(store.projects.map((project) => project.id)).toEqual([
      'workspace-created-last', 'workspace-created-first'
    ])
    store.selectWorkspace('workspace-created-first')
    expect(store.projects.map((project) => project.id)).toEqual([
      'workspace-created-last', 'workspace-created-first'
    ])
    store.toggleProject('workspace-created-first')
    expect(store.projects.map((project) => project.id)).toEqual([
      'workspace-created-last', 'workspace-created-first'
    ])

    setActivePinia(createPinia())
    const reloadedStore = useWorkbenchStore()
    reloadedStore.hydrateProjects(tree)
    expect(reloadedStore.projects.map((project) => project.id)).toEqual([
      'workspace-created-last', 'workspace-created-first'
    ])
  })

  it('moves a project and its conversation after an accepted conversation activity', () => {
    const tree = [
      {
        id: 'workspace-created-first', name: 'Created first', root: '/first', sessions: [{
          id: 'session-created-first', title: 'Created first session', updatedAt: '2026-07-20T10:00:00.000Z',
          busy: false, pendingInteraction: 'none' as const, lastTurnReason: null, lastPrompt: null
        }]
      },
      {
        id: 'workspace-created-last', name: 'Created last', root: '/last', sessions: [{
          id: 'session-created-last', title: 'Created last session', updatedAt: '2026-07-25T10:00:00.000Z',
          busy: false, pendingInteraction: 'none' as const, lastTurnReason: null, lastPrompt: null
        }]
      }
    ]
    const store = useWorkbenchStore()
    store.hydrateProjects(tree)
    store.markConversationActivity('session-created-first')

    expect(store.projects.map((project) => project.id)).toEqual([
      'workspace-created-first', 'workspace-created-last'
    ])
    expect(store.projects[0]?.sessions[0]?.id).toBe('session-created-first')

    setActivePinia(createPinia())
    const reloadedStore = useWorkbenchStore()
    reloadedStore.hydrateProjects(tree)
    expect(reloadedStore.projects.map((project) => project.id)).toEqual([
      'workspace-created-first', 'workspace-created-last'
    ])
  })

  it('allows the right panel to grow to twice its previous maximum width', () => {
    const store = useWorkbenchStore()
    store.setRightPanelWidth(2_000)
    expect(store.rightPanelWidth).toBe(1_040)
  })

  it('keeps a dragged project sidebar within a useful desktop width', () => {
    const store = useWorkbenchStore()
    store.setLeftPanelWidth(100)
    expect(store.leftPanelWidth).toBe(220)
    store.setLeftPanelWidth(520)
    expect(store.leftPanelWidth).toBe(420)
  })

  it('maps busy and completed Kimi sessions to explicit navigation states', () => {
    const store = useWorkbenchStore()
    store.hydrateProjects([{
      id: 'workspace-a', name: 'A', root: '/a', sessions: [
        {
          id: 'session-running', title: 'Running', updatedAt: null, busy: true,
          pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
        },
        {
          id: 'session-completed', title: 'Completed', updatedAt: null, busy: false,
          pendingInteraction: 'none', lastTurnReason: 'completed', lastPrompt: null
        }
      ]
    }])

    expect(store.projects[0]?.sessions).toEqual([
      expect.objectContaining({ id: 'session-running', tone: 'running' }),
      expect.objectContaining({ id: 'session-completed', tone: 'completed' })
    ])
  })

  it('clears a completed indicator when selected and only restores it for a newer completion', () => {
    const store = useWorkbenchStore()
    const project = (updatedAt: string) => [{
      id: 'workspace-a', name: 'A', root: '/a', sessions: [{
        id: 'session-completed', title: 'Completed', updatedAt, busy: false,
        pendingInteraction: 'none' as const, lastTurnReason: 'completed' as const, lastPrompt: null
      }]
    }]

    store.hydrateProjects(project('2026-07-25T10:00:00.000Z'))
    expect(store.projects[0]?.sessions[0]?.tone).toBe('completed')

    store.selectSession('session-completed')
    expect(store.projects[0]?.sessions[0]?.tone).toBe('neutral')

    store.hydrateProjects(project('2026-07-25T10:00:00.000Z'))
    expect(store.projects[0]?.sessions[0]?.tone).toBe('neutral')

    store.hydrateProjects(project('2026-07-25T10:05:00.000Z'))
    expect(store.projects[0]?.sessions[0]?.tone).toBe('completed')
  })

  it('does not show a status for an idle session without a completion', () => {
    const store = useWorkbenchStore()
    store.hydrateProjects([{
      id: 'workspace-a', name: 'A', root: '/a', sessions: [{
        id: 'session-idle', title: 'Idle', updatedAt: null, busy: false,
        pendingInteraction: 'none', lastTurnReason: null, lastPrompt: null
      }]
    }])

    expect(store.projects[0]?.sessions[0]?.tone).toBe('neutral')
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
