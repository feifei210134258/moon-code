import { z } from 'zod'
import {
  kimiServerMetaSchema,
  authSummarySchema,
  kimiConfigSnapshotSchema,
  interactionResolveResultSchema,
  fileDiffResultSchema,
  fileListResultSchema,
  fileReadResultSchema,
  fileSearchResultSchema,
  fileSuggestResultSchema,
  fileGrepResultSchema,
  fileOpenResultSchema,
  fileRevealResultSchema,
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
  oauthRegionResultSchema,
  managedUsageResultSchema,
  skillActivationResultSchema,
  skillListSchema,
  toolListSchema,
  mcpServerListSchema,
  mcpServerRestartResultSchema,
  mcpManagedServerListSchema,
  mcpServerTestResultSchema,
  mcpServerInspectionListSchema,
  mcpAuthStatusListSchema,
  mcpAuthBeginResultSchema,
  providerCatalogItemSchema,
  providerCatalogListSchema,
  providerDirectoryItemSchema,
  providerDirectoryListSchema,
  providerMutationResultSchema,
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
  sessionPlanListSchema,
  sideChatStartResultSchema,
  sessionListSchema,
  sessionListV2PageSchema,
  sessionListV2Schema,
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
  sessionBatchActionResultSchema,
  type KimiServerMeta,
  type AuthSummary,
  type InteractionResolveResult,
  type FileDiffResult,
  type FileListResult,
  type FileReadResult,
  type FileSearchResult,
  type FileSuggestResult,
  type FileGrepResult,
  type FileOpenResult,
  type FileRevealResult,
  type GitStatusResult,
  type MessageContentPart,
  type KimiConfigSnapshot,
  type ModelCatalogItem,
  type OAuthFlowSnapshot,
  type OAuthFlowStart,
  type OAuthLoginCancelResult,
  type OAuthLogoutResult,
  type OAuthRegion,
  type ManagedUsageResult,
  type SkillDescriptor,
  type SkillActivationResult,
  type ToolDescriptor,
  type McpServer,
  type McpServerConfig,
  type McpServerTestResult,
  type McpManagedServer,
  type McpLocator,
  type McpServerInspection,
  type McpAuthStatus,
  type McpAuthBeginResult,
  type McpServerRestartResult,
  type PromptAbortResult,
  type SessionAbortResult,
  type PromptSteerResult,
  type PromptSubmitResult,
  type QuestionDismissResult,
  type ProviderCatalogItem,
  type ProviderDirectoryItem,
  type ProviderMutationResult,
  type ProviderRefreshResult,
  type SessionSnapshot,
  type SessionRuntimeStatus,
  type PromptQueue,
  type SessionGoal,
  type SessionWarning,
  type BackgroundTask,
  type BackgroundTaskCancelResult,
  type SessionSummary,
  type SessionSummaryV2,
  type SessionActivityStatus,
  type SessionTranscript,
  type SessionPlanList,
  type SideChatStartResult,
  type Terminal,
  type TerminalCloseResult,
  type SetDefaultModelResult,
  type WorkspaceSummary,
  type WorkspaceDeleteResult,
  type UploadedFile,
  type UploadedFileDeleteResult,
  type SessionArchiveResult,
  type PromptSkill,
  type SessionBatchActionResult,
  type SessionSummaryV2Lite
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

export interface KimiClientIdentity {
  clientId: string
  clientName: string
  clientVersion: string
  clientUiMode: string
}

/** `GET /api/v2/sessions`（0.38.0：view / group.page_size / meta.has_prompt）的查询参数。 */
export interface SessionListPageV2Options {
  workspaceId?: string | string[]
  activityStatus?: SessionActivityStatus | SessionActivityStatus[]
  updatedAfter?: number
  updatedBefore?: number
  archived?: 'true' | 'false' | 'all'
  /** 0.38.0：`meta.has_prompt`，按会话是否含 prompt 过滤。 */
  hasPrompt?: 'true' | 'false'
  sort?: 'meta.updated_at_desc' | 'meta.updated_at_asc' | 'meta.created_at_desc'
  includeGit?: boolean
  /** 0.38.0：`group.page_size`，`view=by_workspace` 时每组的条数上限。 */
  groupPageSize?: number
  pageSize?: number
  page?: number
  pageToken?: string
  view?: 'flat' | 'by_workspace'
}

/** 默认 `view=flat` 的 v2 会话列表页（现状行为）。 */
export interface SessionListV2FlatPage {
  items: SessionSummaryV2[]
  hasMore: boolean
  total: number
  nextPageToken: string | null
}

/** `view=by_workspace` 单个 workspace 分组（0.38.0）。 */
export interface SessionListV2WorkspaceGroup {
  workspace: SessionSummaryV2['workspace']
  sessions: SessionSummaryV2[]
  total: number
}

/** `view=by_workspace` 的 v2 会话列表页（0.38.0）。 */
export interface SessionListV2ByWorkspacePage {
  groups: SessionListV2WorkspaceGroup[]
  hasMore: boolean
  total: number
  nextPageToken: string | null
}

interface KimiRestClientOptions {
  origin: string
  token: string
  identity?: KimiClientIdentity
  fetchImpl?: typeof fetch
}

export class KimiRestClient {
  readonly #origin: string
  readonly #token: string
  readonly #identity: KimiClientIdentity | null
  readonly #fetch: typeof fetch

  constructor(options: KimiRestClientOptions) {
    this.#origin = options.origin.replace(/\/$/, '')
    this.#token = options.token
    this.#identity = options.identity ?? null
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
    this.#addClientIdentity(headers)
    if (init.body !== undefined && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const response = await this.#fetch(`${this.#origin}${path}`, {
      ...init,
      headers
    })

    // DELETE routes in the Runtime contract may answer with an empty 204.
    // Treat that as a successful no-content response before attempting JSON.
    if (response.status === 204) return undefined as T

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
      headers: this.#identifiedHeaders({ authorization: `Bearer ${this.#token}`, accept: 'application/json' }),
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
      headers: this.#identifiedHeaders({
        authorization: `Bearer ${this.#token}`,
        accept: 'application/octet-stream'
      })
    })
    if (!response.ok) throw await this.#binaryError(response, 'Kimi file download failed')
    return new Uint8Array(await response.arrayBuffer())
  }

  /** 0.37.2+：按 file_id 拉取会话媒体二进制（供 Main 转 Blob URL 展示）。 */
  async getSessionMedia(sessionId: string, fileId: string): Promise<Uint8Array> {
    const response = await this.#fetch(
      `${this.#origin}/api/v1/sessions/${encodeURIComponent(sessionId)}/media/${encodeURIComponent(fileId)}`,
      { headers: this.#identifiedHeaders({ authorization: `Bearer ${this.#token}`, accept: 'application/octet-stream' }) }
    )
    if (!response.ok) throw await this.#binaryError(response, 'Kimi session media fetch failed')
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

  createProvider(input: Record<string, unknown>): Promise<ProviderCatalogItem> {
    return this.request(
      '/api/v1/providers',
      { method: 'POST', body: JSON.stringify(input) },
      providerCatalogItemSchema
    )
  }

  replaceProvider(providerId: string, input: Record<string, unknown>): Promise<ProviderCatalogItem> {
    return this.request<ProviderMutationResult>(
      `/api/v1/providers/${encodeURIComponent(providerId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
      providerMutationResultSchema
    ).then((result) => result.provider)
  }

  deleteProvider(providerId: string): Promise<void> {
    return this.request<void>(
      `/api/v1/providers/${encodeURIComponent(providerId)}`,
      { method: 'DELETE' }
    )
  }

  getCatalogProvider(catalogId: string): Promise<ProviderDirectoryItem> {
    return this.request(
      `/api/v1/catalog/providers/${encodeURIComponent(catalogId)}`,
      {},
      providerDirectoryItemSchema
    )
  }

  listCatalogProviders(): Promise<ProviderDirectoryItem[]> {
    return this.request(
      '/api/v1/catalog/providers',
      {},
      providerDirectoryListSchema
    ).then((data) => data.items)
  }

  async supportsProviderManagement(): Promise<boolean> {
    try {
      const response = await this.#fetch(`${this.#origin}/openapi.json`, {
        headers: this.#identifiedHeaders({
          authorization: `Bearer ${this.#token}`,
          accept: 'application/json'
        })
      })
      if (!response.ok) return false
      const document = await response.json() as {
        paths?: Record<string, Record<string, unknown>>
      }
      const providerPath = document.paths?.['/api/v1/providers/{provider_id}']
      return providerPath?.put !== undefined && providerPath?.delete !== undefined
    } catch {
      return false
    }
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

  async supportsSecondaryModelConfigWrite(): Promise<boolean> {
    try {
      const response = await this.#fetch(`${this.#origin}/openapi.json`, {
        headers: this.#identifiedHeaders({
          authorization: `Bearer ${this.#token}`,
          accept: 'application/json'
        })
      })
      if (!response.ok) return false
      return openApiRequestBodyHasProperty(
        await response.json(),
        '/api/v1/config',
        'post',
        'secondary_model'
      )
    } catch {
      return false
    }
  }

  setConfig(patch: Record<string, unknown>): Promise<KimiConfigSnapshot> {
    return this.request(
      '/api/v1/config',
      { method: 'POST', body: JSON.stringify(patch) },
      kimiConfigSnapshotSchema
    )
  }

  /** 0.38.0+：查询 OAuth 登录区域（mainland-cn / global）。 */
  getOAuthRegion(): Promise<OAuthRegion> {
    return this.request('/api/v1/oauth/region', {}, oauthRegionResultSchema).then((result) => result.region)
  }

  startOAuthLogin(provider?: string, region?: OAuthRegion): Promise<OAuthFlowStart> {
    return this.request(
      '/api/v1/oauth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          ...(provider === undefined ? {} : { provider }),
          ...(region === undefined ? {} : { region })
        })
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

  /* ---- kimi 0.39 MCP v2 管理面 ---- */

  /** 管理面全量列表（user 级 mcp.json + 插件清单；只读项携带脱敏配置）。 */
  listManagedMcpServers(cwd?: string): Promise<McpManagedServer[]> {
    const query = cwd === undefined ? '' : `?cwd=${encodeURIComponent(cwd)}`
    return this.request(`/api/v2/mcp/servers${query}`, {}, mcpManagedServerListSchema)
  }

  addManagedMcpServer(input: { name: string } & McpServerConfig): Promise<McpManagedServer[]> {
    return this.request('/api/v2/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(input)
    }, mcpManagedServerListSchema)
  }

  replaceManagedMcpServer(name: string, config: McpServerConfig): Promise<McpManagedServer[]> {
    return this.request(
      `/api/v2/mcp/servers/${encodeURIComponent(name)}`,
      { method: 'PUT', body: JSON.stringify(config) },
      mcpManagedServerListSchema
    )
  }

  deleteManagedMcpServer(name: string): Promise<McpManagedServer[]> {
    return this.request(
      `/api/v2/mcp/servers/${encodeURIComponent(name)}`,
      { method: 'DELETE' },
      mcpManagedServerListSchema
    )
  }

  /** 真实连接探测：name 测注册项，server 内联配置原样探测；永不持久化。 */
  testMcpServer(input: { name?: string; server?: McpServerConfig; cwd?: string }): Promise<McpServerTestResult> {
    return this.request('/api/v2/mcp/servers:test', {
      method: 'POST',
      body: JSON.stringify({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.server === undefined ? {} : { server: input.server }),
        ...(input.cwd === undefined ? {} : { cwd: input.cwd })
      })
    }, mcpServerTestResultSchema)
  }

  /** 定位器寻址目录（脱敏配置）+ 全部 OAuth 候选的批量连接探测。 */
  inspectMcpServers(input: { targets?: McpLocator[]; cwd?: string } = {}): Promise<McpServerInspection[]> {
    return this.request('/api/v2/mcp/servers:inspect', {
      method: 'POST',
      body: JSON.stringify({
        ...(input.targets === undefined ? {} : { targets: input.targets }),
        ...(input.cwd === undefined ? {} : { cwd: input.cwd })
      })
    }, mcpServerInspectionListSchema)
  }

  listMcpAuthStatuses(cwd?: string): Promise<Array<{ name: string; authStatus: McpAuthStatus }>> {
    const query = cwd === undefined ? '' : `?cwd=${encodeURIComponent(cwd)}`
    return this.request(`/api/v2/mcp/auth-statuses${query}`, {}, mcpAuthStatusListSchema)
  }

  beginMcpAuth(input: { source: 'global'; name: string; cwd?: string }): Promise<McpAuthBeginResult> {
    return this.request('/api/v2/mcp/auth:begin', {
      method: 'POST',
      body: JSON.stringify({
        source: input.source,
        name: input.name,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd })
      })
    }, mcpAuthBeginResultSchema)
  }

  completeMcpAuth(input: { flowId: string; timeoutMs?: number }): Promise<null> {
    return this.request('/api/v2/mcp/auth:complete', {
      method: 'POST',
      body: JSON.stringify({
        flowId: input.flowId,
        ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs })
      })
    }, z.null())
  }

  cancelMcpAuth(flowId: string): Promise<null> {
    return this.request('/api/v2/mcp/auth:cancel', {
      method: 'POST',
      body: JSON.stringify({ flowId })
    }, z.null())
  }

  resetMcpAuth(input: { source: 'global'; name: string; cwd?: string }): Promise<null> {
    return this.request('/api/v2/mcp/auth:reset', {
      method: 'POST',
      body: JSON.stringify({
        source: input.source,
        name: input.name,
        ...(input.cwd === undefined ? {} : { cwd: input.cwd })
      })
    }, z.null())
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
    const archivedOnly = options.archivedOnly ?? false
    // Kimi Code 0.29 rejects `include_archive=true` together with
    // `archived_only=true`. An archived-only listing is already inclusive of
    // archived sessions, so it must use the normal (false) include flag.
    const includeArchive = archivedOnly ? false : (options.includeArchive ?? false)
    const query = new URLSearchParams({
      page_size: String(options.pageSize ?? 100),
      include_archive: String(includeArchive),
      exclude_empty: String(options.excludeEmpty ?? false),
      archived_only: String(archivedOnly)
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

  /** 默认 `view=flat` 的 v2 会话列表页（现状行为）。 */
  async listSessionPageV2(
    options?: SessionListPageV2Options & { view?: 'flat' }
  ): Promise<SessionListV2FlatPage>
  /** 0.38.0：`view=by_workspace` 按 workspace 分组的会话列表页。 */
  async listSessionPageV2(
    options: SessionListPageV2Options & { view: 'by_workspace' }
  ): Promise<SessionListV2ByWorkspacePage>
  async listSessionPageV2(
    options: SessionListPageV2Options = {}
  ): Promise<SessionListV2FlatPage | SessionListV2ByWorkspacePage> {
    const query = new URLSearchParams()
    const setList = (key: string, value: string | string[] | undefined) => {
      if (value === undefined) return
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
    }
    setList('workspace.id', options.workspaceId)
    setList('activity.status', options.activityStatus)
    if (options.updatedAfter !== undefined) query.set('meta.updated_after', String(options.updatedAfter))
    if (options.updatedBefore !== undefined) query.set('meta.updated_before', String(options.updatedBefore))
    if (options.archived !== undefined) query.set('meta.archived', options.archived)
    if (options.hasPrompt !== undefined) query.set('meta.has_prompt', options.hasPrompt)
    if (options.sort !== undefined) query.set('sort', options.sort)
    if (options.includeGit === true) query.set('include', 'git')
    if (options.view !== undefined) query.set('view', options.view)
    if (options.groupPageSize !== undefined) query.set('group.page_size', String(options.groupPageSize))
    query.set('page_size', String(clampPageSize(options.pageSize ?? 100)))
    if (options.page !== undefined) query.set('page', String(options.page))
    if (options.pageToken !== undefined) query.set('page_token', options.pageToken)
    const data = await this.request(`/api/v2/sessions?${query}`, {}, sessionListV2PageSchema)
    // 本方法不请求 fields=id,archived，服务端始终返回完整条目
    if ('groups' in data) {
      return {
        groups: data.groups.map((group) => ({
          workspace: group.workspace,
          sessions: group.sessions.filter(isFullV2Item),
          total: group.total
        })),
        hasMore: data.has_more,
        total: data.total,
        nextPageToken: data.next_page_token
      }
    }
    return {
      items: data.items.filter(isFullV2Item),
      hasMore: data.has_more,
      total: data.total,
      nextPageToken: data.next_page_token
    }
  }

  /** 0.37.2+：fields=id,archived 的轻量列表（全量匹配流程），只返回 id/archived 投影。 */
  async listSessionIdsV2(options: {
    workspaceId?: string | string[]
    activityStatus?: SessionActivityStatus | SessionActivityStatus[]
    archived?: 'true' | 'false' | 'all'
    updatedBefore?: number
    pageSize?: number
    page?: number
  } = {}): Promise<{ items: SessionSummaryV2Lite[]; total: number }> {
    const query = new URLSearchParams()
    const setList = (key: string, value: string | string[] | undefined) => {
      if (value === undefined) return
      for (const item of Array.isArray(value) ? value : [value]) query.append(key, item)
    }
    setList('workspace.id', options.workspaceId)
    setList('activity.status', options.activityStatus)
    if (options.updatedBefore !== undefined) query.set('meta.updated_before', String(options.updatedBefore))
    if (options.archived !== undefined) query.set('meta.archived', options.archived)
    query.set('fields', 'id,archived')
    query.set('page_size', String(clampPageSize(options.pageSize ?? 100)))
    if (options.page !== undefined) query.set('page', String(options.page))
    const data = await this.request(`/api/v2/sessions?${query}`, {}, sessionListV2Schema)
    return { items: data.items.filter(isLiteV2Item), total: data.total }
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

  setSessionPlanMode(sessionId: string, planMode: boolean): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
      { method: 'POST', body: JSON.stringify({ agent_config: { plan_mode: planMode } }) },
      sessionSummarySchema
    )
  }

  setSessionSwarmMode(sessionId: string, swarmMode: boolean): Promise<SessionSummary> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/profile`,
      { method: 'POST', body: JSON.stringify({ agent_config: { swarm_mode: swarmMode } }) },
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

  /** 0.37.2+：批量归档会话，逐项返回结果。 */
  archiveSessions(ids: string[]): Promise<SessionBatchActionResult> {
    return this.request(
      '/api/v2/sessions:archive',
      { method: 'POST', body: JSON.stringify({ ids }) },
      sessionBatchActionResultSchema
    )
  }

  /** 0.37.2+：批量恢复会话，逐项返回结果。 */
  restoreSessions(ids: string[]): Promise<SessionBatchActionResult> {
    return this.request(
      '/api/v2/sessions:restore',
      { method: 'POST', body: JSON.stringify({ ids }) },
      sessionBatchActionResultSchema
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
    this.#addClientIdentity(headers)
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

  /**
   * 0.37.2+：拉取 Agent 的 ExitPlanMode 计划清单（agent_id 必填；tool_call_id
   * 可选，缺省列出该 Agent 所有可恢复计划内容的调用）。用于把计划详情合并到
   * transcript 的 plan_review tool part 上，避免逐 part 打接口。
   */
  getSessionPlanList(
    sessionId: string,
    options: { agentId?: string; toolCallId?: string } = {}
  ): Promise<SessionPlanList> {
    const query = new URLSearchParams({ agent_id: options.agentId ?? 'main' })
    if (options.toolCallId !== undefined) query.set('tool_call_id', options.toolCallId)
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/transcript/plan?${query}`,
      {},
      sessionPlanListSchema
    )
  }

  startSideChat(sessionId: string): Promise<SideChatStartResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}:btw`,
      { method: 'POST', body: JSON.stringify({}) },
      sideChatStartResultSchema
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
      skills?: PromptSkill[]
      promptId?: string
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
          ...(input.swarmMode === undefined ? {} : { swarm_mode: input.swarmMode }),
          ...(input.skills === undefined || input.skills.length === 0 ? {} : { skills: input.skills }),
          ...(input.promptId === undefined ? {} : { prompt_id: input.promptId })
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

  searchFiles(sessionId: string, query: string): Promise<FileSearchResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:search`,
      { method: 'POST', body: JSON.stringify({ query, limit: 50, follow_gitignore: true }) },
      fileSearchResultSchema
    )
  }

  /** kimi 0.39+：跨 root 的文件/目录补全建议，不需要 session/workspace 注册。
      主 root 的候选返回相对路径，附加 root 返回绝对路径。 */
  suggestFiles(input: { query: string; roots: string[]; limit?: number }): Promise<FileSuggestResult> {
    return this.request(
      '/api/v1/fs:suggest',
      {
        method: 'POST',
        body: JSON.stringify({
          query: input.query,
          roots: input.roots,
          limit: input.limit ?? 50,
          follow_gitignore: true
        })
      },
      fileSuggestResultSchema
    )
  }

  grepFiles(sessionId: string, pattern: string): Promise<FileGrepResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:grep`,
      {
        method: 'POST',
        body: JSON.stringify({
          pattern,
          regex: false,
          case_sensitive: false,
          follow_gitignore: true,
          max_files: 200,
          max_matches_per_file: 50,
          max_total_matches: 5_000,
          context_lines: 2
        })
      },
      fileGrepResultSchema
    )
  }

  openFile(sessionId: string, path: string, line?: number): Promise<FileOpenResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:open`,
      { method: 'POST', body: JSON.stringify({ path, ...(line === undefined ? {} : { line }) }) },
      fileOpenResultSchema
    )
  }

  openFileIn(sessionId: string, appId: 'finder' | 'cursor' | 'vscode' | 'iterm' | 'terminal', path: string, line?: number): Promise<FileOpenResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:open-in`,
      {
        method: 'POST',
        body: JSON.stringify({ app_id: appId, path, ...(line === undefined ? {} : { line }) })
      },
      fileOpenResultSchema
    )
  }

  revealFile(sessionId: string, path: string): Promise<FileRevealResult> {
    return this.request(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/fs:reveal`,
      { method: 'POST', body: JSON.stringify({ path }) },
      fileRevealResultSchema
    )
  }

  async downloadWorkspaceFile(sessionId: string, path: string): Promise<Uint8Array> {
    const encodedPath = path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const response = await this.#fetch(
      `${this.#origin}/api/v1/sessions/${encodeURIComponent(sessionId)}/fs/${encodedPath}`,
      { headers: this.#identifiedHeaders({ authorization: `Bearer ${this.#token}`, accept: 'application/octet-stream' }) }
    )
    if (!response.ok) throw await this.#binaryError(response, 'Kimi workspace file download failed')
    return new Uint8Array(await response.arrayBuffer())
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

  #identifiedHeaders(init: Record<string, string>): Headers {
    const headers = new Headers(init)
    this.#addClientIdentity(headers)
    return headers
  }

  #addClientIdentity(headers: Headers): void {
    const identity = this.#identity
    if (identity === null) return
    headers.set('X-Kimi-Client-Id', identity.clientId)
    headers.set('X-Kimi-Client-Name', identity.clientName)
    headers.set('X-Kimi-Client-Version', identity.clientVersion)
    headers.set('X-Kimi-Client-Ui-Mode', identity.clientUiMode)
  }

  async #binaryError(response: Response, messagePrefix: string): Promise<KimiApiError> {
    let message = `${messagePrefix} with HTTP ${response.status}`
    let code = -1
    let requestId: string | undefined
    try {
      const payload = await response.json() as Partial<KimiEnvelope<unknown>>
      message = payload.msg ?? message
      code = typeof payload.code === 'number' ? payload.code : code
      requestId = payload.request_id
    } catch {
      // Binary endpoint failures may omit a JSON envelope.
    }
    return new KimiApiError(message, {
      code,
      ...(requestId === undefined ? {} : { requestId }),
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after'))
    })
  }
}

function providerQuery(provider?: string): string {
  if (provider === undefined) return ''
  return `?${new URLSearchParams({ provider })}`
}

/** 0.37.2+：v2 sessions 的 page_size 上限放宽到 10000，下限 1。 */
function clampPageSize(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(10_000, Math.max(1, Math.floor(value)))
}

function isFullV2Item(item: SessionSummaryV2 | SessionSummaryV2Lite): item is SessionSummaryV2 {
  return 'workspace' in item && 'meta' in item && 'activity' in item
}

function isLiteV2Item(item: SessionSummaryV2 | SessionSummaryV2Lite): item is SessionSummaryV2Lite {
  return !('workspace' in item) && 'archived' in item
}

function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60 * 60 * 1_000)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.min(timestamp - Date.now(), 60 * 60 * 1_000))
}

function openApiRequestBodyHasProperty(
  document: unknown,
  path: string,
  method: string,
  property: string
): boolean {
  const root = recordValue(document)
  const paths = recordValue(root?.paths)
  const operation = recordValue(recordValue(paths?.[path])?.[method])
  const requestBody = recordValue(operation?.requestBody)
  if (root === null || requestBody === null) return false
  return openApiNodeHasProperty(root, requestBody, property, new Set())
}

function openApiNodeHasProperty(
  root: Record<string, unknown>,
  node: unknown,
  property: string,
  seenRefs: Set<string>
): boolean {
  if (Array.isArray(node)) {
    return node.some((item) => openApiNodeHasProperty(root, item, property, seenRefs))
  }
  const record = recordValue(node)
  if (record === null) return false
  const ref = typeof record.$ref === 'string' ? record.$ref : null
  if (ref !== null && ref.startsWith('#/') && !seenRefs.has(ref)) {
    seenRefs.add(ref)
    const target = ref.slice(2).split('/').reduce<unknown>((value, segment) => {
      return recordValue(value)?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')]
    }, root)
    if (openApiNodeHasProperty(root, target, property, seenRefs)) return true
  }
  const properties = recordValue(record.properties)
  if (properties !== null && Object.prototype.hasOwnProperty.call(properties, property)) return true
  return Object.entries(record).some(([key, value]) => {
    if (key === 'responses' || key === 'security') return false
    return openApiNodeHasProperty(root, value, property, seenRefs)
  })
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
