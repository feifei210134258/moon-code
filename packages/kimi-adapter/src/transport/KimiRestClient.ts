import type { z } from 'zod'
import {
  kimiServerMetaSchema,
  authSummarySchema,
  kimiConfigSnapshotSchema,
  interactionResolveResultSchema,
  fileDiffResultSchema,
  fileListResultSchema,
  fileReadResultSchema,
  gitStatusResultSchema,
  promptAbortResultSchema,
  sessionAbortResultSchema,
  promptSteerResultSchema,
  promptSubmitResultSchema,
  modelCatalogListSchema,
  oauthFlowSnapshotSchema,
  oauthFlowStartSchema,
  oauthLoginCancelResultSchema,
  oauthLogoutResultSchema,
  managedUsageResultSchema,
  skillActivationResultSchema,
  skillListSchema,
  toolListSchema,
  mcpServerListSchema,
  mcpServerRestartResultSchema,
  providerCatalogItemSchema,
  providerCatalogListSchema,
  providerRefreshResultSchema,
  questionDismissResultSchema,
  sessionSnapshotSchema,
  sessionRuntimeStatusSchema,
  promptQueueSchema,
  sessionGoalSchema,
  sessionWarningListSchema,
  backgroundTaskListSchema,
  backgroundTaskCancelResultSchema,
  sessionTranscriptSchema,
  sessionListSchema,
  sessionSummarySchema,
  terminalCloseResultSchema,
  terminalListSchema,
  terminalSchema,
  setDefaultModelResultSchema,
  workspaceListSchema,
  workspaceSummarySchema,
  workspaceDeleteResultSchema,
  uploadedFileSchema,
  uploadedFileDeleteResultSchema,
  sessionArchiveResultSchema,
  type KimiServerMeta,
  type AuthSummary,
  type InteractionResolveResult,
  type FileDiffResult,
  type FileListResult,
  type FileReadResult,
  type GitStatusResult,
  type MessageContentPart,
  type KimiConfigSnapshot,
  type ModelCatalogItem,
  type OAuthFlowSnapshot,
  type OAuthFlowStart,
  type OAuthLoginCancelResult,
  type OAuthLogoutResult,
  type ManagedUsageResult,
  type SkillDescriptor,
  type SkillActivationResult,
  type ToolDescriptor,
  type McpServer,
  type McpServerRestartResult,
  type PromptAbortResult,
  type SessionAbortResult,
  type PromptSteerResult,
  type PromptSubmitResult,
  type QuestionDismissResult,
  type ProviderCatalogItem,
  type ProviderRefreshResult,
  type SessionSnapshot,
  type SessionRuntimeStatus,
  type PromptQueue,
  type SessionGoal,
  type SessionWarning,
  type BackgroundTask,
  type BackgroundTaskCancelResult,
  type SessionSummary,
  type SessionTranscript,
  type Terminal,
  type TerminalCloseResult,
  type SetDefaultModelResult,
  type WorkspaceSummary,
  type WorkspaceDeleteResult,
  type UploadedFile,
  type UploadedFileDeleteResult,
  type SessionArchiveResult
} from '../wire/schemas.js'

export interface KimiEnvelope<T> {
  code: number
  msg: string
  data: T
  request_id?: string
}

export class KimiApiError extends Error {
  readonly code: number
  readonly requestId: string | null
  readonly status: number
  readonly retryAfterMs: number | null

  constructor(message: string, options: {
    code: number
    requestId?: string
    status: number
    retryAfterMs?: number | null
  }) {
    super(message)
    this.name = 'KimiApiError'
    this.code = options.code
    this.requestId = options.requestId ?? null
    this.status = options.status
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

interface KimiRestClientOptions {
  origin: string
  token: string
  fetchImpl?: typeof fetch
}

export class KimiRestClient {
  readonly #origin: string
  readonly #token: string
  readonly #fetch: typeof fetch

  constructor(options: KimiRestClientOptions) {
    this.#origin = options.origin.replace(/\/$/, '')
    this.#token = options.token
    this.#fetch = options.fetchImpl ?? fetch
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    dataSchema?: z.ZodType<T>,
    options: { allowCodes?: number[] } = {}
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('authorization', `Bearer ${this.#token}`)
    headers.set('accept', 'application/json')
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const response = await this.#fetch(`${this.#origin}${path}`, {
      ...init,
      headers
    })

    const payload = (await response.json()) as Partial<KimiEnvelope<unknown>>
    const code = typeof payload.code === 'number' ? payload.code : -1
    const codeAllowed = code === 0 || options.allowCodes?.includes(code) === true
    if (!response.ok || !codeAllowed || payload.data === undefined) {
      throw new KimiApiError(payload.msg ?? `Kimi request failed with HTTP ${response.status}`, {
        code,
        ...(payload.request_id === undefined ? {} : { requestId: payload.request_id }),
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
      })
    }

    return dataSchema === undefined ? (payload.data as T) : dataSchema.parse(payload.data)
  }

  getMeta(): Promise<KimiServerMeta> {
    return this.request('/api/v1/meta', {}, kimiServerMetaSchema)
  }

  getAuth(): Promise<AuthSummary> {
    return this.request('/api/v1/auth', {}, authSummarySchema)
  }

  async uploadFile(input: { bytes: Uint8Array; name: string; mediaType: string }): Promise<UploadedFile> {
    const form = new FormData()
    const bytes = new Uint8Array(input.bytes.byteLength)
    bytes.set(input.bytes)
    form.set('file', new Blob([bytes], { type: input.mediaType }), input.name)
    form.set('name', input.name)
    const response = await this.#fetch(`${this.#origin}/api/v1/files`, {
      method: 'POST',
      headers: new Headers({ authorization: `Bearer ${this.#token}`, accept: 'application/json' }),
      body: form
    })
    const payload = await response.json() as Partial<KimiEnvelope<unknown>>
    const code = typeof payload.code === 'number' ? payload.code : -1
    if (!response.ok || code !== 0 || payload.data === undefined) {
      throw new KimiApiError(payload.msg ?? `Kimi upload failed with HTTP ${response.status}`, {
        code,
        ...(payload.request_id === undefined ? {} : { requestId: payload.request_id }),
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
      })
    }
    return uploadedFileSchema.parse(payload.data)
  }

  async downloadFile(fileId: string): Promise<Uint8Array> {
    const response = await this.#fetch(`${this.#origin}/api/v1/files/${encodeURIComponent(fileId)}`, {
      headers: new Headers({
        authorization: `Bearer ${this.#token}`,
        accept: 'application/octet-stream'
      })
    })
    if (!response.ok) {
      let message = `Kimi file download failed with HTTP ${response.status}`
      let code = -1
      let requestId: string | undefined
      try {
        const payload = await response.json() as Partial<KimiEnvelope<unknown>>
        message = payload.msg ?? message
        code = typeof payload.code === 'number' ? payload.code : code
        requestId = payload.request_id
      } catch {
        // Successful file bodies are binary; failed endpoints may still omit JSON.
      }
      throw new KimiApiError(message, {
        code,
        ...(requestId === undefined ? {} : { requestId }),
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
      })
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  deleteFile(fileId: string): Promise<UploadedFileDeleteResult> {
    return this.request(
      `/api/v1/files/${encodeURIComponent(fileId)}`,
      { method: 'DELETE' },
      uploadedFileDeleteResultSchema
    )
  }

  async listModels(): Promise<ModelCatalogItem[]> {
    const data = await this.request('/api/v1/models', {}, modelCatalogListSchema)
    return data.items
  }

  setDefaultModel(modelId: string): Promise<SetDefaultModelResult> {
    return this.request(
      `/api/v1/models/${encodeURIComponent(modelId)}:set_default`,
      { method: 'POST' },
      setDefaultModelResultSchema
    )
  }

  async listProviders(): Promise<ProviderCatalogItem[]> {
    const data = await this.request('/api/v1/providers', {}, providerCatalogListSchema)
    return data.items
  }

  getProvider(providerId: string): Promise<ProviderCatalogItem> {
    return this.request(
      `/api/v1/providers/${encodeURIComponent(providerId)}`,
      {},
      providerCatalogItemSchema
    )
  }

  refreshProvider(providerId: string): Promise<ProviderRefreshResult> {
    return this.request(
      `/api/v1/providers/${encodeURIComponent(providerId)}:refresh`,
      { method: 'POST' },
      providerRefreshResultSchema
    )
  }

  refreshAllProviders(): Promise<ProviderRefreshResult> {
    return this.request('/api/v1/providers:refresh', { method: 'POST' }, providerRefreshResultSchema)
  }

  refreshOAuthProviderModels(): Promise<ProviderRefreshResult> {
    return this.request('/api/v1/providers:refresh_oauth', { method: 'POST' }, providerRefreshResultSchema)
  }

  getConfig(): Promise<KimiConfigSnapshot> {
    return this.request('/api/v1/config', {}, kimiConfigSnapshotSchema)
  }

  setConfig(patch: Record<string, unknown>): Promise<KimiConfigSnapshot> {
    return this.request(
      '/api/v1/config',
      { method: 'POST', body: JSON.stringify(patch) },
      kimiConfigSnapshotSchema
    )
  }

  startOAuthLogin(provider?: string): Promise<OAuthFlowStart> {
    return this.request(
      '/api/v1/oauth/login',
      {
        method: 'POST',
        body: JSON.stringify(provider === undefined ? {} : { provider })
      },
      oauthFlowStartSchema
    )
  }

  pollOAuthLogin(provider?: string): Promise<OAuthFlowSnapshot | null> {
    return this.request(
      `/api/v1/oauth/login${providerQuery(provider)}`,
      {},
      oauthFlowSnapshotSchema.nullable()
    )
  }

  cancelOAuthLogin(provider?: string): Promise<OAuthLoginCancelResult> {
    return this.request(
      `/api/v1/oauth/login${providerQuery(provider)}`,
      { method: 'DELETE' },
      oauthLoginCancelResultSchema
    )
  }

  logoutOAuth(provider?: string): Promise<OAuthLogoutResult> {
    return this.request(
      '/api/v1/oauth/logout',
      {
        method: 'POST',
        body: JSON.stringify(provider === undefined ? {} : { provider })
      },
      oauthLogoutResultSchema
    )
  }

  getOAuthUsage(provider?: string, signal?: AbortSignal): Promise<ManagedUsageResult> {
    return this.request(
      `/api/v1/oauth/usage${providerQuery(provider)}`,
      signal === undefined ? {} : { signal },
      managedUsageResultSchema
    )
  }

  async listSessionSkills(sessionId: string): Promise<SkillDescriptor[]> {
    const data = await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/skills`,
      {},
      skillListSchema
    )
    return data.skills
  }

  async listWorkspaceSkills(workspaceId: string): Promise<SkillDescriptor[]> {
    const data = await this.request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/skills`,
      {},
      skillListSchema
    )
    return data.skills
  }

  activateSkill(sessionId: string, skillName: string, args?: string): Promise<SkillActivationResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/skills/${encodeURIComponent(skillName)}:activate`,
      {
        method: 'POST',
        body: JSON.stringify(args === undefined || args.length === 0 ? {} : { args })
      },
      skillActivationResultSchema
    )
  }

  async listTools(sessionId?: string): Promise<ToolDescriptor[]> {
    const query = sessionId === undefined ? '' : `?${new URLSearchParams({ session_id: sessionId })}`
    const data = await this.request(`/api/v1/tools${query}`, {}, toolListSchema)
    return data.tools
  }

  async listMcpServers(): Promise<McpServer[]> {
    const data = await this.request('/api/v1/mcp/servers', {}, mcpServerListSchema)
    return data.servers
  }

  restartMcpServer(serverId: string): Promise<McpServerRestartResult> {
    return this.request(
      `/api/v1/mcp/servers/${encodeURIComponent(serverId)}:restart`,
      { method: 'POST' },
      mcpServerRestartResultSchema
    )
  }

  async listWorkspaces(): Promise<WorkspaceSummary[]> {
    const data = await this.request('/api/v1/workspaces', {}, workspaceListSchema)
    return data.items
  }

  addWorkspace(input: { root: string; name?: string }): Promise<WorkspaceSummary> {
    return this.request('/api/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ root: input.root, ...(input.name === undefined ? {} : { name: input.name }) })
    }, workspaceSummarySchema)
  }

  renameWorkspace(workspaceId: string, name: string): Promise<WorkspaceSummary> {
    return this.request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'PATCH', body: JSON.stringify({ name }) },
      workspaceSummarySchema
    )
  }

  deleteWorkspace(workspaceId: string): Promise<WorkspaceDeleteResult> {
    return this.request(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      { method: 'DELETE' },
      workspaceDeleteResultSchema
    )
  }

  async listSessionPage(options: {
    workspaceId?: string
    includeArchive?: boolean
    archivedOnly?: boolean
    excludeEmpty?: boolean
    busy?: boolean
    beforeId?: string
    afterId?: string
    pageSize?: number
  } = {}): Promise<{ items: SessionSummary[]; hasMore: boolean }> {
    const query = new URLSearchParams({
      page_size: String(options.pageSize ?? 100),
      include_archive: String(options.includeArchive ?? false),
      exclude_empty: String(options.excludeEmpty ?? false),
      archived_only: String(options.archivedOnly ?? false)
    })
    if (options.workspaceId !== undefined) query.set('workspace_id', options.workspaceId)
    if (options.busy !== undefined) query.set('busy', String(options.busy))
    if (options.beforeId !== undefined) query.set('before_id', options.beforeId)
    if (options.afterId !== undefined) query.set('after_id', options.afterId)
    const data = await this.request(`/api/v1/sessions?${query}`, {}, sessionListSchema)
    return { items: data.items, hasMore: data.has_more }
  }

  async listSessions(options: { workspaceId?: string; includeArchive?: boolean } = {}): Promise<SessionSummary[]> {
    return (await this.listSessionPage(options)).items
  }

  createSession(input: {
    workspaceId: string
    title?: string
    cwd?: string
    model?: string
  }): Promise<SessionSummary> {
    return this.request('/api/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.cwd === undefined ? {} : { metadata: { cwd: input.cwd } }),
        ...(input.model === undefined ? {} : { agent_config: { model: input.model } })
      })
    }, sessionSummarySchema)
  }

  renameSession(sessionId: string, title: string): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
      { method: 'POST', body: JSON.stringify({ title }) },
      sessionSummarySchema
    )
  }

  archiveSession(sessionId: string): Promise<SessionArchiveResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:archive`,
      { method: 'POST', body: '{}' },
      sessionArchiveResultSchema
    )
  }

  restoreSession(sessionId: string): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:restore`,
      { method: 'POST', body: '{}' },
      sessionSummarySchema
    )
  }

  forkSession(sessionId: string, title?: string): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:fork`,
      { method: 'POST', body: JSON.stringify(title === undefined ? {} : { title }) },
      sessionSummarySchema
    )
  }

  async listChildSessions(sessionId: string): Promise<SessionSummary[]> {
    const result = await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/children?${new URLSearchParams({ page_size: '100' })}`,
      {},
      sessionListSchema
    )
    return result.items
  }

  async exportSession(sessionId: string, webLog?: string): Promise<Uint8Array> {
    const headers = new Headers({
      authorization: `Bearer ${this.#token}`,
      accept: 'application/zip',
      'content-type': 'application/json'
    })
    const response = await this.#fetch(
      `${this.#origin}/api/v1/sessions/${encodeURIComponent(sessionId)}/export`,
      { method: 'POST', headers, body: JSON.stringify(webLog === undefined ? {} : { web_log: webLog }) }
    )
    if (!response.ok) {
      let message = `Kimi export failed with HTTP ${response.status}`
      let code = -1
      let requestId: string | undefined
      try {
        const payload = await response.json() as Partial<KimiEnvelope<unknown>>
        message = payload.msg ?? message
        code = typeof payload.code === 'number' ? payload.code : code
        requestId = payload.request_id
      } catch {
        // Zip endpoints return JSON only on an API error.
      }
      throw new KimiApiError(message, {
        code,
        ...(requestId === undefined ? {} : { requestId }),
        status: response.status,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
      })
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  getSessionSnapshot(sessionId: string): Promise<SessionSnapshot> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`,
      {},
      sessionSnapshotSchema
    )
  }

  getSessionStatus(sessionId: string): Promise<SessionRuntimeStatus> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/status`,
      {},
      sessionRuntimeStatusSchema
    )
  }

  getSessionGoal(sessionId: string): Promise<SessionGoal | null> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/goal`,
      {},
      sessionGoalSchema.nullable()
    )
  }

  async getSessionWarnings(sessionId: string): Promise<SessionWarning[]> {
    const result = await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/warnings`,
      {},
      sessionWarningListSchema
    )
    return result.warnings
  }

  updateSessionGoal(
    sessionId: string,
    control: 'pause' | 'resume' | 'cancel'
  ): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
      { method: 'POST', body: JSON.stringify({ agent_config: { goal_control: control } }) },
      sessionSummarySchema
    )
  }

  updateSessionGoalObjective(sessionId: string, objective: string): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
      { method: 'POST', body: JSON.stringify({ agent_config: { goal_objective: objective } }) },
      sessionSummarySchema
    )
  }

  getPromptQueue(sessionId: string): Promise<PromptQueue> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts`,
      {},
      promptQueueSchema
    )
  }

  async listTasks(sessionId: string): Promise<BackgroundTask[]> {
    const result = await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/tasks`,
      {},
      backgroundTaskListSchema
    )
    return result.items
  }

  cancelTask(sessionId: string, taskId: string): Promise<BackgroundTaskCancelResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/tasks/${encodeURIComponent(taskId)}:cancel`,
      { method: 'POST' },
      backgroundTaskCancelResultSchema
    )
  }

  getSessionTranscript(
    sessionId: string,
    options: { agentId?: string; beforeTurn?: string; afterTurn?: string; pageSize?: number } = {}
  ): Promise<SessionTranscript> {
    const query = new URLSearchParams({
      agent_id: options.agentId ?? 'main',
      page_size: String(options.pageSize ?? 50)
    })
    if (options.beforeTurn !== undefined) query.set('before_turn', options.beforeTurn)
    if (options.afterTurn !== undefined) query.set('after_turn', options.afterTurn)
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/transcript?${query}`,
      {},
      sessionTranscriptSchema
    )
  }

  async compactSession(sessionId: string, instruction?: string): Promise<void> {
    await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:compact`,
      {
        method: 'POST',
        body: JSON.stringify(instruction === undefined ? {} : { instruction })
      }
    )
  }

  async undoSession(sessionId: string, count = 1): Promise<void> {
    await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:undo`,
      { method: 'POST', body: JSON.stringify({ count }) }
    )
  }

  submitPrompt(
    sessionId: string,
    input: {
      content: MessageContentPart[]
      metadata?: Record<string, unknown>
      agentId?: string
      model?: string
      thinking?: string
      permissionMode?: 'manual' | 'auto' | 'yolo'
      planMode?: boolean
      swarmMode?: boolean
    }
  ): Promise<PromptSubmitResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: input.content,
          ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
          ...(input.agentId === undefined ? {} : { agent_id: input.agentId }),
          ...(input.model === undefined ? {} : { model: input.model }),
          ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
          ...(input.permissionMode === undefined ? {} : { permission_mode: input.permissionMode }),
          ...(input.planMode === undefined ? {} : { plan_mode: input.planMode }),
          ...(input.swarmMode === undefined ? {} : { swarm_mode: input.swarmMode })
        })
      },
      promptSubmitResultSchema
    )
  }

  steerPrompts(sessionId: string, promptIds: string[]): Promise<PromptSteerResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts:steer`,
      { method: 'POST', body: JSON.stringify({ prompt_ids: promptIds }) },
      promptSteerResultSchema
    )
  }

  abortPrompt(sessionId: string, promptId: string): Promise<PromptAbortResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts/${encodeURIComponent(promptId)}:abort`,
      { method: 'POST' },
      promptAbortResultSchema,
      { allowCodes: [40903] }
    )
  }

  abortSession(sessionId: string): Promise<SessionAbortResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:abort`,
      { method: 'POST' },
      sessionAbortResultSchema
    )
  }

  respondApproval(
    sessionId: string,
    approvalId: string,
    response: {
      decision: 'approved' | 'rejected' | 'cancelled'
      scope?: 'session'
      feedback?: string
      selectedLabel?: string
    }
  ): Promise<InteractionResolveResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/approvals/${encodeURIComponent(approvalId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          decision: response.decision,
          ...(response.scope === undefined ? {} : { scope: response.scope }),
          ...(response.feedback === undefined ? {} : { feedback: response.feedback }),
          ...(response.selectedLabel === undefined ? {} : { selected_label: response.selectedLabel })
        })
      },
      interactionResolveResultSchema
    )
  }

  respondQuestion(
    sessionId: string,
    questionId: string,
    response: {
      answers: Record<string, Record<string, unknown>>
      method?: 'enter' | 'space' | 'number_key' | 'click'
      note?: string
    }
  ): Promise<InteractionResolveResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          answers: response.answers,
          ...(response.method === undefined ? {} : { method: response.method }),
          ...(response.note === undefined ? {} : { note: response.note })
        })
      },
      interactionResolveResultSchema
    )
  }

  dismissQuestion(sessionId: string, questionId: string): Promise<QuestionDismissResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}:dismiss`,
      { method: 'POST' },
      questionDismissResultSchema,
      { allowCodes: [40909] }
    )
  }

  listFiles(
    sessionId: string,
    options: {
      path?: string
      depth?: number
      limit?: number
      showHidden?: boolean
      includeGitStatus?: boolean
    } = {}
  ): Promise<FileListResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:list`,
      {
        method: 'POST',
        body: JSON.stringify({
          path: options.path ?? '.',
          depth: options.depth ?? 1,
          limit: options.limit ?? 500,
          show_hidden: options.showHidden ?? false,
          follow_gitignore: true,
          sort: 'type_first',
          include_git_status: options.includeGitStatus ?? true
        })
      },
      fileListResultSchema
    )
  }

  readFile(
    sessionId: string,
    path: string,
    options: { offset?: number; length?: number } = {}
  ): Promise<FileReadResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:read`,
      {
        method: 'POST',
        body: JSON.stringify({
          path,
          offset: options.offset ?? 0,
          length: options.length ?? 1_048_576,
          encoding: 'auto'
        })
      },
      fileReadResultSchema
    )
  }

  getGitStatus(sessionId: string, paths: string[] = []): Promise<GitStatusResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:git_status`,
      { method: 'POST', body: JSON.stringify({ paths }) },
      gitStatusResultSchema
    )
  }

  getFileDiff(sessionId: string, path: string): Promise<FileDiffResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:diff`,
      { method: 'POST', body: JSON.stringify({ path }) },
      fileDiffResultSchema
    )
  }

  async listTerminals(sessionId: string): Promise<Terminal[]> {
    const data = await this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/terminals`,
      {},
      terminalListSchema
    )
    return data.items
  }

  createTerminal(
    sessionId: string,
    input: { cwd?: string; shell?: string; cols?: number; rows?: number } = {}
  ): Promise<Terminal> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/terminals`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      },
      terminalSchema
    )
  }

  getTerminal(sessionId: string, terminalId: string): Promise<Terminal> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminalId)}`,
      {},
      terminalSchema
    )
  }

  closeTerminal(sessionId: string, terminalId: string): Promise<TerminalCloseResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/terminals/${encodeURIComponent(terminalId)}:close`,
      { method: 'POST' },
      terminalCloseResultSchema
    )
  }

  async shutdown(): Promise<void> {
    await this.request<unknown>('/api/v1/shutdown', { method: 'POST' })
  }
}

function providerQuery(provider?: string): string {
  if (provider === undefined) return ''
  return `?${new URLSearchParams({ provider })}`
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60 * 60 * 1_000)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.min(timestamp - Date.now(), 60 * 60 * 1_000))
}
