import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { readdir, stat as statFile, open as openFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  SessionSyncController,
  type GlobalSyncEvent,
  type SessionSyncView
} from '../../../packages/kimi-adapter/src/sync/SessionSyncController.js'
import type { KimiWsClient } from '../../../packages/kimi-adapter/src/transport/KimiWsClient.js'
import { KimiApiError } from '../../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import type { MessageContentPart, PromptSubmitResult } from '../../../packages/kimi-adapter/src/wire/schemas.js'
import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type { KimiConfigFileWatcher } from './KimiConfigFileWatcher.js'
import { KimiTerminalCompatibility } from './KimiTerminalCompatibility.js'
import { projectAgentTranscript } from './KimiAgentTranscriptProjector.js'
import type {
  BrowserPickedElement,
  BrowserPickedElementStyle,
  InteractionResolveResult,
  KimiPromptControls,
  KimiPromptInput,
  KimiSideChatPromptInput,
  KimiSideChatView,
  KimiAgentTranscript,
  KimiGlobalStateEvent,
  KimiUndoDraft,
  KimiPromptQueueItem,
  KimiSessionGoal,
  KimiSessionOperationalState,
  KimiSessionRuntimeStatus,
  PromptAbortResult,
  PromptSteerResult,
  PromptSubmissionResult,
  QuestionAnswerInput,
  QuestionDismissResult,
  SessionTerminal,
  TerminalExitEvent,
  TerminalOutputEvent,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceFileList,
  WorkspaceFilePreview,
  WorkspaceFileSearchResult,
  WorkspaceGrepResult,
  WorkspaceMarkdownImage,
  WorkspaceOpenApp,
  WorkspaceGitStatus,
  WorkspaceGitBranches
} from '../../shared/contracts.js'
import { sanitizePickedElements } from '../browser/elementPickSanitize.js'

const KIMI_FS_GIT_UNAVAILABLE = 40908
const execFileAsync = promisify(execFile)

export class KimiSessionBridge extends EventEmitter {
  readonly #runtime: KimiRuntimeManager
  readonly #configWatcher: KimiConfigFileWatcher | null
  #controller: SessionSyncController | null = null
  #socket: KimiWsClient | null = null
  readonly #terminalAttachments = new Set<string>()
  readonly #terminalCompatibility = new KimiTerminalCompatibility()

  constructor(runtime: KimiRuntimeManager, configWatcher: KimiConfigFileWatcher | null = null) {
    super()
    this.#runtime = runtime
    this.#configWatcher = configWatcher
    // 外部写入方（kimi code web、CLI、手工编辑 config.toml）不会让 Runtime 的
    // WS 发出任何通知（0.36 起服务端不再转发 config/model_catalog 事件，跨进程
    // 写入本来也没有事件）；config 文件变更因此在这里折算成既有的 config 失效
    // 信号，Renderer 仍通过官方 REST 重新读取权威快照。
    this.#configWatcher?.on('change', () => {
      this.emit('global-state-changed', { scope: 'config', eventType: 'kimi.config.file_changed' } satisfies KimiGlobalStateEvent)
    })
    runtime.on('state-changed', (state) => {
      if (state.status === 'running') this.#configWatcher?.start()
      if (state.status === 'stopping' || state.status === 'stopped' || state.status === 'error') {
        void this.close().catch((error: unknown) => this.emit('terminal-cleanup-error', error))
      }
    })
    if (this.#runtime.state.status === 'running') this.#configWatcher?.start()
    this.#terminalCompatibility.on('terminal-output', (output: TerminalOutputEvent) => {
      this.emit('terminal-output', output)
    })
    this.#terminalCompatibility.on('terminal-exit', (exit: TerminalExitEvent) => {
      this.#terminalAttachments.delete(terminalKey(exit.sessionId, exit.terminalId))
      this.emit('terminal-exit', exit)
    })
  }

  async openSession(sessionId: string): Promise<SessionSyncView> {
    if (this.#runtime.state.status !== 'running') throw new Error('Kimi runtime is not connected')
    const controller = this.#getController()
    const previousSessionId = controller.activeSessionId
    if (previousSessionId !== null && previousSessionId !== sessionId) {
      await this.#detachTerminalAttachments(previousSessionId)
    }
    return await controller.openSession(sessionId)
  }

  async getRuntimeStatus(sessionId: string): Promise<KimiSessionRuntimeStatus> {
    this.#assertActiveSession(sessionId)
    const status = await this.#runtime.createRestClient().getSessionStatus(sessionId)
    const permissionMode = status.permission
    if (permissionMode !== 'manual' && permissionMode !== 'auto' && permissionMode !== 'yolo') {
      throw new Error(`Unsupported Kimi permission mode: ${permissionMode}`)
    }
    return {
      busy: status.busy,
      model: status.model?.trim() || null,
      thinking: status.thinking_level,
      permissionMode,
      planMode: status.plan_mode,
      swarmMode: status.swarm_mode,
      contextTokens: status.context_tokens,
      maxContextTokens: status.max_context_tokens,
      contextUsage: status.context_usage
    }
  }

  async setSessionPlanMode(sessionId: string, enabled: boolean): Promise<void> {
    this.#assertActiveSession(sessionId)
    // Per-prompt plan_mode is ignored by recent runtimes; plan mode is
    // session-level config applied through the profile endpoint.
    await this.#runtime.createRestClient().setSessionPlanMode(sessionId, enabled)
  }

  async setSessionSwarmMode(sessionId: string, enabled: boolean): Promise<void> {
    this.#assertActiveSession(sessionId)
    // Same as plan mode: per-prompt swarm_mode is ignored by recent runtimes;
    // apply it as session-level config through the profile endpoint.
    await this.#runtime.createRestClient().setSessionSwarmMode(sessionId, enabled)
  }

  async getOperationalState(sessionId: string): Promise<KimiSessionOperationalState> {
    this.#assertActiveSession(sessionId)
    const client = this.#runtime.createRestClient()
    const [goal, tasks, prompts] = await Promise.all([
      client.getSessionGoal(sessionId),
      client.listTasks(sessionId),
      client.getPromptQueue(sessionId)
    ])
    return {
      goal: goal === null ? null : {
        goalId: goal.goalId,
        objective: goal.objective,
        completionCriterion: goal.completionCriterion ?? null,
        status: goal.status,
        turnsUsed: goal.turnsUsed,
        tokensUsed: goal.tokensUsed,
        wallClockMs: goal.wallClockMs,
        budget: { ...goal.budget },
        terminalReason: goal.terminalReason ?? null
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        sessionId: task.session_id,
        kind: task.kind,
        description: task.description,
        status: task.status,
        command: task.command ?? null,
        createdAt: nullableTimestampString(task.created_at),
        startedAt: nullableTimestampString(task.started_at),
        completedAt: nullableTimestampString(task.completed_at),
        outputPreview: task.output_preview ?? null,
        outputBytes: task.output_bytes ?? null
      })),
      prompts: {
        active: prompts.active === null ? null : projectPrompt(prompts.active),
        queued: prompts.queued.map(projectPrompt)
      }
    }
  }

  async compactSession(sessionId: string, instruction?: string): Promise<void> {
    this.#assertActiveSession(sessionId)
    await this.#runtime.createRestClient().compactSession(sessionId, instruction)
    await this.#getController().refreshSession(sessionId)
  }

  async undoSession(sessionId: string, count = 1): Promise<KimiUndoDraft | null> {
    this.#assertActiveSession(sessionId)
    const state = this.#getController().getState(sessionId)
    const draft = state === null ? null : undoDraft(state.messages)
    await this.#runtime.createRestClient().undoSession(sessionId, count)
    await this.#getController().refreshSession(sessionId)
    return draft
  }

  async controlGoal(
    sessionId: string,
    control: 'pause' | 'resume' | 'cancel'
  ): Promise<KimiSessionGoal | null> {
    this.#assertActiveSession(sessionId)
    const client = this.#runtime.createRestClient()
    await client.updateSessionGoal(sessionId, control)
    const goal = await client.getSessionGoal(sessionId)
    return goal === null ? null : {
      goalId: goal.goalId,
      objective: goal.objective,
      completionCriterion: goal.completionCriterion ?? null,
      status: goal.status,
      turnsUsed: goal.turnsUsed,
      tokensUsed: goal.tokensUsed,
      wallClockMs: goal.wallClockMs,
      budget: { ...goal.budget },
      terminalReason: goal.terminalReason ?? null
    }
  }

  async cancelTask(sessionId: string, taskId: string): Promise<{ cancelled: true }> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().cancelTask(sessionId, taskId)
  }

  async submitPrompt(sessionId: string, input: KimiPromptInput): Promise<PromptSubmissionResult> {
    if (input.goalObjective !== undefined) {
      this.#assertActiveSession(sessionId)
      await this.#runtime.createRestClient().updateSessionGoalObjective(sessionId, input.goalObjective)
    }
    const content: MessageContentPart[] = []
    const webElements = input.webElements ?? []
    if (webElements.length > 0) {
      content.push({
        type: 'text',
        text: formatWebElementsContext(
          sanitizePickedElements(webElements, (value) => String(value), (value) => String(value))
        )
      })
    }
    if (input.text.trim().length > 0) content.push({ type: 'text', text: input.text })
    for (const attachment of input.attachments ?? []) {
      if (attachment.mediaType.startsWith('image/')) {
        content.push({ type: 'image', source: { kind: 'file', file_id: attachment.fileId } })
      } else if (attachment.mediaType.startsWith('video/')) {
        content.push({ type: 'video', source: { kind: 'file', file_id: attachment.fileId } })
      } else {
        content.push({
          type: 'file',
          file_id: attachment.fileId,
          name: attachment.name,
          media_type: attachment.mediaType,
          size: attachment.size
        })
      }
    }
    const result = await this.#submitContent(
      sessionId,
      content,
      undefined,
      input.controls,
      input.skills
    )
    if (input.deliveryMode === 'steer' && result.status === 'queued') {
      await this.steerPrompts(sessionId, [result.promptId])
    }
    return result
  }

  async startSideChat(sessionId: string): Promise<KimiSideChatView> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().startSideChat(sessionId)
    return this.#getController().startSideChat(sessionId, result.agent_id)
  }

  async submitSideChatPrompt(
    sessionId: string,
    agentId: string,
    input: KimiSideChatPromptInput
  ): Promise<PromptSubmissionResult> {
    this.#assertActiveSession(sessionId)
    const controller = this.#getController()
    if (controller.getState(sessionId)?.sideChat?.agentId !== agentId) {
      throw new Error('Kimi Side Chat is not active')
    }
    const result = await this.#runtime.createRestClient().submitPrompt(sessionId, {
      content: [{ type: 'text', text: input.text }],
      agentId,
      model: input.controls.model,
      thinking: input.controls.thinking,
      permissionMode: input.controls.permissionMode,
      planMode: input.controls.planMode,
      swarmMode: input.controls.swarmMode
    })
    controller.acceptSideChatPrompt(sessionId, agentId, result)
    return {
      promptId: result.prompt_id,
      userMessageId: result.user_message_id,
      status: result.status
    }
  }

  closeSideChat(sessionId: string, agentId: string): void {
    this.#assertActiveSession(sessionId)
    this.#getController().closeSideChat(sessionId, agentId)
  }

  async getAgentTranscript(sessionId: string, agentId: string): Promise<KimiAgentTranscript> {
    this.#assertActiveSession(sessionId)
    const state = this.#getController().getState(sessionId)
    if (!state?.agents.some((agent) => agent.role === 'subagent' && agent.id === agentId)) {
      throw new Error('Kimi Agent is not part of the active Session')
    }
    const transcript = await this.#runtime.createRestClient().getSessionTranscript(sessionId, {
      agentId,
      pageSize: 100
    })
    if (transcript.agent_id !== agentId) throw new Error('Kimi Agent transcript identity mismatch')
    return projectAgentTranscript(sessionId, agentId, transcript)
  }

  async #submitContent(
    sessionId: string,
    content: MessageContentPart[],
    metadata: Record<string, unknown> | undefined,
    controls: KimiPromptControls,
    skills?: KimiPromptInput['skills']
  ): Promise<PromptSubmissionResult> {
    const controller = this.#getController()
    if (controller.activeSessionId !== sessionId) throw new Error('Kimi session is not active')
    const result = await this.#runtime.createRestClient().submitPrompt(sessionId, {
      content,
      ...(metadata === undefined ? {} : { metadata }),
      model: controls.model,
      thinking: controls.thinking,
      permissionMode: controls.permissionMode,
      planMode: controls.planMode,
      swarmMode: controls.swarmMode,
      ...(skills === undefined || skills.length === 0 ? {} : { skills })
    })
    controller.acceptSubmittedPrompt(sessionId, result)
    return {
      promptId: result.prompt_id,
      userMessageId: result.user_message_id,
      status: result.status
    }
  }

  async steerPrompts(sessionId: string, promptIds: string[]): Promise<PromptSteerResult> {
    const result = await this.#runtime.createRestClient().steerPrompts(sessionId, promptIds)
    return { steered: result.steered, promptIds: result.prompt_ids }
  }

  async abortPrompt(sessionId: string, promptId: string): Promise<PromptAbortResult> {
    const result = await this.#runtime.createRestClient().abortPrompt(sessionId, promptId)
    return { aborted: result.aborted, atSeq: result.at_seq ?? null }
  }

  async abortSession(sessionId: string): Promise<{ aborted: boolean }> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().abortSession(sessionId)
  }

  beginSkillActivation(sessionId: string): SessionSyncView | null {
    return this.#controller?.beginSkillActivation(sessionId) ?? null
  }

  rejectSkillActivation(sessionId: string): SessionSyncView | null {
    return this.#controller?.rejectSkillActivation(sessionId) ?? null
  }

  async respondApproval(
    sessionId: string,
    approvalId: string,
    response: {
      decision: 'approved' | 'rejected' | 'cancelled'
      scope?: 'session'
      feedback?: string
      selectedLabel?: string
    }
  ): Promise<InteractionResolveResult> {
    const result = await this.#runtime.createRestClient().respondApproval(sessionId, approvalId, response)
    this.#controller?.resolveApproval(sessionId, approvalId)
    return { resolved: result.resolved, resolvedAt: timestampString(result.resolved_at) }
  }

  async respondQuestion(
    sessionId: string,
    questionId: string,
    answers: Record<string, QuestionAnswerInput>
  ): Promise<InteractionResolveResult> {
    const result = await this.#runtime.createRestClient().respondQuestion(sessionId, questionId, {
      answers,
      method: 'click'
    })
    this.#controller?.resolveQuestion(sessionId, questionId)
    return { resolved: result.resolved, resolvedAt: timestampString(result.resolved_at) }
  }

  async dismissQuestion(sessionId: string, questionId: string): Promise<QuestionDismissResult> {
    const result = await this.#runtime.createRestClient().dismissQuestion(sessionId, questionId)
    this.#controller?.resolveQuestion(sessionId, questionId)
    return { dismissed: result.dismissed, dismissedAt: timestampString(result.dismissed_at) }
  }

  async listFiles(sessionId: string, path = '.'): Promise<WorkspaceFileList> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().listFiles(sessionId, { path })
    return {
      path,
      items: result.items.map(projectFileEntry),
      truncated: result.truncated
    }
  }

  /* 草稿态会话尚未创建，走不了 runtime 的 session fs:list；工作区 root 本就指向
     本地目录，这里直接读文件系统。语义对齐 runtime 默认值（depth 1、隐藏文件
     不展示、目录在前、500 条截断），git 状态等装饰等会话建立后由 runtime 口径覆盖。 */
  async listWorkspaceDirectory(workspaceId: string, path = '.'): Promise<WorkspaceFileList> {
    const workspaces = await this.#runtime.createRestClient().listWorkspaces()
    const root = workspaces.find((workspace) => workspace.id === workspaceId)?.root ?? ''
    if (root.length === 0) throw new Error('Kimi Workspace path is unavailable')
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '')
    const isRoot = normalized.length === 0 || normalized === '.'
    if (
      !isRoot &&
      (normalized.startsWith('/') ||
        /^[A-Za-z]:\//.test(normalized) ||
        normalized.split('/').some((segment) => segment === '..'))
    ) throw new Error('Workspace file path escapes the active Kimi Workspace')
    const resolvedRoot = resolve(root)
    const target = isRoot ? resolvedRoot : resolve(resolvedRoot, ...normalized.split('/'))
    const inside = relative(resolvedRoot, target)
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new Error('Workspace file path escapes the active Kimi Workspace')
    }
    const dirents = await readdir(target, { withFileTypes: true })
    const visible = dirents.filter((entry) => !entry.name.startsWith('.'))
    const sorted = visible.sort((left, right) => {
      const leftDir = left.isDirectory() ? 0 : 1
      const rightDir = right.isDirectory() ? 0 : 1
      return leftDir - rightDir || left.name.localeCompare(right.name)
    })
    const limit = 500
    const items = sorted.slice(0, limit).map((entry): WorkspaceFileEntry => ({
      path: isRoot ? entry.name : `${normalized}/${entry.name}`,
      name: entry.name,
      kind: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
      size: null,
      modifiedAt: null,
      mime: null,
      languageId: null,
      isBinary: false,
      gitStatus: null,
      childCount: null
    }))
    return { path: isRoot ? '.' : normalized, items, truncated: sorted.length > limit }
  }

  async readFile(sessionId: string, path: string): Promise<WorkspaceFilePreview> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().readFile(sessionId, path)
    const textFallback = decodeTextFallback(result.path, result.encoding, result.content, result.is_binary)
    return {
      path: result.path,
      content: textFallback.content,
      encoding: textFallback.encoding,
      size: result.size,
      truncated: result.truncated,
      mime: result.mime,
      languageId: result.language_id ?? null,
      lineCount: result.line_count ?? null,
      isBinary: textFallback.isBinary
    }
  }

  /* 草稿态（会话尚未创建）的文件预览：直接读工作区本地文件。
     大小、行数、截断口径对齐 runtime readFile 的默认值。 */
  async readWorkspaceFileFromWorkspace(workspaceId: string, path: string): Promise<WorkspaceFilePreview> {
    const target = await this.workspaceFileSystemPathFromWorkspace(workspaceId, path)
    const stat = await statFile(target)
    const limit = 200 * 1024
    const bytes = await readFileLimited(target, limit + 1)
    const truncated = bytes.length > limit
    const slice = truncated ? bytes.subarray(0, limit) : bytes
    const binary = slice.includes(0)
    const text = binary ? '' : slice.toString('utf8')
    return {
      path,
      content: text,
      encoding: 'utf-8',
      size: stat.size,
      truncated,
      mime: '',
      languageId: null,
      lineCount: binary ? null : text.split('\n').length,
      isBinary: binary
    }
  }

  async searchFiles(sessionId: string, query: string): Promise<WorkspaceFileSearchResult> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().searchFiles(sessionId, query)
    return {
      items: result.items.map((item) => ({
        path: item.path,
        name: item.name,
        kind: item.kind,
        score: item.score,
        matchPositions: [...item.match_positions]
      })),
      truncated: result.truncated
    }
  }

  async grepFiles(sessionId: string, pattern: string): Promise<WorkspaceGrepResult> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().grepFiles(sessionId, pattern)
    return {
      files: result.files.map((file) => ({
        path: file.path,
        matches: file.matches.map((match) => ({
          line: match.line,
          column: match.col,
          text: match.text,
          before: [...match.before],
          after: [...match.after]
        }))
      })),
      filesScanned: result.files_scanned,
      truncated: result.truncated,
      elapsedMs: result.elapsed_ms
    }
  }

  async downloadWorkspaceFile(sessionId: string, path: string): Promise<Uint8Array> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().downloadWorkspaceFile(sessionId, path)
  }

  async openWorkspaceFile(sessionId: string, path: string, line?: number): Promise<{ opened: true }> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().openFile(sessionId, path, line)
  }

  async openWorkspaceFileIn(
    sessionId: string,
    appId: WorkspaceOpenApp,
    path: string,
    line?: number
  ): Promise<{ opened: true }> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().openFileIn(sessionId, appId, path, line)
  }

  async revealWorkspaceFile(sessionId: string, path: string): Promise<{ revealed: true }> {
    this.#assertActiveSession(sessionId)
    return await this.#runtime.createRestClient().revealFile(sessionId, path)
  }

  workspaceFileSystemPath(sessionId: string, path: string): string {
    this.#assertActiveSession(sessionId)
    const state = this.#getController().getState(sessionId)
    if (state === null || state.workspaceRoot.length === 0) throw new Error('Kimi Workspace path is unavailable')
    return this.#resolveInsideWorkspace(state.workspaceRoot, path)
  }

  /* 草稿态（会话尚未创建）与 workspaceFileSystemPath 同一套越界校验，
     只是根从 session state 换成 REST 的 workspace root。 */
  async workspaceFileSystemPathFromWorkspace(workspaceId: string, path: string): Promise<string> {
    const workspaces = await this.#runtime.createRestClient().listWorkspaces()
    const root = workspaces.find((workspace) => workspace.id === workspaceId)?.root ?? ''
    if (root.length === 0) throw new Error('Kimi Workspace path is unavailable')
    return this.#resolveInsideWorkspace(root, path)
  }

  #resolveInsideWorkspace(workspaceRoot: string, path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '')
    if (
      normalized.length === 0 ||
      normalized === '.' ||
      normalized.startsWith('/') ||
      /^[A-Za-z]:\//.test(normalized) ||
      normalized.split('/').some((segment) => segment === '..')
    ) throw new Error('Workspace file path escapes the active Kimi Workspace')
    const root = resolve(workspaceRoot)
    const target = resolve(root, ...normalized.split('/'))
    const inside = relative(root, target)
    if (inside.length === 0 || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new Error('Workspace file path escapes the active Kimi Workspace')
    }
    return target
  }

  async readMarkdownImage(sessionId: string, source: string): Promise<WorkspaceMarkdownImage | null> {
    this.#assertActiveSession(sessionId)
    const state = this.#getController().getState(sessionId)
    if (state === null || state.workspaceRoot.length === 0) return null
    const path = markdownImagePath(state.workspaceRoot, source)
    if (path === null) return null
    const result = await this.#runtime.createRestClient().readFile(sessionId, path, { length: 10 * 1024 * 1024 })
    if (
      !result.is_binary ||
      result.encoding !== 'base64' ||
      result.truncated ||
      !result.mime.toLowerCase().startsWith('image/')
    ) return null
    return {
      path: result.path,
      dataUrl: `data:${result.mime};base64,${result.content}`,
      mediaType: result.mime,
      size: result.size
    }
  }

  async getGitStatus(sessionId: string): Promise<WorkspaceGitStatus> {
    this.#assertActiveSession(sessionId)
    try {
      const result = await this.#runtime.createRestClient().getGitStatus(sessionId)
      return {
        available: true,
        branch: result.branch,
        ahead: result.ahead,
        behind: result.behind,
        entries: result.entries,
        additions: result.additions,
        deletions: result.deletions,
        pullRequest: result.pullRequest
      }
    } catch (error) {
      if (!(error instanceof KimiApiError) || error.code !== KIMI_FS_GIT_UNAVAILABLE) throw error
      return {
        available: false,
        branch: '',
        ahead: 0,
        behind: 0,
        entries: {},
        additions: 0,
        deletions: 0,
        pullRequest: null
      }
    }
  }

  async listGitBranches(sessionId: string): Promise<WorkspaceGitBranches> {
    this.#assertActiveSession(sessionId)
    const root = this.#getController().getState(sessionId)?.workspaceRoot ?? ''
    if (root.length === 0) return { available: false, current: null, branches: [] }
    try {
      const [refs, current] = await Promise.all([
        execFileAsync(
          'git',
          ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads'],
          { cwd: root, timeout: 5_000 }
        ),
        execFileAsync('git', ['branch', '--show-current'], { cwd: root, timeout: 5_000 })
      ])
      const branches = refs.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const currentBranch = current.stdout.trim()
      return {
        available: true,
        current: currentBranch.length > 0 ? currentBranch : null,
        branches
      }
    } catch {
      // git missing or the Workspace is not a repository: the TopBar just hides the list.
      return { available: false, current: null, branches: [] }
    }
  }

  async getFileDiff(sessionId: string, path: string): Promise<WorkspaceFileDiff> {
    this.#assertActiveSession(sessionId)
    const result = await this.#runtime.createRestClient().getFileDiff(sessionId, path)
    return { path: result.path, diff: result.diff, truncated: result.truncated }
  }

  async listTerminals(sessionId: string): Promise<SessionTerminal[]> {
    this.#assertActiveSession(sessionId)
    if (this.#usesTerminalCompatibility()) return this.#terminalCompatibility.list(sessionId)
    const terminals = await this.#runtime.createRestClient().listTerminals(sessionId)
    return terminals.map(projectTerminal)
  }

  async createTerminal(
    sessionId: string,
    size: { cols: number; rows: number }
  ): Promise<SessionTerminal> {
    this.#assertActiveSession(sessionId)
    if (this.#usesTerminalCompatibility()) {
      const snapshot = await this.#runtime.createRestClient().getSessionSnapshot(sessionId)
      return await this.#terminalCompatibility.create(sessionId, snapshot.session.metadata.cwd, size)
    }
    const terminal = await this.#runtime.createRestClient().createTerminal(sessionId, size)
    return projectTerminal(terminal)
  }

  async attachTerminal(sessionId: string, terminalId: string, sinceSeq?: number): Promise<void> {
    this.#assertActiveSession(sessionId)
    const key = terminalKey(sessionId, terminalId)
    const wasAttached = this.#terminalAttachments.has(key)
    this.#terminalAttachments.add(key)
    try {
      if (this.#usesTerminalCompatibility()) {
        this.#terminalCompatibility.attach(sessionId, terminalId, sinceSeq)
      } else {
        await this.#getSocket().attachTerminal(sessionId, terminalId, sinceSeq)
      }
    } catch (error) {
      if (!wasAttached) this.#terminalAttachments.delete(key)
      throw error
    }
  }

  async detachTerminal(sessionId: string, terminalId: string): Promise<void> {
    const key = terminalKey(sessionId, terminalId)
    if (!this.#terminalAttachments.has(key)) return
    try {
      if (this.#usesTerminalCompatibility()) {
        this.#terminalCompatibility.detach(sessionId, terminalId)
      } else {
        await this.#getSocket().detachTerminal(sessionId, terminalId)
      }
    } finally {
      this.#terminalAttachments.delete(key)
    }
  }

  async sendTerminalInput(sessionId: string, terminalId: string, data: string): Promise<void> {
    this.#assertActiveSession(sessionId)
    if (!this.#terminalAttachments.has(terminalKey(sessionId, terminalId))) {
      throw new Error('Kimi terminal is not attached')
    }
    if (this.#usesTerminalCompatibility()) this.#terminalCompatibility.write(sessionId, terminalId, data)
    else await this.#getSocket().sendTerminalInput(sessionId, terminalId, data)
  }

  async resizeTerminal(
    sessionId: string,
    terminalId: string,
    cols: number,
    rows: number
  ): Promise<void> {
    this.#assertActiveSession(sessionId)
    if (!this.#terminalAttachments.has(terminalKey(sessionId, terminalId))) return
    if (this.#usesTerminalCompatibility()) this.#terminalCompatibility.resize(sessionId, terminalId, cols, rows)
    else await this.#getSocket().resizeTerminal(sessionId, terminalId, cols, rows)
  }

  async closeTerminal(sessionId: string, terminalId: string): Promise<{ closed: boolean }> {
    this.#assertActiveSession(sessionId)
    const key = terminalKey(sessionId, terminalId)
    try {
      if (this.#usesTerminalCompatibility()) {
        return await this.#terminalCompatibility.close(sessionId, terminalId)
      }
      if (this.#terminalAttachments.has(key)) {
        await this.#getSocket().closeTerminal(sessionId, terminalId)
        return { closed: true }
      }
      const result = await this.#runtime.createRestClient().closeTerminal(sessionId, terminalId)
      return { closed: result.closed }
    } finally {
      this.#terminalAttachments.delete(key)
    }
  }

  async close(): Promise<void> {
    this.#configWatcher?.close()
    this.#controller?.close()
    this.#controller = null
    this.#socket = null
    this.#terminalAttachments.clear()
    await this.#terminalCompatibility.dispose()
  }

  #getController(): SessionSyncController {
    if (this.#controller !== null) return this.#controller
    const socket = this.#runtime.createWsClient({ clientId: 'kimi-agent-desktop-main' })
    const controller = new SessionSyncController({
      rest: this.#runtime.createRestClient(),
      socket
    })
    controller.on('state-changed', (state: SessionSyncView) => this.emit('state-changed', state))
    controller.on('global-event', (event: GlobalSyncEvent) => {
      this.emit('global-state-changed', mapGlobalSyncEvent(event))
    })
    socket.on('terminal-output', (output: TerminalOutputEvent) => this.emit('terminal-output', output))
    socket.on('terminal-exit', (exit: TerminalExitEvent) => {
      this.#terminalAttachments.delete(terminalKey(exit.sessionId, exit.terminalId))
      this.emit('terminal-exit', exit)
    })
    this.#socket = socket
    this.#controller = controller
    return controller
  }

  #getSocket(): KimiWsClient {
    this.#getController()
    if (this.#socket === null) throw new Error('Kimi WebSocket is unavailable')
    return this.#socket
  }

  #assertActiveSession(sessionId: string): void {
    const controller = this.#getController()
    if (controller.activeSessionId !== sessionId) throw new Error('Kimi session is not active')
  }

  #usesTerminalCompatibility(): boolean {
    return this.#runtime.backend === 'v2'
  }

  async #detachTerminalAttachments(sessionId: string): Promise<void> {
    const terminalIds = [...this.#terminalAttachments]
      .map(splitTerminalKey)
      .filter((attachment) => attachment.sessionId === sessionId)
      .map((attachment) => attachment.terminalId)
    await Promise.all(terminalIds.map(async (terminalId) => {
      try {
        await this.detachTerminal(sessionId, terminalId)
      } catch {
        // Detach is best-effort during Session changes. The desired attachment
        // was already removed, so a reconnect cannot resume the stale stream.
      }
    }))
  }
}

function mapGlobalSyncEvent(event: GlobalSyncEvent): KimiGlobalStateEvent {
  /* 结构性 session 事件携带的会话 id 是非敏感标识，跨进程透传用于 renderer
     乐观更新（如归档后立即移除导航条目），随后仍由既有受控 REST 重读收敛。 */
  return {
    scope: event.scope,
    eventType: event.eventType,
    ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId })
  }
}

function projectFileEntry(entry: {
  path: string
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size?: number | undefined
  modified_at: unknown
  mime?: string | undefined
  language_id?: string | undefined
  is_binary?: boolean | undefined
  git_status?: Exclude<WorkspaceFileEntry['gitStatus'], null> | undefined
  child_count?: number | undefined
}): WorkspaceFileEntry {
  return {
    path: entry.path,
    name: entry.name,
    kind: entry.kind,
    size: entry.size ?? null,
    modifiedAt: nullableTimestampString(entry.modified_at),
    mime: entry.mime ?? null,
    languageId: entry.language_id ?? null,
    isBinary: entry.is_binary ?? false,
    gitStatus: entry.git_status ?? null,
    childCount: entry.child_count ?? null
  }
}

/**
 * Kimi Server normally classifies Markdown as UTF-8 text, but older runtimes
 * occasionally mark a text-like file as binary. Preserve the server's binary
 * decision for genuinely binary files while making the preview deterministic
 * for well-known text extensions.
 */
function decodeTextFallback(
  path: string,
  encoding: 'utf-8' | 'base64',
  content: string,
  isBinary: boolean
): { content: string; encoding: 'utf-8' | 'base64'; isBinary: boolean } {
  if (!isBinary || !isTextLikePath(path)) return { content: isBinary ? '' : content, encoding, isBinary }
  if (encoding === 'utf-8') return { content, encoding, isBinary: false }

  const normalized = content.replace(/\s+/g, '')
  if (normalized.length === 0 || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    return { content: '', encoding, isBinary }
  }
  const bytes = Buffer.from(normalized, 'base64')
  if (bytes.length === 0 || bytes.includes(0)) return { content: '', encoding, isBinary }
  const decoded = bytes.toString('utf8')
  if (decoded.includes('\uFFFD') || !Buffer.from(decoded, 'utf8').equals(bytes)) {
    return { content: '', encoding, isBinary }
  }
  return { content: decoded, encoding: 'utf-8', isBinary: false }
}

function isTextLikePath(path: string): boolean {
  return /\.(?:md|mdx|markdown|txt|text|log|json|jsonc|ya?ml|toml|ini|cfg|conf|xml|html?|css|s[ac]ss|less|m?[jt]sx?|c[jt]sx?|vue|svelte|astro|py|go|rs|java|kt|kts|swift|c|cc|cpp|cxx|h|hpp|cs|php|rb|lua|r|sh|bash|zsh|fish|ps1|sql|graphql|gql|csv|tsv|lock)$/i.test(path)
}

/** 最多读取 length 字节；目录等不可读目标直接抛错。 */
async function readFileLimited(path: string, length: number): Promise<Buffer> {
  const handle = await openFile(path, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function formatWebElementsContext(elements: BrowserPickedElement[]): string {
  const first = elements[0]
  if (first === undefined) return ''
  const lines: string[] = elements.map((element, index) => {
    const headline = compactLine(element.ariaLabel ?? firstLine(element.textSnippet), 80)
    const entry = [`${index + 1}. <${element.tag}> ${headline}`]
    if (element.selector.length > 0) entry.push(`   selector: ${element.selector}`)
    if (element.xpath.length > 0) entry.push(`   xpath: ${element.xpath}`)
    if (element.textSnippet.length > 0) entry.push(`   文本: ${compactLine(element.textSnippet, 200)}`)
    if (element.styles !== undefined) {
      entry.push(`   样式: ${compactLine(formatElementStyles(element.styles), 200)}`)
    }
    return entry.join('\n')
  })
  return [
    `用户在内置浏览器中选取了以下网页元素作为上下文（页面「${first.pageTitle}」${first.pageUrl}）：`,
    '',
    ...lines
  ].join('\n')
}

/** 把计算样式压成一行短摘要，例如 `display inline-block; font 13px/1.5 PingFang SC; color #fff; ...`。 */
function formatElementStyles(styles: BrowserPickedElementStyle): string {
  const parts: string[] = []
  const add = (label: string, value: string): void => {
    if (value.length > 0) parts.push(`${label} ${value}`)
  }
  add('display', styles.display)
  if (styles.position !== 'static') add('position', styles.position)
  const font = [
    styles.fontSize.length > 0 && styles.lineHeight.length > 0
      ? `${styles.fontSize}/${styles.lineHeight}`
      : styles.fontSize,
    styles.fontWeight !== 'normal' ? styles.fontWeight : '',
    styles.fontFamily
  ].filter(Boolean).join(' ')
  if (font.length > 0) parts.push(`font ${font}`)
  add('color', styles.color)
  add('background', styles.background)
  add('padding', styles.padding)
  add('margin', styles.margin)
  if (styles.border !== 'none') add('border', styles.border)
  if (styles.borderRadius !== '0px') add('border-radius', styles.borderRadius)
  return parts.join('; ')
}

function firstLine(value: string): string {
  const first = value.split('\n')[0] ?? ''
  return first.trim()
}

function compactLine(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 1))}…`
}

function projectPrompt(prompt: PromptSubmitResult): KimiPromptQueueItem {
  const text = prompt.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => String(part.text))
    .join('\n')
    .trim()
  return {
    promptId: prompt.prompt_id,
    userMessageId: prompt.user_message_id,
    status: prompt.status,
    textPreview: text.length > 240 ? `${text.slice(0, 237)}…` : text,
    createdAt: nullableTimestampString(prompt.created_at)
  }
}

function timestampString(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return ''
}

function nullableTimestampString(value: unknown): string | null {
  const timestamp = timestampString(value)
  return timestamp.length === 0 ? null : timestamp
}

function projectTerminal(terminal: {
  id: string
  session_id: string
  cwd: string
  shell: string
  cols: number
  rows: number
  status: 'running' | 'exited'
  created_at: unknown
  exited_at?: unknown
  exit_code?: number | null | undefined
}): SessionTerminal {
  return {
    id: terminal.id,
    sessionId: terminal.session_id,
    cwd: terminal.cwd,
    shell: terminal.shell,
    cols: terminal.cols,
    rows: terminal.rows,
    status: terminal.status,
    createdAt: timestampString(terminal.created_at),
    exitedAt: nullableTimestampString(terminal.exited_at),
    exitCode: terminal.exit_code ?? null
  }
}

function terminalKey(sessionId: string, terminalId: string): string {
  return `${sessionId}\0${terminalId}`
}

function splitTerminalKey(key: string): { sessionId: string; terminalId: string } {
  const separator = key.indexOf('\0')
  return { sessionId: key.slice(0, separator), terminalId: key.slice(separator + 1) }
}

function undoDraft(messages: SessionSyncView['messages']): KimiUndoDraft | null {
  const message = [...messages].reverse().find((item) => (
    item.role === 'user' && (item.originKind === undefined || item.originKind === 'user')
  ))
  if (message === undefined) return null
  const text = message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
  const attachments: KimiUndoDraft['attachments'] = []
  const seen = new Set<string>()
  for (const part of message.content) {
    if (part.type === 'file' && part.fileId.length > 0 && !seen.has(part.fileId)) {
      seen.add(part.fileId)
      attachments.push({
        fileId: part.fileId,
        name: part.name,
        mediaType: part.mediaType,
        size: part.size
      })
      continue
    }
    if (part.type !== 'media' || part.fileId === null || seen.has(part.fileId)) continue
    seen.add(part.fileId)
    const mediaType = part.sourceMediaType
      ?? (part.mediaType === 'image' ? 'image/png' : 'video/mp4')
    attachments.push({
      fileId: part.fileId,
      name: part.mediaType === 'image' ? 'image-attachment' : 'video-attachment',
      mediaType,
      size: 0
    })
  }
  return text.length === 0 && attachments.length === 0 ? null : { text, attachments }
}

function markdownImagePath(workspaceRoot: string, source: string): string | null {
  const root = resolve(workspaceRoot)
  if (isAbsolute(source)) {
    const resolved = resolve(source)
    const inside = relative(root, resolved)
    if (inside.length === 0 || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return null
    return inside.split(sep).join('/')
  }
  const normalized = source.replace(/\\/g, '/').replace(/^\.\//, '')
  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split('/').some((segment) => segment === '..')
  ) return null
  return normalized
}
