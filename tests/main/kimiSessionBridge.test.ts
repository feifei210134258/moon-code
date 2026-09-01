import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { KimiApiError } from '../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import type { ConnectOptions, KimiWsClient } from '../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import type { KimiCursor } from '../../packages/kimi-adapter/src/wire/ws.js'
import type { PromptSubmitResult } from '../../packages/kimi-adapter/src/wire/schemas.js'
import { KimiSessionBridge } from '../../src/main/kimi/KimiSessionBridge.js'
import type { KimiConfigFileWatcher } from '../../src/main/kimi/KimiConfigFileWatcher.js'
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
  readonly submitPrompt = vi.fn(async (): Promise<PromptSubmitResult> => ({
    prompt_id: 'prompt-1',
    user_message_id: 'message-1',
    status: 'running' as const,
    content: [],
    created_at: '2026-07-23T00:00:00.000Z'
  }))
  readonly steerPrompts = vi.fn(async (_sessionId: string, promptIds: string[]) => ({
    steered: true,
    prompt_ids: promptIds
  }))
  readonly updateSessionGoalObjective = vi.fn(async () => ({}))
  readonly setSessionPlanMode = vi.fn(async (_sessionId: string, _planMode: boolean) => ({}))
  readonly setSessionSwarmMode = vi.fn(async (_sessionId: string, _swarmMode: boolean) => ({}))
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
  readonly getGitStatus = vi.fn(async () => ({
    branch: 'main', ahead: 1, behind: 2, entries: { 'src/App.vue': 'modified' as const },
    additions: 3, deletions: 1, pullRequest: null
  }))
  readonly downloadWorkspaceFile = vi.fn(async () => new Uint8Array([1, 2]))
  readonly openFile = vi.fn(async () => ({ opened: true as const }))
  readonly openFileIn = vi.fn(async () => ({ opened: true as const }))
  readonly revealFile = vi.fn(async () => ({ revealed: true as const }))
  snapshotMessages: Array<Record<string, unknown>> = []
  snapshotSubagents: Array<Record<string, unknown>> = []
  snapshotCwd: string | null = null

  constructor(readonly socket: FakeSocket) {
    super()
  }

  createWsClient(): KimiWsClient {
    return this.socket as unknown as KimiWsClient
  }

  createRestClient(): unknown {
    return {
      submitPrompt: this.submitPrompt,
      steerPrompts: this.steerPrompts,
      updateSessionGoalObjective: this.updateSessionGoalObjective,
      setSessionPlanMode: this.setSessionPlanMode,
      setSessionSwarmMode: this.setSessionSwarmMode,
      compactSession: this.compactSession,
      undoSession: this.undoSession,
      startSideChat: this.startSideChat,
      readFile: this.readFile,
      searchFiles: this.searchFiles,
      grepFiles: this.grepFiles,
      getGitStatus: this.getGitStatus,
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
        tower_mode: false,
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
          metadata: { cwd: this.snapshotCwd ?? process.cwd() },
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
    socket.emit('session-event', {
      type: 'event.session.archived', seq: 3, epoch: 'global-1', session_id: 'session-other',
      timestamp: '2026-07-24T01:00:02.000Z', payload: { workspace_id: 'workspace-1' }
    })

    expect(events).toEqual([
      { scope: 'navigation', eventType: 'event.workspace.created' },
      { scope: 'config', eventType: 'event.config.changed' },
      /* 归档事件仅透传非敏感会话 id（renderer 乐观移除用），不携带 payload */
      { scope: 'navigation', eventType: 'event.session.archived', sessionId: 'session-other' }
    ])
    await bridge.close()
  })

  it('turns Kimi config file changes into config invalidations without forwarding file contents', async () => {
    const socket = new FakeSocket()
    const runtime = new FakeRuntime(socket)
    const watcher = new class extends EventEmitter {
      readonly start = vi.fn()
      readonly close = vi.fn()
    }()
    const bridge = new KimiSessionBridge(
      runtime as unknown as KimiRuntimeManager,
      watcher as unknown as KimiConfigFileWatcher
    )
    // FakeRuntime 构造时已是 running，监听器应立即启动。
    expect(watcher.start).toHaveBeenCalledTimes(1)
    const events: unknown[] = []
    bridge.on('global-state-changed', (event) => events.push(event))

    watcher.emit('change')
    expect(events).toEqual([{ scope: 'config', eventType: 'kimi.config.file_changed' }])

    runtime.emit('state-changed', { ...runtime.state, status: 'stopped' })
    expect(watcher.close).toHaveBeenCalled()
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
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })).rejects.toThrow('Kimi Side Chat is not active')
    expect(runtime.submitPrompt).not.toHaveBeenCalled()
    await bridge.submitSideChatPrompt('session-1', 'agent-btw-1', {
      text: '只检查当前测试',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
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

  it('keeps text-like Markdown previewable when an older server mislabels it as binary', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    runtime.readFile.mockResolvedValueOnce({
      path: 'docs/notes.md',
      content: Buffer.from('# Notes\n\nReadable').toString('base64'),
      encoding: 'base64' as const,
      size: 17,
      truncated: false,
      etag: 'etag-notes',
      mime: 'text/markdown',
      is_binary: true
    })
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await expect(bridge.readFile('session-1', 'docs/notes.md')).resolves.toEqual(expect.objectContaining({
      path: 'docs/notes.md',
      content: '# Notes\n\nReadable',
      encoding: 'utf-8',
      isBinary: false
    }))
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
    /* cwd 下没有 src/App.vue；REST/本地解析都回退唯一命中仓库里的 renderer 副本 */
    await expect(bridge.workspaceFileSystemPath('session-1', 'src/App.vue'))
      .resolves.toBe(resolve(process.cwd(), 'src/renderer/src/App.vue'))
    await expect(bridge.workspaceFileSystemPath('session-1', '../outside.txt')).rejects.toThrow('escapes')

    expect(runtime.openFile).toHaveBeenCalledWith('session-1', 'src/renderer/src/App.vue', 8)
    expect(runtime.openFileIn).toHaveBeenCalledWith('session-1', 'vscode', 'src/renderer/src/App.vue', 8)
    expect(runtime.revealFile).toHaveBeenCalledWith('session-1', 'src/renderer/src/App.vue')
    await bridge.close()
  })

  it('accepts absolute workspace paths from tool events while keeping escapes rejected', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    /* kimi 0.39 的 file_io/diff display.path 是工作区绝对路径（绝对路径存在，不走回退） */
    const absoluteVue = resolve(process.cwd(), 'src/renderer/src/App.vue')
    await expect(bridge.workspaceFileSystemPath('session-1', absoluteVue)).resolves.toBe(absoluteVue)
    await expect(bridge.workspaceFileSystemPath('session-1', '/definitely/outside/app.vue')).rejects.toThrow('escapes')
    await expect(bridge.workspaceFileSystemPath('session-1', `${resolve(process.cwd(), 'src')}/../escape.ts`)).rejects.toThrow('escapes')

    /* REST 转发前折回工作区相对路径（绝对路径存在，不走回退） */
    await bridge.openWorkspaceFile('session-1', absoluteVue, 8)
    expect(runtime.openFile).toHaveBeenCalledWith('session-1', 'src/renderer/src/App.vue', 8)
    await bridge.revealWorkspaceFile('session-1', absoluteVue)
    expect(runtime.revealFile).toHaveBeenCalledWith('session-1', 'src/renderer/src/App.vue')
    await expect(bridge.downloadWorkspaceFile('session-1', absoluteVue))
      .resolves.toEqual(new Uint8Array([1, 2]))
    expect(runtime.downloadWorkspaceFile).toHaveBeenCalledWith('session-1', 'src/renderer/src/App.vue')
    await expect(bridge.openWorkspaceFile('session-1', '/definitely/outside/app.vue')).rejects.toThrow('escapes')
    await bridge.close()
  })

  it('resolves bare conversation filenames to their unique in-workspace location', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    /* 覆盖 cwd 指向临时目录的场景：session state 的 workspaceRoot 来自快照 */
    const root = await mkdtemp(join(tmpdir(), 'kimi-bridge-bare-'))
    await mkdir(join(root, '运行监控_原型'), { recursive: true })
    await writeFile(join(root, '运行监控_原型', 'index.html'), '<h1>k</h1>')
    runtime.snapshotCwd = root
    await bridge.openSession('session-1')

    /* 裸文件名（助手常写 `index.html:159`，行号在渲染端已剥）→ 子目录唯一命中 */
    await expect(bridge.workspaceFileSystemPath('session-1', 'index.html'))
      .resolves.toBe(join(root, '运行监控_原型', 'index.html'))
    /* REST 转发同样走回退：折回相对路径 */
    await bridge.openWorkspaceFile('session-1', 'index.html')
    expect(runtime.openFile).toHaveBeenCalledWith('session-1', '运行监控_原型/index.html', undefined)
    /* 歧义（两处同名）与未命中保持原样：相对路径原样转发、绝对路径原样返回 */
    await writeFile(join(root, 'index.html'), '<h1>root copy</h1>')
    await bridge.openWorkspaceFile('session-1', 'index.html')
    expect(runtime.openFile).toHaveBeenLastCalledWith('session-1', 'index.html', undefined)
    await bridge.close()
    await rm(root, { recursive: true, force: true })
  })

  it('projects missing Git as an available=false state while preserving unexpected failures', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')

    await expect(bridge.getGitStatus('session-1')).resolves.toEqual({
      available: true,
      branch: 'main', ahead: 1, behind: 2, entries: { 'src/App.vue': 'modified' },
      additions: 3, deletions: 1, pullRequest: null
    })

    runtime.getGitStatus.mockRejectedValueOnce(new KimiApiError('Git unavailable', {
      code: 40908, status: 409
    }))
    await expect(bridge.getGitStatus('session-1')).resolves.toEqual({
      available: false,
      branch: '', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
    })

    const unexpected = new KimiApiError('Permission denied', { code: 40301, status: 403 })
    runtime.getGitStatus.mockRejectedValueOnce(unexpected)
    await expect(bridge.getGitStatus('session-1')).rejects.toBe(unexpected)
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
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false, towerMode: false
      }
    })
    expect(runtime.updateSessionGoalObjective).toHaveBeenCalledWith('session-1', '完成所有 P0')
    expect(runtime.updateSessionGoalObjective.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.submitPrompt.mock.invocationCallOrder[0]!
    )
    await bridge.close()
  })

  it('submits a busy-turn guidance Prompt and steers its queued id immediately', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    runtime.submitPrompt.mockResolvedValueOnce({
      prompt_id: 'prompt-guidance',
      user_message_id: 'message-guidance',
      status: 'queued',
      content: [{ type: 'text', text: '先别收尾，补充检查错误状态' }],
      created_at: '2026-07-23T00:01:00.000Z'
    })
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '先别收尾，补充检查错误状态',
      deliveryMode: 'steer',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })
    expect(runtime.steerPrompts).toHaveBeenCalledWith('session-1', ['prompt-guidance'])
    await bridge.close()
  })

  it('prepends a picked-web-elements context part before the user text and attachments', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '根据这些元素调整样式',
      webElements: [
        {
          selector: 'button.save',
          xpath: '/html/body/button[1]',
          tag: 'button',
          ariaLabel: '保存按钮',
          textSnippet: '保存\n并退出',
          rect: { x: 10, y: 20, width: 90, height: 36 },
          pageUrl: 'preview://workspace/index.html',
          pageTitle: '预览页'
        }
      ],
      attachments: [{ fileId: 'file-1', name: 'notes.md', mediaType: 'text/markdown', size: 60 }],
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false, towerMode: false
      }
    })
    expect(runtime.submitPrompt).toHaveBeenCalledWith('session-1', expect.objectContaining({
      model: 'kimi-for-coding',
      thinking: 'high',
      permissionMode: 'manual',
      planMode: true,
      swarmMode: false, towerMode: false,
      content: [
        {
          type: 'text',
          text: [
            '用户在内置浏览器中选取了以下网页元素作为上下文（页面「预览页」preview://workspace/index.html）：',
            '',
            '1. <button> 保存按钮',
            '   selector: button.save',
            '   xpath: /html/body/button[1]',
            '   文本: 保存 并退出'
          ].join('\n')
        },
        { type: 'text', text: '根据这些元素调整样式' },
        { type: 'file', file_id: 'file-1', name: 'notes.md', media_type: 'text/markdown', size: 60 }
      ]
    }))
    await bridge.close()
  })

  it('forwards submitted skills as a structured skills array to the Kimi REST prompt', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '提交并生成 PDF',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      },
      skills: [
        { name: 'commit', args: '-m "feat: skills"' },
        { name: 'pdf' }
      ]
    })
    expect(runtime.submitPrompt).toHaveBeenCalledWith('session-1', expect.objectContaining({
      content: [{ type: 'text', text: '提交并生成 PDF' }],
      skills: [
        { name: 'commit', args: '-m "feat: skills"' },
        { name: 'pdf' }
      ]
    }))
    await bridge.close()
  })

  it('omits the REST skills field when the submission carries no skills', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '普通继续',
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })
    const submitted = runtime.submitPrompt.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(Object.prototype.hasOwnProperty.call(submitted[1], 'skills')).toBe(false)
    await bridge.close()
  })

  it('includes a compact 样式 line when a picked element carries computed styles', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '把这个按钮调大点',
      webElements: [
        {
          selector: 'button.save',
          xpath: '/html/body/button[1]',
          tag: 'button',
          ariaLabel: null,
          textSnippet: '保存',
          rect: { x: 10, y: 20, width: 90, height: 36 },
          pageUrl: 'preview://workspace/index.html',
          pageTitle: '预览页',
          styles: {
            display: 'inline-block',
            position: 'relative',
            fontFamily: 'PingFang SC',
            fontSize: '13px',
            fontWeight: 'normal',
            lineHeight: '1.5',
            color: '#fff',
            background: '#1d4ed8',
            padding: '8px 18px',
            margin: '0px',
            border: 'none',
            borderRadius: '6px'
          }
        }
      ],
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })
    const submitted = (runtime.submitPrompt.mock.calls[0] as unknown as [string, {
      content: Array<{ type: string; text?: string }>
    }])[1]
    const context = (submitted.content[0] as { text: string }).text
    expect(context).toContain('1. <button> 保存')
    expect(context).toContain(
      '   样式: display inline-block; position relative; font 13px/1.5 PingFang SC; ' +
      'color #fff; background #1d4ed8; padding 8px 18px; margin 0px; border-radius 6px'
    )
    await bridge.close()
  })

  it('falls back to the first text line when a picked element has no aria label', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.submitPrompt('session-1', {
      text: '检查这段文案',
      webElements: [
        {
          selector: 'h1.title',
          xpath: '/html/body/h1',
          tag: 'h1',
          ariaLabel: null,
          textSnippet: '欢迎使用 Moon Code',
          rect: { x: 0, y: 0, width: 400, height: 60 },
          pageUrl: 'https://example.com/welcome',
          pageTitle: 'Welcome'
        }
      ],
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })
    const submitted = (runtime.submitPrompt.mock.calls[0] as unknown as [string, {
      content: Array<{ type: string; text?: string }>
    }])[1]
    const context = submitted.content[0]
    expect(context).toMatchObject({ type: 'text' })
    expect((context as { text: string }).text).toContain('1. <h1> 欢迎使用 Moon Code')
    await bridge.close()
  })

  it('bounds picked elements before formatting them into the prompt context', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    const oversized: Array<Record<string, unknown>> = Array.from({ length: 30 }, (_value, index) => ({
      selector: `sel-${index}-${'x'.repeat(600)}`,
      xpath: '/html/body/div[1]',
      tag: 'div',
      ariaLabel: 'l'.repeat(300),
      textSnippet: 't'.repeat(400),
      rect: { x: 0, y: 0, width: 20, height: 20 },
      pageUrl: 'https://example.com/',
      pageTitle: 'T'.repeat(600)
    }))
    await bridge.submitPrompt('session-1', {
      text: '查看这些元素',
      webElements: oversized as unknown as Array<{
        selector: string; xpath: string; tag: string; ariaLabel: string | null; textSnippet: string;
        rect: { x: number; y: number; width: number; height: number }; pageUrl: string; pageTitle: string
      }>,
      controls: {
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
      }
    })
    const submitted = (runtime.submitPrompt.mock.calls[0] as unknown as [string, {
      content: Array<{ type: string; text?: string }>
    }])[1]
    const context = (submitted.content[0] as { text: string }).text
    const numberedLines = context.split('\n').filter((line) => /^\d+\. /.test(line))
    expect(numberedLines).toHaveLength(20)
    expect(context).not.toContain('sel-19-x'.repeat(30))
    expect(context).not.toContain('llllllll'.repeat(30))
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
        model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false, towerMode: false
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
      swarmMode: false, towerMode: false,
      contextTokens: 1200,
      maxContextTokens: 262_144,
      contextUsage: 1200 / 262_144
    })
    await bridge.close()
  })

  it('applies plan mode as session-level config through the profile route', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.setSessionPlanMode('session-1', true)
    expect(runtime.setSessionPlanMode).toHaveBeenCalledWith('session-1', true)
    await bridge.close()
  })

  it('applies swarm mode as session-level config through the profile route', async () => {
    const runtime = new FakeRuntime(new FakeSocket())
    const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)
    await bridge.openSession('session-1')
    await bridge.setSessionSwarmMode('session-1', true)
    expect(runtime.setSessionSwarmMode).toHaveBeenCalledWith('session-1', true)
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

describe('KimiSessionBridge workspace file suggestions', () => {
  it('forwards fs:suggest with the workspace root and maps items (kimi 0.39)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-suggest-'))
    try {
      const suggestFiles = vi.fn(async () => ({
        items: [{ path: 'src/main.ts', name: 'main.ts', kind: 'file' as const, score: 0.9, match_positions: [0, 1] }],
        truncated: true
      }))
      const runtime = new EventEmitter() as EventEmitter & { createRestClient: () => unknown }
      Object.assign(runtime, {
        state: { status: 'running', mode: 'managed', version: '0.39.0', serverId: 'server-1', origin: 'http://127.0.0.1:54959', error: null },
        createRestClient: () => ({
          listWorkspaces: vi.fn(async () => [{ id: 'workspace-1', name: 'demo', root }]),
          suggestFiles
        })
      })
      const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)

      await expect(bridge.suggestWorkspaceFiles('workspace-1', 'mai')).resolves.toEqual({
        items: [{ path: 'src/main.ts', name: 'main.ts', kind: 'file', score: 0.9, matchPositions: [0, 1] }],
        truncated: true
      })
      expect(suggestFiles).toHaveBeenCalledWith({ query: 'mai', roots: [root], limit: 50 })
      await expect(bridge.suggestWorkspaceFiles('workspace-missing', 'x')).rejects.toThrow('unavailable')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('KimiSessionBridge draft workspace listing', () => {
  it('lists the workspace directory locally with directories first and hidden entries skipped', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-ws-'))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'src', 'main.ts'), 'export {}\n')
      await writeFile(join(root, 'README.md'), '# demo\n')
      await writeFile(join(root, '.hidden'), '')
      const runtime = new EventEmitter() as EventEmitter & { createRestClient: () => unknown }
      Object.assign(runtime, {
        state: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:54959', error: null },
        createRestClient: () => ({
          listWorkspaces: vi.fn(async () => [{ id: 'workspace-1', name: 'demo', root }])
        })
      })
      const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)

      const listing = await bridge.listWorkspaceDirectory('workspace-1')
      expect(listing.path).toBe('.')
      expect(listing.truncated).toBe(false)
      expect(listing.items.map((entry) => entry.path)).toEqual(['src', 'README.md'])
      expect(listing.items[0]?.kind).toBe('directory')
      expect(listing.items[1]?.kind).toBe('file')

      const sub = await bridge.listWorkspaceDirectory('workspace-1', 'src')
      expect(sub.items.map((entry) => entry.path)).toEqual(['src/main.ts'])

      await expect(bridge.listWorkspaceDirectory('workspace-1', '../outside')).rejects.toThrow('escapes')
      await expect(bridge.listWorkspaceDirectory('workspace-missing')).rejects.toThrow('unavailable')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('resolves draft workspace paths for system-open/trash and reads local file previews', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-ws-'))
    try {
      await mkdir(join(root, 'src'))
      await writeFile(join(root, 'src', 'main.ts'), 'const x = 1\n')
      await writeFile(join(root, 'logo.bin'), Buffer.from([0x00, 0x01, 0x02]))
      const runtime = new EventEmitter() as EventEmitter & { createRestClient: () => unknown }
      Object.assign(runtime, {
        state: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:54959', error: null },
        createRestClient: () => ({
          listWorkspaces: vi.fn(async () => [{ id: 'workspace-1', name: 'demo', root }])
        })
      })
      const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)

      await expect(bridge.workspaceFileSystemPathFromWorkspace('workspace-1', 'src/main.ts')).resolves.toBe(join(root, 'src', 'main.ts'))
      await expect(bridge.workspaceFileSystemPathFromWorkspace('workspace-1', '.')).rejects.toThrow('escapes')
      await expect(bridge.workspaceFileSystemPathFromWorkspace('workspace-1', '../outside')).rejects.toThrow('escapes')
      await expect(bridge.workspaceFileSystemPathFromWorkspace('workspace-missing', 'src')).rejects.toThrow('unavailable')

      const textPreview = await bridge.readWorkspaceFileFromWorkspace('workspace-1', 'src/main.ts')
      expect(textPreview.content).toBe('const x = 1\n')
      expect(textPreview.isBinary).toBe(false)
      expect(textPreview.encoding).toBe('utf-8')
      expect(textPreview.lineCount).toBe(2)

      const binaryPreview = await bridge.readWorkspaceFileFromWorkspace('workspace-1', 'logo.bin')
      expect(binaryPreview.isBinary).toBe(true)
      expect(binaryPreview.content).toBe('')
      expect(binaryPreview.lineCount).toBeNull()

      await expect(bridge.readWorkspaceFileFromWorkspace('workspace-1', 'missing.ts')).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('KimiSessionBridge draft workspace git status', () => {
  it('detects the current branch with local git and reports non-repos as unavailable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'moon-code-git-'))
    const plain = await mkdtemp(join(tmpdir(), 'moon-code-plain-'))
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: root })
      const runtime = new EventEmitter() as EventEmitter & { createRestClient: () => unknown }
      Object.assign(runtime, {
        state: { status: 'running', mode: 'managed', version: '0.29.0', serverId: 'server-1', origin: 'http://127.0.0.1:54959', error: null },
        createRestClient: () => ({
          listWorkspaces: vi.fn(async () => [
            { id: 'workspace-1', name: 'demo', root },
            { id: 'workspace-2', name: 'plain', root: plain }
          ])
        })
      })
      const bridge = new KimiSessionBridge(runtime as unknown as KimiRuntimeManager)

      await expect(bridge.getWorkspaceGitStatus('workspace-1')).resolves.toEqual({
        available: true,
        branch: 'main', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })
      await expect(bridge.getWorkspaceGitStatus('workspace-2')).resolves.toEqual({
        available: false,
        branch: '', ahead: 0, behind: 0, entries: {}, additions: 0, deletions: 0, pullRequest: null
      })
      await expect(bridge.getWorkspaceGitStatus('workspace-missing')).resolves.toMatchObject({ available: false })
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(plain, { recursive: true, force: true })
    }
  })
})
