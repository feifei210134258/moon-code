import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { SessionSyncController } from '../../packages/kimi-adapter/src/sync/SessionSyncController.js'
import type { SessionSnapshot } from '../../packages/kimi-adapter/src/wire/schemas.js'
import type { ConnectOptions } from '../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import type { KimiCursor, SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

class FakeSocket extends EventEmitter {
  cursors: Record<string, KimiCursor> = {}
  connect = vi.fn(async (options: ConnectOptions = {}) => {
    this.cursors = { ...(options.cursors ?? {}) }
  })
  subscribe = vi.fn(async () => ({}))
  unsubscribe = vi.fn(async (sessionIds: string[]) => {
    for (const sessionId of sessionIds) delete this.cursors[sessionId]
    return {}
  })
  close = vi.fn()

  setCursor(sessionId: string, cursor: KimiCursor): void {
    this.cursors[sessionId] = { ...cursor }
  }
}

function makeSnapshot(seq: number, assistantText = 'Hello'): SessionSnapshot {
  return {
    as_of_seq: seq,
    epoch: 'epoch-1',
    session: {
      id: 'session-1',
      workspace_id: 'workspace-1',
      title: `Session at ${seq}`,
      created_at: '2026-07-23T00:00:00.000Z',
      updated_at: '2026-07-23T00:01:00.000Z',
      busy: true,
      main_turn_active: true,
      pending_interaction: 'none',
      metadata: { cwd: '/workspace' },
      agent_config: { model: 'kimi-code' },
      usage: { input_tokens: 1, output_tokens: 2, context_tokens: 3, context_limit: 100 },
      permission_rules: [],
      message_count: 0,
      last_seq: seq
    },
    messages: { items: [], has_more: false },
    in_flight_turn: {
      turn_id: 1,
      assistant_text: assistantText,
      thinking_text: '',
      running_tools: [],
      current_prompt_id: 'prompt-1'
    },
    pending_approvals: [],
    pending_questions: []
  }
}

describe('SessionSyncController', () => {
  it('forwards Kimi global Workspace, Session, and Config invalidations without mixing them into a Transcript', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')
    const events: Array<{ scope: string; eventType: string }> = []
    controller.on('global-event', (event) => events.push(event))

    socket.emit('session-event', {
      type: 'event.workspace.updated', seq: 1, epoch: 'global-1', session_id: '__global__',
      timestamp: '2026-07-24T01:00:00.000Z',
      payload: { workspace: { id: 'workspace-1', name: 'Renamed project' } }
    } satisfies SessionEventFrame)
    socket.emit('session-event', {
      type: 'event.config.changed', seq: 2, epoch: 'global-1', session_id: '__global__',
      timestamp: '2026-07-24T01:00:01.000Z', payload: { changed_fields: ['default_model'] }
    } satisfies SessionEventFrame)
    socket.emit('session-event', {
      type: 'event.session.work_changed', seq: 11, epoch: 'epoch-1', session_id: 'session-other',
      timestamp: '2026-07-24T01:00:02.000Z', payload: { busy: true, main_turn_active: true }
    } satisfies SessionEventFrame)
    socket.emit('resync-required', { sessionId: '__global__', reason: 'buffer_overflow' })

    expect(events).toEqual([
      { scope: 'navigation', eventType: 'event.workspace.updated' },
      { scope: 'config', eventType: 'event.config.changed' },
      { scope: 'navigation', eventType: 'event.session.work_changed' },
      { scope: 'navigation', eventType: 'resync' },
      { scope: 'config', eventType: 'resync' }
    ])
    expect(controller.getState('session-1')?.messages).toHaveLength(1)
    controller.close()
  })

  it('projects authoritative transcript markers alongside the snapshot', async () => {
    const controller = new SessionSyncController({
      rest: {
        getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)),
        getSessionTranscript: vi.fn().mockResolvedValue({
          agent_id: 'main',
          items: [{
            kind: 'marker' as const,
            markerId: 'marker-1',
            marker: 'history_compacted',
            payload: { compactedCount: 4 },
            at: '2026-07-23T00:02:00.000Z'
          }],
          has_more: false,
          tasks: [], interactions: [], attachments: [],
          todos: [{
            todoId: 'todo-main',
            items: [{ title: 'Inspect the repository', status: 'done' }, { title: 'Implement the panel', status: 'in_progress' }],
            updatedAt: '2026-07-23T00:02:00.000Z'
          }],
          meta: {}, agents: [], pending_interactions: []
        })
      },
      socket: new FakeSocket()
    })

    const state = await controller.openSession('session-1')

    expect(state.workspaceRoot).toBe('/workspace')
    expect(state.markers).toEqual([{
      markerId: 'marker-1', marker: 'history_compacted', payload: { compactedCount: 4 },
      at: '2026-07-23T00:02:00.000Z'
    }])
    expect(state.todos).toEqual([{
      todoId: 'todo-main',
      items: [{ title: 'Inspect the repository', status: 'done' }, { title: 'Implement the panel', status: 'in_progress' }],
      updatedAt: '2026-07-23T00:02:00.000Z'
    }])
    controller.close()
  })

  it('updates the visible Todo list from a live Kimi tool display before the next resync', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'tool.use', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:03:00.000Z',
      payload: {
        toolCallId: 'tool-todo', name: 'TodoWrite', todoId: 'todo-live',
        display: {
          kind: 'todo_list',
          items: [{ title: 'Collect Kimi state', status: 'done' }, { title: 'Render it in Plan', status: 'in_progress' }]
        }
      }
    } satisfies SessionEventFrame)

    expect(controller.getState('session-1')?.todos).toEqual([{
      todoId: 'todo-live',
      items: [{ title: 'Collect Kimi state', status: 'done' }, { title: 'Render it in Plan', status: 'in_progress' }],
      updatedAt: '2026-07-23T00:03:00.000Z'
    }])
    controller.close()
  })

  it('updates the Todo list live from agent-core-v2 TodoList frames that carry args.todos without a display', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: {
        getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)),
        getSessionTranscript: vi.fn().mockResolvedValue({
          agent_id: 'main',
          items: [], has_more: false,
          tasks: [], interactions: [], attachments: [],
          todos: [{
            todoId: 'todo',
            items: [{ title: 'Old hydrated plan', status: 'in_progress' }],
            updatedAt: '2026-07-23T00:02:00.000Z'
          }],
          meta: {}, agents: [], pending_interactions: []
        })
      },
      socket
    })
    await controller.openSession('session-1')
    expect(controller.getState('session-1')?.todos).toHaveLength(1)

    // 真实服务端帧：tool.call.started + name=TodoList + args.todos，无 display
    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'tool.call.started', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:03:00.000Z',
      payload: {
        toolCallId: 'tool-todo-1', name: 'TodoList', agentId: 'main',
        args: {
          todos: [{ title: 'Collect Kimi state', status: 'done' }, { title: 'Render it in Plan', status: 'in_progress' }]
        }
      }
    } satisfies SessionEventFrame)

    // 无显式 todoId 时回退到服务端常量 'todo'，替换 hydrate 的条目而非追加
    expect(controller.getState('session-1')?.todos).toEqual([{
      todoId: 'todo',
      items: [{ title: 'Collect Kimi state', status: 'done' }, { title: 'Render it in Plan', status: 'in_progress' }],
      updatedAt: '2026-07-23T00:03:00.000Z'
    }])

    // 子代理自己的 TodoList 不覆盖主计划
    socket.cursors['session-1'] = { seq: 12, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'tool.call.started', seq: 12, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:03:30.000Z',
      payload: {
        toolCallId: 'tool-todo-2', name: 'TodoList', agentId: 'subagent-1',
        args: { todos: [{ title: 'Sub-agent private plan', status: 'in_progress' }] }
      }
    } satisfies SessionEventFrame)

    expect(controller.getState('session-1')?.todos).toEqual([{
      todoId: 'todo',
      items: [{ title: 'Collect Kimi state', status: 'done' }, { title: 'Render it in Plan', status: 'in_progress' }],
      updatedAt: '2026-07-23T00:03:00.000Z'
    }])
    controller.close()
  })

  it('keeps a BTW Side Chat agent-scoped and projects its streamed reply outside the main transcript', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')
    controller.startSideChat('session-1', 'agent-btw-1')
    controller.acceptSideChatPrompt('session-1', 'agent-btw-1', {
      prompt_id: 'prompt-btw-1', user_message_id: 'message-btw-user', status: 'running',
      content: [{ type: 'text', text: '只检查测试覆盖，不修改主任务。' }],
      created_at: '2026-07-24T00:00:00.000Z'
    })

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'turn.started', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-24T00:00:01.000Z', payload: { turnId: 9, agentId: 'agent-btw-1' }
    } satisfies SessionEventFrame)
    socket.emit('session-event', {
      type: 'turn.step.started', seq: 12, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-24T00:00:01.500Z', payload: { turnId: 9, step: 1, agentId: 'agent-btw-1' }
    } satisfies SessionEventFrame)
    socket.emit('session-event', {
      type: 'assistant.delta', seq: 13, epoch: 'epoch-1', session_id: 'session-1', offset: 0,
      timestamp: '2026-07-24T00:00:02.000Z', payload: { agentId: 'agent-btw-1', delta: '覆盖了核心路径。' }
    } satisfies SessionEventFrame)
    socket.emit('session-event', {
      type: 'turn.ended', seq: 14, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-24T00:00:03.000Z', payload: { agentId: 'agent-btw-1', reason: 'completed' }
    } satisfies SessionEventFrame)

    const state = controller.getState('session-1')
    expect(state?.sideChat).toEqual(expect.objectContaining({ agentId: 'agent-btw-1', active: false }))
    expect(state?.sideChat?.messages).toContainEqual(expect.objectContaining({
      role: 'user', content: [{ type: 'text', text: '只检查测试覆盖，不修改主任务。' }]
    }))
    expect(state?.sideChat?.messages).toContainEqual(expect.objectContaining({
      role: 'assistant', content: [{ type: 'text', text: '覆盖了核心路径。' }]
    }))
    expect(state?.messages).not.toContainEqual(expect.objectContaining({ id: 'message-btw-user' }))
    controller.close()
  })

  it('uses snapshot → cursor → subscribe and rebuilds after a volatile delta gap', async () => {
    const socket = new FakeSocket()
    const rest = {
      getSessionSnapshot: vi.fn()
        .mockResolvedValueOnce(makeSnapshot(10))
        .mockResolvedValueOnce(makeSnapshot(20, 'Recovered'))
    }
    const controller = new SessionSyncController({ rest, socket, reconnectBaseMs: 1 })

    const opened = await controller.openSession('session-1')
    expect(opened).toEqual(expect.objectContaining({ phase: 'ready', cursor: { seq: 10, epoch: 'epoch-1' } }))
    expect(socket.connect).toHaveBeenCalledWith({
      subscriptions: ['session-1'],
      cursors: { 'session-1': { seq: 10, epoch: 'epoch-1' } }
    })

    socket.emit('session-event', {
      type: 'assistant.delta',
      seq: 10,
      epoch: 'epoch-1',
      volatile: true,
      offset: 99,
      session_id: 'session-1',
      timestamp: '2026-07-23T00:02:00.000Z',
      payload: { delta: 'missed' }
    } satisfies SessionEventFrame)

    await vi.waitFor(() => expect(rest.getSessionSnapshot).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(controller.getState('session-1')).toEqual(expect.objectContaining({
      phase: 'ready',
      cursor: { seq: 20, epoch: 'epoch-1' },
      resyncCount: 1
    })))
    expect(socket.subscribe).toHaveBeenCalledWith(['session-1'])
    expect(controller.getState('session-1')?.messages[0]?.content).toContainEqual({
      type: 'text',
      text: 'Recovered'
    })
    controller.close()
  })

  it('hydrates the user message only from the accepted Kimi prompt response', async () => {
    const socket = new FakeSocket()
    const rest = { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) }
    const controller = new SessionSyncController({ rest, socket })
    await controller.openSession('session-1')

    const state = controller.acceptSubmittedPrompt('session-1', {
      prompt_id: 'prompt-2',
      user_message_id: 'message-2',
      status: 'queued',
      content: [{ type: 'text', text: 'Continue from here' }],
      created_at: '2026-07-23T00:03:00.000Z'
    })

    expect(state).toEqual(expect.objectContaining({
      activePromptId: 'prompt-2',
      activePromptStatus: 'queued'
    }))
    expect(state?.messages).toContainEqual(expect.objectContaining({
      id: 'message-2',
      role: 'user',
      status: 'pending',
      content: [{ type: 'text', text: 'Continue from here' }]
    }))
    controller.close()
  })

  it('marks a skill activation running before its authoritative turn event arrives', async () => {
    const socket = new FakeSocket()
    const idle = makeSnapshot(10)
    idle.session.busy = false
    idle.session.main_turn_active = false
    idle.in_flight_turn = null
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(idle) },
      socket
    })
    await controller.openSession('session-1')

    expect(controller.beginSkillActivation('session-1')).toEqual(expect.objectContaining({
      busy: true,
      mainTurnActive: true,
      activePromptId: null,
      activePromptStatus: 'running'
    }))
    controller.close()
  })

  it('rolls back only an unconfirmed optimistic Skill activation', async () => {
    const socket = new FakeSocket()
    const idle = makeSnapshot(10)
    idle.session.busy = false
    idle.session.main_turn_active = false
    idle.in_flight_turn = null
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(idle) },
      socket
    })
    await controller.openSession('session-1')
    controller.beginSkillActivation('session-1')

    expect(controller.rejectSkillActivation('session-1')).toEqual(expect.objectContaining({
      busy: false, mainTurnActive: false, activePromptStatus: null
    }))

    controller.beginSkillActivation('session-1')
    socket.emit('session-event', {
      type: 'turn.started', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:04:00.000Z', payload: { turnId: 2, agentId: 'main' }
    } satisfies SessionEventFrame)
    expect(controller.rejectSkillActivation('session-1')).toEqual(expect.objectContaining({
      busy: true, mainTurnActive: true, activePromptStatus: 'running'
    }))
    controller.close()
  })

  it('seeds pending approvals and questions from the authoritative snapshot', async () => {
    const snapshot = makeSnapshot(10)
    snapshot.pending_approvals = [{
      approval_id: 'approval-1',
      session_id: 'session-1',
      tool_call_id: 'tool-1',
      tool_name: 'Shell',
      action: 'Run a command',
      tool_input_display: { command: 'pnpm test' },
      created_at: '2026-07-23T00:02:00.000Z',
      expires_at: '2026-07-23T00:07:00.000Z'
    }]
    snapshot.pending_questions = [{
      question_id: 'question-1',
      session_id: 'session-1',
      questions: [{
        id: 'framework',
        question: 'Choose a framework',
        options: [
          { id: 'vue', label: 'Vue', recommended: true },
          { id: 'react', label: 'React' }
        ],
        multi_select: false,
        allow_other: true
      }],
      created_at: '2026-07-23T00:03:00.000Z'
    }]
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(snapshot) },
      socket: new FakeSocket()
    })

    const state = await controller.openSession('session-1')

    expect(state.pendingApprovals).toEqual([expect.objectContaining({
      approvalId: 'approval-1',
      toolName: 'Shell',
      display: '{"command":"pnpm test"}'
    })])
    expect(state.pendingQuestions).toEqual([expect.objectContaining({
      questionId: 'question-1',
      questions: [expect.objectContaining({
        id: 'framework',
        multiSelect: false,
        allowOther: true,
        options: [expect.objectContaining({ id: 'vue', recommended: true }), expect.any(Object)]
      })]
    })])
    controller.close()
  })

  it('applies live approval and question lifecycle events without transcript duplication', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.approval.requested',
      seq: 11,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:04:00.000Z',
      payload: {
        approval_id: 'approval-live',
        session_id: 'session-1',
        tool_call_id: 'tool-live',
        tool_name: 'WriteFile',
        action: 'Write app.ts',
        tool_input_display: 'app.ts',
        created_at: '2026-07-23T00:04:00.000Z',
        expires_at: '2026-07-23T00:09:00.000Z'
      }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.pendingApprovals).toHaveLength(1)

    socket.cursors['session-1'] = { seq: 12, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.approval.resolved',
      seq: 12,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:04:10.000Z',
      payload: { approval_id: 'approval-live', decision: 'approved' }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.pendingApprovals).toEqual([])

    socket.cursors['session-1'] = { seq: 13, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.question.requested',
      seq: 13,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:05:00.000Z',
      payload: {
        question_id: 'question-live',
        session_id: 'session-1',
        questions: [{
          id: 'choice',
          question: 'Continue?',
          options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }]
        }],
        created_at: '2026-07-23T00:05:00.000Z'
      }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.pendingQuestions).toEqual([
      expect.objectContaining({ questionId: 'question-live' })
    ])

    socket.cursors['session-1'] = { seq: 14, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.question.answered',
      seq: 14,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:05:10.000Z',
      payload: { question_id: 'question-live' }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.pendingQuestions).toEqual([])
    expect(controller.getState('session-1')?.messages).toHaveLength(1)
    expect(controller.getState('session-1')?.cursor).toEqual({ seq: 14, epoch: 'epoch-1' })
    controller.close()
  })

  it('advances the reconnect cursor for accepted no-op protocol events', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.session.work_changed',
      seq: 11,
      epoch: 'epoch-1',
      session_id: 'session-1',
      timestamp: '2026-07-23T00:06:00.000Z',
      payload: {}
    } satisfies SessionEventFrame)

    expect(controller.getState('session-1')?.cursor).toEqual({ seq: 11, epoch: 'epoch-1' })
    controller.close()
  })

  it('uses session work_changed as the authoritative main and background work fact', async () => {
    const socket = new FakeSocket()
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(makeSnapshot(10)) },
      socket
    })
    await controller.openSession('session-1')

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.session.work_changed', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:06:00.000Z',
      payload: { busy: true, main_turn_active: false, last_turn_reason: 'completed' }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')).toEqual(expect.objectContaining({
      busy: true,
      mainTurnActive: false,
      activePromptId: null,
      activePromptStatus: null
    }))

    socket.cursors['session-1'] = { seq: 12, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'event.session.work_changed', seq: 12, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:06:01.000Z',
      payload: { busy: false, main_turn_active: false }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.busy).toBe(false)
    controller.close()
  })

  it('keeps Session token totals and Context separate from plan usage', async () => {
    const socket = new FakeSocket()
    const snapshot = makeSnapshot(10)
    snapshot.session.usage = {
      input_tokens: 1_000,
      output_tokens: 200,
      cache_read_tokens: 300,
      cache_creation_tokens: 40,
      total_cost_usd: 0.12,
      context_tokens: 4_200,
      context_limit: 10_000,
      turn_count: 3
    }
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(snapshot) },
      socket
    })
    const opened = await controller.openSession('session-1')
    expect(opened.usage).toEqual({
      inputTokens: 1_000,
      outputTokens: 200,
      cacheReadTokens: 300,
      cacheCreationTokens: 40,
      totalCostUsd: 0.12,
      contextTokens: 4_200,
      contextLimit: 10_000,
      turnCount: 3
    })

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'agent.status.updated', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:06:00.000Z',
      payload: {
        agentId: 'main', contextTokens: 5_000, maxContextTokens: 10_000,
        usage: { total: { inputOther: 1_200, output: 250, inputCacheRead: 450, inputCacheCreation: 60 } }
      }
    } satisfies SessionEventFrame)
    expect(controller.getState('session-1')?.usage).toEqual(expect.objectContaining({
      inputTokens: 1_200,
      outputTokens: 250,
      cacheReadTokens: 450,
      cacheCreationTokens: 60,
      totalCostUsd: 0.12,
      contextTokens: 5_000,
      contextLimit: 10_000
    }))
    controller.close()
  })

  it('hydrates and updates the Subagent roster without mixing it into the main transcript', async () => {
    const socket = new FakeSocket()
    const initial = makeSnapshot(10)
    initial.subagents = [{
      id: 'agent-1', session_id: 'session-1', kind: 'subagent', description: 'Inspect API',
      status: 'running', created_at: '2026-07-23T00:00:00.000Z', subagent_phase: 'working',
      subagent_type: 'explore', parent_tool_call_id: 'tool-1'
    }]
    const controller = new SessionSyncController({
      rest: { getSessionSnapshot: vi.fn().mockResolvedValue(initial) },
      socket
    })

    const opened = await controller.openSession('session-1')
    expect(opened.agents).toEqual([
      expect.objectContaining({ id: 'main', role: 'main' }),
      expect.objectContaining({ id: 'agent-1', status: 'working', subagentType: 'explore' })
    ])

    socket.cursors['session-1'] = { seq: 11, epoch: 'epoch-1' }
    socket.emit('session-event', {
      type: 'subagent.completed', seq: 11, epoch: 'epoch-1', session_id: 'session-1',
      timestamp: '2026-07-23T00:05:00.000Z',
      payload: {
        subagentId: 'agent-1', resultSummary: 'API verified',
        usage: { inputOther: 10, output: 5, inputCacheRead: 2, inputCacheCreation: 1 },
        contextTokens: 100
      }
    } satisfies SessionEventFrame)

    expect(controller.getState('session-1')?.agents[1]).toEqual(expect.objectContaining({
      status: 'completed', outputPreview: 'API verified',
      usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5 })
    }))
    expect(controller.getState('session-1')?.messages).toHaveLength(1)
    controller.close()
  })

  it('does not publish an inactive session when a late interaction mutation resolves', async () => {
    const socket = new FakeSocket()
    const rest = {
      getSessionSnapshot: vi.fn(async (sessionId: string) => {
        const snapshot = makeSnapshot(10)
        snapshot.session.id = sessionId
        snapshot.session.title = sessionId
        return snapshot
      })
    }
    const controller = new SessionSyncController({ rest, socket })
    await controller.openSession('session-1')
    await controller.openSession('session-2')
    const listener = vi.fn()
    controller.on('state-changed', listener)

    controller.resolveApproval('session-1', 'approval-late')
    controller.resolveQuestion('session-1', 'question-late')

    expect(listener).not.toHaveBeenCalled()
    expect(controller.activeSessionId).toBe('session-2')
    controller.close()
  })
})
