import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectOptions, KimiWsClient } from '../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import type { KimiCursor } from '../../packages/kimi-adapter/src/wire/ws.js'
import { KimiSessionBridge } from '../../src/main/kimi/KimiSessionBridge.js'
import { KimiTerminalCompatibility } from '../../src/main/kimi/KimiTerminalCompatibility.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

class FakeSocket extends EventEmitter {
  cursors: Record<string, KimiCursor> = {}
  connect = vi.fn(async (options: ConnectOptions = {}) => {
    this.cursors = { ...(options.cursors ?? {}) }
  })
  subscribe = vi.fn(async () => ({}))
  unsubscribe = vi.fn(async () => ({}))
  close = vi.fn()
  attachTerminal = vi.fn()
  detachTerminal = vi.fn()

  setCursor(sessionId: string, cursor: KimiCursor): void {
    this.cursors[sessionId] = { ...cursor }
  }
}

class FakeRuntime extends EventEmitter {
  readonly state = {
    status: 'running' as const,
    mode: 'managed' as const,
    version: '0.29.0',
    serverId: 'server-1',
    origin: 'http://127.0.0.1:54959',
    error: null
  }
  readonly backend = 'v1' as const
  readonly submitPrompt = vi.fn(async () => ({
    prompt_id: 'prompt-1',
    user_message_id: 'message-1',
    status: 'running' as const
  }))
  readonly updateSessionGoalObjective = vi.fn(async () => ({}))
  readonly compactSession = vi.fn(async () => undefined)
  readonly undoSession = vi.fn(async () => undefined)
  readonly startSideChat = vi.fn(async () => ({ agent_id: 'agent-btw-1' }))
  readonly getSessionTranscript = vi.fn(async (_sessionId: string, options?: { agentId?: string }) => ({
    agent_id: options?.agentId ?? 'main', items: [], has_more: false, tasks: [], interactions: [],
    attachments: [], todos: [], meta: {}, agents: [], pending_interactions: []
  }))
  readonly readFile = vi.fn(async () => ({
    path: 'assets/preview.png',
    content: 'AA==',
    encoding: 'base64' as const,
    size: 1,
    truncated: false,
    etag: 'etag-image',
    mime: 'image/png',
    is_binary: true
  }))
  readonly searchFiles = vi.fn(async () => ({
    items: [{ path: 'src/App.vue', name: 'App.vue', kind: 'file' as const, score: 0.98, match_positions: [0] }],
    truncated: false
  }))
  readonly grepFiles = vi.fn(async () => ({
    files: [{ path: 'src/App.vue', matches: [{ line: 8, col: 3, text: 'const ready = true', before: [], after: [] }] }],
    files_scanned: 1, truncated: false, elapsed_ms: 2
  }))
  readonly downloadWorkspaceFile = vi.fn(async () => new Uint8Array([1, 2]))
  readonly openFile = vi.fn(async () => ({ opened: true as const }))
  readonly openFileIn = vi.fn(async () => ({ opened: true as const }))
  readonly revealFile = vi.fn(async () => ({ revealed: true as const }))
  snapshotMessages: Array<Record<string, unknown>> = []
  snapshotSubagents: Array<Record<string, unknown>> = []

  constructor(readonly socket: FakeSocket) {
    super()
  }

  createWsClient(): KimiWsClient {
    return this.socket as unknown as KimiWsClient
  }

  createRestClient(): unknown {
    return {
      submitPrompt: this.submitPrompt,
      updateSessionGoalObjective: this.updateSessionGoalObjective,
      compactSession: this.compactSession,
      undoSession: this.undoSession,
      startSideChat: this.startSideChat,
      readFile: this.readFile,
      searchFiles: this.searchFiles,
      grepFiles: this.grepFiles,
      downloadWorkspaceFile: this.downloadWorkspaceFile,
      openFile: this.openFile,
      openFileIn: this.openFileIn,
      revealFile: this.revealFile,
      getSessionTranscript: this.getSessionTranscript,
      getSessionStatus: vi.fn(async () => ({
        busy: false,
        model: 'kimi-for-coding',
        thinking_level: 'high',
        permission: 'manual',
        plan_mode: true,
        swarm_mode: false,
        context_tokens: 1200,
        max_context_tokens: 262_144,
        context_usage: 1200 / 262_144
      })),
      getSessionGoal: vi.fn(async () => ({
        goalId: 'goal-1', objective: '完成 P0', status: 'active' as const,
        turnsUsed: 3, tokensUsed: 4000, wallClockMs: 60000,
        budget: {
          tokenBudget: 10000, turnBudget: null, wallClockBudgetMs: null,
          remainingTokens: 6000, remainingTurns: null, remainingWallClockMs: null,
          tokenBudgetReached: false, turnBudgetReached: false,
          wallClockBudgetReached: false, overBudget: false
        }
      })),
      listTasks: vi.fn(async () => [{
        id: 'task-1', session_id: 'session-1', kind: 'bash' as const,
        description: '运行测试', status: 'running' as const, created_at: '2026-07-23T00:00:00.000Z'
      }]),
      getPromptQueue: vi.fn(async () => ({
        active: {
          prompt_id: 'prompt-active', user_message_id: 'message-active', status: 'running' as const,
          content: [{ type: 'text', text: '实现功能' }], created_at: '2026-07-23T00:00:00.000Z'
        },
        queued: [{
          prompt_id: 'prompt-queued', user_message_id: 'message-queued', status: 'queued' as const,
          content: [{ type: 'text', text: '继续测试' }], created_at: '2026-07-23T00:01:00.000Z'
        }]
      })),
      updateSessionGoal: vi.fn(async () => ({})),
      cancelTask: vi.fn(async () => ({ cancelled: true as const })),
      getSessionSnapshot: vi.fn(async () => ({
        as_of_seq: 1,
        epoch: 'epoch-1',
        session: {
          id: 'session-1',
          workspace_id: 'workspace-1',
          title: 'Terminal replay',
          created_at: '2026-07-23T00:00:00.000Z',
          updated_at: '2026-07-23T00:00:00.000Z',
          busy: false,
          main_turn_active: false,
          pending_interaction: 'none',
          metadata: { cwd: process.cwd() },
          agent_config: {},
          usage: {},
          permission_rules: [],
          message_count: 0,
          last_seq: 1
        },
        messages: { items: this.snapshotMessages, has_more: false },
        in_flight_turn: null,
        subagents: this.snapshotSubagents,
        pending_approvals: [],
        pending_questions: []
      }))
    }
  }
}

describe('KimiSessionBridge terminals', () => {
  it('relays Kimi global navigation and config invalidations without exposing config payloads', async () => {
    const socket = new FakeSocket()
    const runtime = new FakeRuntime(socket)
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    const events: unknown[] = []
    bridge.on('global-state-changed', (event) => events.push(event))

    socket.emit('session-event', {
      type: 'event.workspace.created', seq: 1, epoch: 'global-1', session_id: '__global__',
      timestamp: '2026-07-24T01:00:00.000Z', payload: { workspace: { id: 'workspace-2' } }
    })
    socket.emit('session-event', {
      type: 'event.config.changed', seq: 2, epoch: 'global-1', session_id: '__global__',
      timestamp: '2026-07-24T01:00:01.000Z', payload: { config: { raw: { api_key: 'never-forwarded' } } }
    })

    expect(events).toEqual([
      { scope: 'navigation', eventType: 'event.workspace.created' },
      { scope: 'config', eventType: 'event.config.changed' }
    ])
    await bridge.close()
  })

  it('only reads transcripts for authoritative subagents in the active Kimi Session', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    runtime.snapshotSubagents = [{
      id: 'agent-1', session_id: 'session-1', kind: 'subagent', description: 'Review tests',
      status: 'completed', created_at: '2026-07-23T00:00:00.000Z', subagent_type: 'review'
    }]
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    runtime.getSessionTranscript.mockClear()

    await expect(bridge.getAgentTranscript('session-1', 'agent-invented'))
      .rejects.toThrow('Kimi Agent is not part of the active Session')
    expect(runtime.getSessionTranscript).not.toHaveBeenCalled()

    await expect(bridge.getAgentTranscript('session-1', 'agent-1')).resolves.toEqual({
      agentId: 'agent-1', messages: [], hasMore: false, usage: null
    })
    expect(runtime.getSessionTranscript).toHaveBeenCalledWith('session-1', { agentId: 'agent-1', pageSize: 100 })

    runtime.getSessionTranscript.mockResolvedValueOnce({
      agent_id: 'agent-other', items: [], has_more: false, tasks: [], interactions: [],
      attachments: [], todos: [], meta: {}, agents: [], pending_interactions: []
    })
    await expect(bridge.getAgentTranscript('session-1', 'agent-1'))
      .rejects.toThrow('Kimi Agent transcript identity mismatch')
    await bridge.close()
  })

  it('starts and submits an agent-scoped Kimi BTW Side Chat without creating a main transcript prompt', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await expect(bridge.startSideChat('session-1')).resolves.toEqual(expect.objectContaining({ agentId: 'agent-btw-1' }))
    await expect(bridge.submitSideChatPrompt('session-1', 'agent-invented', {
      text: '不应发送',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false
      }
    })).rejects.toThrow('Kimi Side Chat is not active')
    expect(runtime.submitPrompt).not.toHaveBeenCalled()
    await bridge.submitSideChatPrompt('session-1', 'agent-btw-1', {
      text: '只检查当前测试',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false
      }
    })
    bridge.closeSideChat('session-1', 'agent-btw-1')

    expect(runtime.startSideChat).toHaveBeenCalledWith('session-1')
    expect(runtime.submitPrompt).toHaveBeenCalledWith('session-1', expect.objectContaining({
      agentId: 'agent-btw-1', content: [{ type: 'text', text: '只检查当前测试' }]
    }))
    await bridge.close()
  })

  it('compacts and undoes through Kimi before resyncing, restoring the last user draft', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    runtime.snapshotMessages = [{
      id: 'user-1', session_id: 'session-1', role: 'user',
      content: [
        { type: 'text', text: '继续完成实现' },
        { type: 'file', file_id: 'file-1', name: 'notes.md', media_type: 'text/markdown', size: 12 },
        { type: 'image', source: { kind: 'file', file_id: 'image-1' } }
      ],
      created_at: '2026-07-23T00:00:00.000Z'
    }]
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await bridge.compactSession('session-1', '保留安全边界')
    await expect(bridge.undoSession('session-1')).resolves.toEqual({
      text: '继续完成实现',
      attachments: [
        { fileId: 'file-1', name: 'notes.md', mediaType: 'text/markdown', size: 12 },
        { fileId: 'image-1', name: 'image-attachment', mediaType: 'image/png', size: 0 }
      ]
    })
    expect(runtime.compactSession).toHaveBeenCalledWith('session-1', '保留安全边界')
    expect(runtime.undoSession).toHaveBeenCalledWith('session-1', 1)
    await bridge.close()
  })

  it('reads Markdown images only through the bounded Session FS path', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await expect(bridge.readMarkdownImage('session-1', 'assets/preview.png')).resolves.toEqual({
      path: 'assets/preview.png', dataUrl: 'data:image/png;base64,AA==', mediaType: 'image/png', size: 1
    })
    expect(runtime.readFile).toHaveBeenCalledWith('session-1', 'assets/preview.png', {
      length: 10 * 1024 * 1024
    })
    await expect(bridge.readMarkdownImage('session-1', '/tmp/outside.png')).resolves.toBeNull()
    await bridge.close()
  })

  it('projects Kimi Session file search and external file actions without direct Renderer access', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await expect(bridge.searchFiles('session-1', 'app')).resolves.toEqual({
      items: [{ path: 'src/App.vue', name: 'App.vue', kind: 'file', score: 0.98, matchPositions: [0] }], truncated: false
    })
    await expect(bridge.grepFiles('session-1', 'ready')).resolves.toEqual({
      files: [{ path: 'src/App.vue', matches: [{ line: 8, column: 3, text: 'const ready = true', before: [], after: [] }] }],
      filesScanned: 1, truncated: false, elapsedMs: 2
    })
    await expect(bridge.downloadWorkspaceFile('session-1', 'src/App.vue')).resolves.toEqual(new Uint8Array([1, 2]))
    await bridge.openWorkspaceFile('session-1', 'src/App.vue', 8)
    await bridge.openWorkspaceFileIn('session-1', 'vscode', 'src/App.vue', 8)
    await bridge.revealWorkspaceFile('session-1', 'src/App.vue')

    expect(runtime.openFile).toHaveBeenCalledWith('session-1', 'src/App.vue', 8)
    expect(runtime.openFileIn).toHaveBeenCalledWith('session-1', 'vscode', 'src/App.vue', 8)
    expect(runtime.revealFile).toHaveBeenCalledWith('session-1', 'src/App.vue')
    await bridge.close()
  })

  it('creates a Kimi Goal through Session profile before submitting its first Prompt', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '完成所有 P0',
      goalObjective: '完成所有 P0',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false
      }
    })
    expect(runtime.updateSessionGoalObjective).toHaveBeenCalledWith('session-1', '完成所有 P0')
    expect(runtime.updateSessionGoalObjective.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.submitPrompt.mock.invocationCallOrder[0]!
    )
    await bridge.close()
  })

  it('submits reviewed visual annotations through ordinary Kimi prompt content', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitVisualAnnotation('session-1', {
      annotation: {
        schemaVersion: 1,
        page: {
          url: 'preview://workspace/index.html',
          title: 'Preview',
          viewport: { width: 800, height: 600, dpr: 2 }
        },
        target: {
          kind: 'element',
          selector: 'button.save',
          tag: 'button',
          textSnippet: '保存',
          rect: { x: 10, y: 20, width: 90, height: 36 }
        },
        comment: '增加按钮间距',
        capturedAt: '2026-07-23T00:00:00.000Z'
      },
      screenshot: {
        dataUrl: 'data:image/png;base64,AA==', width: 212, height: 104, fullPage: false
      }
    }, {
      model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false
    })
    expect(runtime.submitPrompt).toHaveBeenCalledWith('session-1', expect.objectContaining({
      metadata: { source: 'kimi-agent-browser-annotation', schema_version: 1 },
      model: 'kimi-for-coding',
      thinking: 'high',
      permissionMode: 'manual',
      planMode: true,
      swarmMode: false,
      content: [
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('未受信任观察数据')
        }),
        {
          type: 'image',
          source: { kind: 'base64', media_type: 'image/png', data: 'AA==' }
        }
      ]
    }))
    await bridge.close()
  })

  it('maps uploaded image, video and ordinary files to official Kimi content parts', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '检查这些附件',
      attachments: [
        { fileId: 'image-1', name: 'screen.png', mediaType: 'image/png', size: 120 },
        { fileId: 'video-1', name: 'demo.mp4', mediaType: 'video/mp4', size: 240 },
        { fileId: 'file-1', name: 'notes.md', mediaType: 'text/markdown', size: 60 }
      ],
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false
      }
    })

    expect(runtime.submitPrompt).toHaveBeenCalledWith('session-1', expect.objectContaining({
      content: [
        { type: 'text', text: '检查这些附件' },
        { type: 'image', source: { kind: 'file', file_id: 'image-1' } },
        { type: 'video', source: { kind: 'file', file_id: 'video-1' } },
        { type: 'file', file_id: 'file-1', name: 'notes.md', media_type: 'text/markdown', size: 60 }
      ]
    }))
    await bridge.close()
  })

  it('maps the authoritative Kimi session status without inventing UI state', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await expect(bridge.getRuntimeStatus('session-1')).resolves.toEqual({
      busy: false,
      model: 'kimi-for-coding',
      thinking: 'high',
      permissionMode: 'manual',
      planMode: true,
      swarmMode: false,
      contextTokens: 1200,
      maxContextTokens: 262_144,
      contextUsage: 1200 / 262_144
    })
    await bridge.close()
  })

  it('projects Goal, Background Tasks and the full Prompt queue from Kimi REST state', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await expect(bridge.getOperationalState('session-1')).resolves.toEqual(expect.objectContaining({
      goal: expect.objectContaining({ goalId: 'goal-1', objective: '完成 P0' }),
      tasks: [expect.objectContaining({ id: 'task-1', status: 'running' })],
      prompts: {
        active: expect.objectContaining({ promptId: 'prompt-active', textPreview: '实现功能' }),
        queued: [expect.objectContaining({ promptId: 'prompt-queued', textPreview: '继续测试' })]
      }
    }))
    await bridge.close()
  })

  it('treats repeated attach as a replay request instead of a no-op', async () => {
    const socket = new FakeSocket()
    const runtime = new FakeRuntime(socket)
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await bridge.attachTerminal('session-1', 'terminal-1', 0)
    await bridge.attachTerminal('session-1', 'terminal-1', 4)

    expect(socket.attachTerminal).toHaveBeenNthCalledWith(1, 'session-1', 'terminal-1', 0)
    expect(socket.attachTerminal).toHaveBeenNthCalledWith(2, 'session-1', 'terminal-1', 4)
    await bridge.close()
  })

  it('starts compatibility terminal cleanup as soon as the Runtime stops', async () => {
    const socket = new FakeSocket()
    const runtime = new FakeRuntime(socket)
    const dispose = vi.spyOn(KimiTerminalCompatibility.prototype, 'dispose').mockResolvedValue()
    try {
      new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
      runtime.emit('state-changed', { ...runtime.state, status: 'stopping' })
      await vi.waitFor(() => expect(dispose).toHaveBeenCalledOnce())
    } finally {
      dispose.mockRestore()
    }
  })
})
