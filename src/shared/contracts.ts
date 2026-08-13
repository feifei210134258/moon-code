export const ipcChannels = {
  appBootstrap: 'app:bootstrap',
  runtimeDiscover: 'runtime:discover',
  kimiCliUpdateCheck: 'kimi-cli:update:check',
  kimiCliUpdateDownload: 'kimi-cli:update:download',
  runtimeStart: 'runtime:start',
  runtimeRestart: 'runtime:restart',
  runtimeConnectExternal: 'runtime:connect-external',
  runtimeStop: 'runtime:stop',
  runtimeStateChanged: 'runtime:state-changed',
  globalStateChanged: 'global:state-changed',
  workspaceTree: 'workspace:tree',
  workspaceTreePage: 'workspace:tree-page',
  workspaceAdd: 'workspace:add',
  workspaceRename: 'workspace:rename',
  workspaceDelete: 'workspace:delete',
  sessionOpen: 'session:open',
  sessionCreate: 'session:create',
  sessionRename: 'session:rename',
  sessionArchive: 'session:archive',
  sessionRestore: 'session:restore',
  sessionFork: 'session:fork',
  sessionExport: 'session:export',
  sessionsArchivedList: 'sessions:archived:list',
  sessionChildrenList: 'session:children:list',
  sessionWarningsList: 'session:warnings:list',
  sessionRuntimeGet: 'session:runtime:get',
  sessionPlanModeSet: 'session:plan-mode:set',
  sessionSwarmModeSet: 'session:swarm-mode:set',
  sessionOperationalGet: 'session:operational:get',
  sessionCompact: 'session:compact',
  sessionUndo: 'session:undo',
  sideChatStart: 'side-chat:start',
  sideChatPrompt: 'side-chat:prompt',
  sideChatClose: 'side-chat:close',
  agentTranscriptGet: 'agent:transcript:get',
  sessionGoalControl: 'session:goal:control',
  taskCancel: 'task:cancel',
  sessionStateChanged: 'session:state-changed',
  promptSubmit: 'prompt:submit',
  promptSteer: 'prompt:steer',
  promptAbort: 'prompt:abort',
  sessionAbort: 'session:abort',
  approvalRespond: 'approval:respond',
  questionRespond: 'question:respond',
  questionDismiss: 'question:dismiss',
  attachmentsPick: 'attachments:pick',
  attachmentsPaste: 'attachments:paste',
  attachmentsAddWorkspaceFile: 'attachments:add-workspace-file',
  attachmentRead: 'attachment:read',
  attachmentDiscard: 'attachment:discard',
  filesList: 'files:list',
  filesRead: 'files:read',
  filesSearch: 'files:search',
  filesGrep: 'files:grep',
  filesDownload: 'files:download',
  filesOpen: 'files:open',
  filesOpenIn: 'files:open-in',
  filesOpenSystem: 'files:open-system',
  filesReveal: 'files:reveal',
  filesTrash: 'files:trash',
  markdownImageRead: 'markdown:image:read',
  gitStatus: 'git:status',
  gitBranches: 'git:branches',
  fileDiff: 'file:diff',
  terminalsList: 'terminals:list',
  terminalCreate: 'terminal:create',
  terminalAttach: 'terminal:attach',
  terminalDetach: 'terminal:detach',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalClose: 'terminal:close',
  terminalOutput: 'terminal:output',
  terminalExit: 'terminal:exit',
  settingsGet: 'settings:get',
  settingsDefaultModelSet: 'settings:default-model:set',
  settingsSecondaryModelSet: 'settings:secondary-model:set',
  settingsSecondaryModelDisable: 'settings:secondary-model:disable',
  settingsSecondaryModelInherit: 'settings:secondary-model:inherit',
  settingsPreferencesUpdate: 'settings:preferences:update',
  providerAdd: 'provider:add',
  providerUpdate: 'provider:update',
  providerDelete: 'provider:delete',
  providersRefresh: 'providers:refresh',
  catalogProvidersList: 'catalog:providers:list',
  catalogProviderGet: 'catalog:provider:get',
  oauthLoginStart: 'oauth:login:start',
  oauthLoginPoll: 'oauth:login:poll',
  oauthLoginCancel: 'oauth:login:cancel',
  oauthLogout: 'oauth:logout',
  skillsSessionList: 'skills:session:list',
  skillsWorkspaceList: 'skills:workspace:list',
  skillActivate: 'skill:activate',
  toolsList: 'tools:list',
  mcpServersList: 'mcp:servers:list',
  mcpServerRestart: 'mcp:server:restart',
  browserOpenHtml: 'browser:open-html',
  browserNavigate: 'browser:navigate',
  browserBack: 'browser:back',
  browserForward: 'browser:forward',
  browserReload: 'browser:reload',
  browserStop: 'browser:stop',
  browserSetBounds: 'browser:set-bounds',
  browserSetVisible: 'browser:set-visible',
  browserSetOverlay: 'browser:set-overlay',
  browserSetWorkspace: 'browser:set-workspace',
  browserSetViewport: 'browser:set-viewport',
  browserClearConsole: 'browser:clear-console',
  browserClearNetwork: 'browser:clear-network',
  browserNetworkDetails: 'browser:network-details',
  browserCapture: 'browser:capture',
  browserAnnotationPick: 'browser:annotation-pick',
  browserAnnotationDelete: 'browser:annotation-delete',
  browserAnnotationSubmit: 'browser:annotation-submit',
  browserOpenExternal: 'browser:open-external',
  browserDiscoverLocal: 'browser:discover-local',
  browserStateChanged: 'browser:state-changed',
  usageGet: 'usage:get',
  usageRefresh: 'usage:refresh',
  usagePreferencesUpdate: 'usage:preferences:update',
  usageStateChanged: 'usage:state-changed',
  petSessionViewed: 'pet:session-viewed',
  petOpenSession: 'pet:open-session',
  petBootstrap: 'pet:bootstrap',
  petStateChanged: 'pet:state-changed',
  petDragStart: 'pet:drag-start',
  petDragMove: 'pet:drag-move',
  petDragEnd: 'pet:drag-end'
} as const

export type RuntimeStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

export interface RuntimeCandidate {
  kind: 'managed' | 'system'
  version: string | null
  executable: string | null
  compatible: boolean
  reason: string | null
}

export interface RuntimePublicState {
  status: RuntimeStatus
  mode: 'managed' | 'system' | 'shared' | 'external' | null
  version: string | null
  serverId: string | null
  origin: string | null
  error: string | null
}

export interface RuntimeExternalConnectionInput {
  origin: string
  token: string
}

export interface RuntimeDiscovery {
  supportedRange: string
  managed: RuntimeCandidate
  system: RuntimeCandidate
}

export type KimiCliUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'installed'
  | 'error'

export interface KimiCliUpdateState {
  phase: KimiCliUpdatePhase
  currentVersion: string | null
  latestVersion: string | null
  executable: string | null
  checkedAt: string | null
  error: string | null
  requiresRestart: boolean
}

export interface AppBootstrapState {
  appVersion: string
  platform: string
  runtime: RuntimePublicState
  discovery: RuntimeDiscovery
}

export interface SessionNavigationItem {
  id: string
  title: string
  updatedAt: string | null
  busy: boolean
  pendingInteraction: 'none' | 'approval' | 'question'
  lastTurnReason: 'completed' | 'cancelled' | 'failed' | null
  lastPrompt: string | null
  parentSessionId?: string | null
  archivedAt?: string | null
}

export interface WorkspaceNavigationItem {
  id: string
  name: string
  root: string
  sessions: SessionNavigationItem[]
}

export interface WorkspaceNavigationSnapshot {
  workspaces: WorkspaceNavigationItem[]
  hasMoreSessions: boolean
  nextBeforeId: string | null
}

export interface KimiSessionWarning {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export interface WorkspaceAddResult {
  cancelled: boolean
  workspaceId: string | null
}

export interface SessionCreateResult {
  sessionId: string
  workspaceId: string
}

export interface SessionExportResult {
  saved: boolean
}

export type SessionTranscriptPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | {
      type: 'tool'
      toolCallId: string
      toolName: string
      state: 'running' | 'done' | 'error'
      description?: string
      inputPreview?: string
      outputPreview?: string
      outputStream?: 'stdout' | 'stderr' | 'mixed'
      progress?: number
      toolDiff?: {
        path: string
        before: string
        after: string
        hunks: number | null
      }
      writtenPath?: string
    }
  | { type: 'file'; fileId: string; name: string; mediaType: string; size: number }
  | {
      type: 'media'
      mediaType: 'image' | 'video'
      sourceKind: string
      fileId: string | null
      sourceUrl: string | null
      sourceMediaType: string | null
      base64Data: string | null
    }
  | { type: 'unknown'; rawType: string }

export interface SessionTranscriptMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: SessionTranscriptPart[]
  createdAt: string
  promptId: string | null
  status: 'pending' | 'completed' | 'error'
  originKind?: string
  originTaskId?: string
}

export interface SessionTranscriptMarker {
  markerId: string
  marker: string
  payload: unknown
  at: string | null
}

export interface KimiTodoItem {
  title: string
  status: 'pending' | 'in_progress' | 'done'
}

export interface KimiTodoList {
  todoId: string
  items: KimiTodoItem[]
  updatedAt: string | null
}

export interface KimiSideChatView {
  agentId: string
  messages: SessionTranscriptMessage[]
  active: boolean
  error: string | null
}

export interface KimiAgentTranscript {
  agentId: string
  messages: SessionTranscriptMessage[]
  hasMore: boolean
  usage: SessionAgentUsage | null
}

export interface SessionViewState {
  sessionId: string
  title: string
  workspaceRoot: string
  busy: boolean
  mainTurnActive: boolean
  activePromptId: string | null
  activePromptStatus: 'running' | 'queued' | 'blocked' | null
  phase: 'idle' | 'loading' | 'ready' | 'resyncing' | 'reconnecting' | 'error'
  cursor: { seq: number; epoch?: string } | null
  messages: SessionTranscriptMessage[]
  markers: SessionTranscriptMarker[]
  todos: KimiTodoList[]
  sideChat: KimiSideChatView | null
  pendingApprovals: ApprovalRequestView[]
  pendingQuestions: QuestionRequestView[]
  agents: SessionAgentView[]
  usage: SessionUsageSummary
  hasMoreMessages: boolean
  resyncCount: number
  unknownEventCount: number
  error: string | null
}

export interface SessionUsageSummary {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number | null
  contextTokens: number
  contextLimit: number
  turnCount: number | null
}

export interface KimiPlanUsageWindow {
  key: string
  label: string
  used: number
  limit: number
  ratio: number | null
  resetHint: string | null
}

export interface KimiExtraUsage {
  balanceCents: number
  totalCents: number
  monthlyChargeLimitEnabled: boolean
  monthlyChargeLimitCents: number
  monthlyUsedCents: number
  currency: string
}

export interface KimiUsagePreferences {
  infoThreshold: number
  warningThreshold: number
  criticalThreshold: number
  systemNotifications: boolean
  turnNotifications?: boolean
  notificationSound?: boolean
  locale?: 'zh-CN' | 'en-US'
  petEnabled?: boolean
}

export interface KimiUsageState {
  phase: 'idle' | 'loading' | 'ready' | 'stale' | 'unavailable'
  summary: KimiPlanUsageWindow | null
  limits: KimiPlanUsageWindow[]
  extraUsage: KimiExtraUsage | null
  updatedAt: string | null
  nextRefreshAt: string | null
  refreshing: boolean
  source: 'kimi-oauth-usage'
  error: string | null
  preferences: KimiUsagePreferences
}

export interface SessionAgentUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  contextTokens: number | null
}

export interface SessionAgentView {
  id: string
  role: 'main' | 'subagent'
  name: string
  description: string
  status: 'idle' | 'queued' | 'working' | 'suspended' | 'completed' | 'failed' | 'cancelled'
  subagentType: string | null
  parentAgentId: string | null
  parentToolCallId: string | null
  swarmIndex: number | null
  runInBackground: boolean
  model: string | null
  thinkingEffort: string | null
  createdAt: string | null
  startedAt: string | null
  completedAt: string | null
  suspendedReason: string | null
  outputPreview: string | null
  usage: SessionAgentUsage | null
}

export interface ApprovalRequestView {
  approvalId: string
  toolCallId: string
  toolName: string
  action: string
  display: string
  createdAt: string
  expiresAt: string
}

export interface QuestionOptionView {
  id: string
  label: string
  description?: string
  recommended: boolean
}

export interface QuestionItemView {
  id: string
  question: string
  header?: string
  body?: string
  options: QuestionOptionView[]
  multiSelect: boolean
  allowOther: boolean
  otherLabel?: string
  otherDescription?: string
}

export interface QuestionRequestView {
  questionId: string
  toolCallId: string | null
  questions: QuestionItemView[]
  createdAt: string
}

export type QuestionAnswerInput =
  | { kind: 'single'; option_id: string }
  | { kind: 'multi'; option_ids: string[] }
  | { kind: 'other'; text: string }
  | { kind: 'multi_with_other'; option_ids: string[]; other_text: string }
  | { kind: 'skipped' }

export interface InteractionResolveResult {
  resolved: boolean
  resolvedAt: string
}

export interface QuestionDismissResult {
  dismissed: boolean
  dismissedAt: string
}

export interface PromptSubmissionResult {
  promptId: string
  userMessageId: string
  status: 'running' | 'queued' | 'blocked'
}

export type KimiPermissionMode = 'manual' | 'auto' | 'yolo'

export interface KimiPromptControls {
  model: string
  thinking: string
  permissionMode: KimiPermissionMode
  planMode: boolean
  swarmMode: boolean
}

export interface KimiUploadedFile {
  fileId: string
  name: string
  mediaType: string
  size: number
}

export interface KimiAttachmentPickResult {
  cancelled: boolean
  files: KimiUploadedFile[]
}

export interface KimiAttachmentPasteInput {
  name: string
  mediaType: string
  bytes: Uint8Array
}

export interface KimiAttachmentBlob {
  fileId: string
  mediaType: string
  bytes: Uint8Array
}

export interface KimiPromptInput {
  text: string
  controls: KimiPromptControls
  attachments?: KimiUploadedFile[]
  goalObjective?: string
  deliveryMode?: 'queue' | 'steer'
}

export interface KimiSideChatPromptInput {
  text: string
  controls: KimiPromptControls
}

export interface KimiUndoDraft {
  text: string
  attachments: KimiUploadedFile[]
}

export interface WorkspaceMarkdownImage {
  path: string
  dataUrl: string
  mediaType: string
  size: number
}

export interface KimiSessionRuntimeStatus {
  busy: boolean
  model: string | null
  thinking: string
  permissionMode: KimiPermissionMode
  planMode: boolean
  swarmMode: boolean
  contextTokens: number
  maxContextTokens: number
  contextUsage: number
}

export interface KimiPromptQueueItem {
  promptId: string
  userMessageId: string
  status: 'running' | 'queued' | 'blocked'
  textPreview: string
  createdAt: string | null
}

export interface KimiPromptQueueState {
  active: KimiPromptQueueItem | null
  queued: KimiPromptQueueItem[]
}

export interface KimiGoalBudget {
  tokenBudget: number | null
  turnBudget: number | null
  wallClockBudgetMs: number | null
  remainingTokens: number | null
  remainingTurns: number | null
  remainingWallClockMs: number | null
  tokenBudgetReached: boolean
  turnBudgetReached: boolean
  wallClockBudgetReached: boolean
  overBudget: boolean
}

export interface KimiSessionGoal {
  goalId: string
  objective: string
  completionCriterion: string | null
  status: 'active' | 'paused' | 'blocked' | 'complete'
  turnsUsed: number
  tokensUsed: number
  wallClockMs: number
  budget: KimiGoalBudget
  terminalReason: string | null
}

export interface KimiBackgroundTask {
  id: string
  sessionId: string
  kind: 'subagent' | 'bash' | 'tool'
  description: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  command: string | null
  createdAt: string | null
  startedAt: string | null
  completedAt: string | null
  outputPreview: string | null
  outputBytes: number | null
}

export interface KimiSessionOperationalState {
  goal: KimiSessionGoal | null
  tasks: KimiBackgroundTask[]
  prompts: KimiPromptQueueState
}

export interface PromptSteerResult {
  steered: boolean
  promptIds: string[]
}

export interface PromptAbortResult {
  aborted: boolean
  atSeq: number | null
}

export type WorkspaceFileKind = 'file' | 'directory' | 'symlink'
export type WorkspaceFileGitStatus =
  | 'clean'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'ignored'
  | 'conflicted'

export interface WorkspaceFileEntry {
  path: string
  name: string
  kind: WorkspaceFileKind
  size: number | null
  modifiedAt: string | null
  mime: string | null
  languageId: string | null
  isBinary: boolean
  gitStatus: WorkspaceFileGitStatus | null
  childCount: number | null
}

export interface WorkspaceFileList {
  path: string
  items: WorkspaceFileEntry[]
  truncated: boolean
}

export interface WorkspaceFilePreview {
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
  size: number
  truncated: boolean
  mime: string
  languageId: string | null
  lineCount: number | null
  isBinary: boolean
}

export interface WorkspaceFileSearchItem {
  path: string
  name: string
  kind: WorkspaceFileKind
  score: number
  matchPositions: number[]
}

export interface WorkspaceFileSearchResult {
  items: WorkspaceFileSearchItem[]
  truncated: boolean
}

export interface WorkspaceGrepMatch {
  line: number
  column: number
  text: string
  before: string[]
  after: string[]
}

export interface WorkspaceGrepResult {
  files: Array<{ path: string; matches: WorkspaceGrepMatch[] }>
  filesScanned: number
  truncated: boolean
  elapsedMs: number
}

export type WorkspaceOpenApp = 'finder' | 'cursor' | 'vscode' | 'iterm' | 'terminal'

export interface WorkspaceGitStatus {
  available: boolean
  branch: string
  ahead: number
  behind: number
  entries: Record<string, WorkspaceFileGitStatus>
  additions: number
  deletions: number
  pullRequest: { number: number; state: 'open' | 'merged' | 'closed' | 'draft'; url: string } | null
}

export interface WorkspaceGitBranches {
  available: boolean
  current: string | null
  branches: string[]
}

export interface WorkspaceFileDiff {
  path: string
  diff: string
  truncated: boolean
}

export interface SessionTerminal {
  id: string
  sessionId: string
  cwd: string
  shell: string
  cols: number
  rows: number
  status: 'running' | 'exited'
  createdAt: string
  exitedAt: string | null
  exitCode: number | null
}

export interface TerminalOutputEvent {
  sessionId: string
  terminalId: string
  seq: number
  data: string
}

export interface TerminalExitEvent {
  sessionId: string
  terminalId: string
  exitCode: number | null
}

export type KimiProviderType =
  | 'anthropic'
  | 'openai'
  | 'kimi'
  | 'google-genai'
  | 'openai_responses'
  | 'vertexai'

export interface KimiAuthSummary {
  ready: boolean
  providersCount: number
  defaultModel: string | null
  managedProvider: {
    name: string
    status: 'authenticated' | 'expired' | 'revoked' | 'unauthenticated'
  } | null
}

export interface KimiModelCatalogItem {
  id: string
  providerId: string
  displayName: string
  maxContextSize: number
  capabilities: string[]
  supportEfforts: string[]
  defaultEffort: string | null
}

export interface KimiProviderCatalogItem {
  id: string
  type: string
  baseUrl: string | null
  defaultModel: string | null
  hasCredential: boolean
  status: 'connected' | 'error' | 'unconfigured'
  models: string[]
}

export interface KimiCatalogModel {
  id: string
  name: string | null
  maxContextSize: number
  capabilities: string[]
  reasoning: boolean
}

export interface KimiCatalogProviderSummary {
  id: string
  name: string
  wireType: KimiProviderType | null
  needsBaseUrl: boolean
  envKey: string | null
  modelCount: number
  rejected: boolean
  rejectReason: string | null
}

export interface KimiCatalogProviderDetail extends KimiCatalogProviderSummary {
  models: KimiCatalogModel[]
}

export interface KimiSettingsPreferences {
  defaultProvider: string | null
  defaultModel: string | null
  defaultPermissionMode: 'manual' | 'auto' | 'yolo' | null
  defaultPlanMode: boolean | null
  mergeAllAvailableSkills: boolean | null
  telemetry: boolean | null
  thinkingEffort: string | null
}

export interface KimiSecondaryModelSettings {
  model: string | null
  defaultEffort: string | null
  maxOutputSize: number | null
}

export type KimiSecondaryModelPreferenceMode = 'inherit' | 'configured' | 'disabled'

export interface KimiSecondaryModelPreference {
  mode: KimiSecondaryModelPreferenceMode
  model: string | null
  defaultEffort: string | null
}

export type KimiSecondaryModelAppliedSource =
  | 'moon-code-environment'
  | 'inherited-environment'
  | 'kimi-config'
  | 'disabled'

export interface KimiSecondaryModelControlState {
  preference: KimiSecondaryModelPreference
  appliedPreference: KimiSecondaryModelPreference | null
  appliedSource: KimiSecondaryModelAppliedSource | null
  requiresRestart: boolean
  configurationMode: 'runtime-env' | 'runtime-rest' | 'read-only'
}

export interface KimiSecondaryModelUpdateInput {
  model: string
  defaultEffort?: string
  maxOutputSize?: number
}

export interface KimiSettingsSnapshot {
  auth: KimiAuthSummary
  models: KimiModelCatalogItem[]
  secondaryModelOptions: KimiModelCatalogItem[]
  providers: KimiProviderCatalogItem[]
  preferences: KimiSettingsPreferences
  secondaryModel: KimiSecondaryModelSettings
  secondaryModelControl: KimiSecondaryModelControlState
  capabilities: {
    canAddProvider: boolean
    canEditProvider: boolean
    canDeleteProvider: boolean
    providerManagementUnavailableReason: string | null
    providerDeleteUnavailableReason: string | null
    secondaryModel: {
      supported: boolean
      enabled: boolean | null
      writable: boolean
      canDisable: boolean
      maxOutputSizeWritable: boolean
      unavailableReason: string | null
    }
  }
}

/**
 * A safe invalidation notice for Kimi Server state shared by every client.
 * The Renderer refetches its own view through existing typed IPC instead of
 * receiving config contents (which can include redacted provider metadata).
 */
export interface KimiGlobalStateEvent {
  scope: 'navigation' | 'config'
  eventType: string
}

export interface KimiPreferencesPatch {
  telemetry?: boolean
  defaultPermissionMode?: 'manual' | 'auto' | 'yolo'
  defaultPlanMode?: boolean
  mergeAllAvailableSkills?: boolean
  thinkingEffort?: string | null
}

export interface AddKimiProviderInput {
  id: string
  type: KimiProviderType
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
  defaultModelContextSize?: number
}

export interface UpdateKimiProviderInput {
  id: string
  newId?: string
  type: KimiProviderType
  baseUrl?: string
  apiKey?: string
  defaultModel?: string
  defaultModelContextSize?: number
}

export interface KimiProviderRefreshResult {
  changed: Array<{
    providerId: string
    providerName: string
    added: number
    removed: number
  }>
  unchanged: string[]
  failed: Array<{ provider: string; reason: string }>
}

export interface KimiOAuthFlow {
  flowId: string
  provider: string
  status: 'pending' | 'authenticated' | 'denied' | 'expired' | 'cancelled'
  verificationUri: string | null
  verificationUriComplete: string | null
  userCode: string | null
  expiresIn: number | null
  interval: number | null
  expiresAt: string | null
  resolvedAt: string | null
  errorMessage: string | null
}

export interface KimiOAuthCancelResult {
  cancelled: boolean
  status: KimiOAuthFlow['status']
}

export type KimiSkillSource = 'project' | 'user' | 'extra' | 'builtin'

export interface KimiSkill {
  name: string
  description: string
  source: KimiSkillSource
  type: string | null
  userInvocableOnly: boolean
}

export interface KimiSkillActivationResult {
  activated: boolean
  skillName: string
}

export interface KimiTool {
  name: string
  description: string
  source: 'builtin' | 'skill' | 'mcp'
  mcpServerId: string | null
  active: boolean
}

export interface KimiMcpServer {
  id: string
  name: string
  transport: 'stdio' | 'http' | 'sse'
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
  lastError: string | null
  toolCount: number
}

export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserViewport {
  mode: 'auto' | 'desktop' | 'tablet' | 'mobile' | 'custom'
  width: number | null
  height: number | null
  deviceScaleFactor: number
}

export interface BrowserConsoleEntry {
  id: string
  level: 'info' | 'warning' | 'error' | 'debug'
  text: string
  source: string
  line: number
  timestamp: number
}

export interface BrowserNetworkEntry {
  id: string
  requestId: string
  url: string
  method: string
  status: number | null
  type: string
  mimeType: string | null
  durationMs: number | null
  size: number | null
  failed: boolean
  errorText: string | null
}

export interface BrowserNetworkDetails {
  requestId: string
  requestHeaders: Record<string, string>
  responseHeaders: Record<string, string>
  body: string | null
  bodyTruncated: boolean
  bodyUnavailableReason: string | null
}

export interface BrowserCaptureResult {
  dataUrl: string
  width: number
  height: number
  fullPage: boolean
}

export type BrowserAnnotationMode = 'element' | 'region'

export interface BrowserAnnotationRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BrowserVisualAnnotation {
  schemaVersion: 1
  page: {
    url: string
    title: string
    viewport: { width: number; height: number; dpr: number }
  }
  scroll?: { x: number; y: number }
  target: {
    kind: BrowserAnnotationMode
    selector?: string
    xpath?: string
    tag?: string
    ariaLabel?: string
    textSnippet?: string
    rect: BrowserAnnotationRect
  }
  comment: string
  capturedAt: string
}

export interface BrowserAnnotationDraft {
  id: string
  annotation: BrowserVisualAnnotation
  screenshot: BrowserCaptureResult
}

export interface BrowserAnnotationSubmitInput {
  draftId: string
  comment: string
  pageUrl: string
  includeSelector: boolean
  includeText: boolean
  includeScreenshot: boolean
}

export interface BrowserAnnotationSubmission {
  annotation: BrowserVisualAnnotation
  screenshot: BrowserCaptureResult | null
}

export interface BrowserViewState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  visible: boolean
  viewport: BrowserViewport
  consoleEntries: BrowserConsoleEntry[]
  networkEntries: BrowserNetworkEntry[]
  error: string | null
}

export type PetVisualState =
  | 'idle'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'review'
  | 'disconnected'

export interface PetSessionState {
  serverId: string
  workspaceId: string
  workspaceName: string
  sessionId: string
  title: string
  status: PetVisualState
  pendingInteraction: 'none' | 'approval' | 'question'
  backgroundActivity: boolean
  unread: boolean
  startedAt: string | null
  updatedAt: string | null
  latestTool: string | null
  overflowCount: number
}

export interface PetRosterState {
  connected: boolean
  items: PetSessionState[]
  overflow: number
  updatedAt: string
}

export interface PetOpenSessionIntent {
  serverId: string
  workspaceId: string
  sessionId: string
  focus: 'interaction' | 'unread' | 'latest'
}

export interface PetPointerPosition {
  screenX: number
  screenY: number
}

export interface KimiPetWindowApi {
  getState(): Promise<PetRosterState>
  openSession(sessionId?: string): void
  beginDrag(position: PetPointerPosition): void
  moveDrag(position: PetPointerPosition): void
  endDrag(position: PetPointerPosition): void
  onStateChanged(listener: (roster: PetRosterState) => void): () => void
}

export interface KimiAgentDesktopApi {
  getBootstrapState(): Promise<AppBootstrapState>
  discoverRuntime(): Promise<RuntimeDiscovery>
  checkKimiCliUpdate(): Promise<KimiCliUpdateState>
  downloadKimiCliUpdate(): Promise<KimiCliUpdateState>
  startRuntime(mode?: 'managed' | 'system'): Promise<RuntimePublicState>
  restartRuntime(): Promise<RuntimePublicState>
  connectExternalRuntime(input: RuntimeExternalConnectionInput): Promise<RuntimePublicState>
  stopRuntime(): Promise<RuntimePublicState>
  getWorkspaceTree(): Promise<WorkspaceNavigationItem[]>
  getWorkspaceTreePage(beforeId?: string): Promise<WorkspaceNavigationSnapshot>
  addWorkspace(): Promise<WorkspaceAddResult>
  renameWorkspace(workspaceId: string, name: string): Promise<void>
  deleteWorkspace(workspaceId: string): Promise<void>
  createSession(workspaceId: string): Promise<SessionCreateResult>
  renameSession(sessionId: string, title: string): Promise<void>
  archiveSession(sessionId: string): Promise<void>
  restoreSession(sessionId: string): Promise<SessionCreateResult>
  forkSession(sessionId: string): Promise<SessionCreateResult>
  exportSession(sessionId: string): Promise<SessionExportResult>
  listArchivedSessions(): Promise<SessionNavigationItem[]>
  listChildSessions(sessionId: string): Promise<SessionNavigationItem[]>
  getSessionWarnings(sessionId: string): Promise<KimiSessionWarning[]>
  openSession(sessionId: string): Promise<SessionViewState>
  getSessionRuntimeStatus(sessionId: string): Promise<KimiSessionRuntimeStatus>
  setSessionPlanMode(sessionId: string, enabled: boolean): Promise<void>
  setSessionSwarmMode(sessionId: string, enabled: boolean): Promise<void>
  getSessionOperationalState(sessionId: string): Promise<KimiSessionOperationalState>
  compactSession(sessionId: string, instruction?: string): Promise<void>
  undoSession(sessionId: string, count?: number): Promise<KimiUndoDraft | null>
  startSideChat(sessionId: string): Promise<KimiSideChatView>
  submitSideChatPrompt(
    sessionId: string,
    agentId: string,
    input: KimiSideChatPromptInput
  ): Promise<PromptSubmissionResult>
  closeSideChat(sessionId: string, agentId: string): Promise<void>
  getAgentTranscript(sessionId: string, agentId: string): Promise<KimiAgentTranscript>
  controlSessionGoal(sessionId: string, control: 'pause' | 'resume' | 'cancel'): Promise<KimiSessionGoal | null>
  cancelBackgroundTask(sessionId: string, taskId: string): Promise<{ cancelled: true }>
  submitPrompt(sessionId: string, input: KimiPromptInput): Promise<PromptSubmissionResult>
  steerPrompts(sessionId: string, promptIds: string[]): Promise<PromptSteerResult>
  abortPrompt(sessionId: string, promptId: string): Promise<PromptAbortResult>
  abortSession(sessionId: string): Promise<{ aborted: boolean }>
  respondApproval(
    sessionId: string,
    approvalId: string,
    response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session' }
  ): Promise<InteractionResolveResult>
  respondQuestion(
    sessionId: string,
    questionId: string,
    answers: Record<string, QuestionAnswerInput>
  ): Promise<InteractionResolveResult>
  dismissQuestion(sessionId: string, questionId: string): Promise<QuestionDismissResult>
  pickAttachments(): Promise<KimiAttachmentPickResult>
  pasteAttachment(input: KimiAttachmentPasteInput): Promise<KimiUploadedFile>
  attachWorkspaceFile(sessionId: string, path: string): Promise<KimiUploadedFile>
  readAttachment(fileId: string, mediaType: string): Promise<KimiAttachmentBlob>
  discardAttachment(fileId: string): Promise<void>
  listFiles(sessionId: string, path?: string): Promise<WorkspaceFileList>
  readFile(sessionId: string, path: string): Promise<WorkspaceFilePreview>
  searchFiles(sessionId: string, query: string): Promise<WorkspaceFileSearchResult>
  grepFiles(sessionId: string, pattern: string): Promise<WorkspaceGrepResult>
  downloadWorkspaceFile(sessionId: string, path: string): Promise<{ saved: boolean }>
  openWorkspaceFile(sessionId: string, path: string, line?: number): Promise<{ opened: true }>
  openWorkspaceFileIn(sessionId: string, appId: WorkspaceOpenApp, path: string, line?: number): Promise<{ opened: true }>
  openWorkspaceFileSystem(sessionId: string, path: string): Promise<{ opened: true }>
  revealWorkspaceFile(sessionId: string, path: string): Promise<{ revealed: true }>
  trashWorkspaceEntry(sessionId: string, path: string): Promise<{ trashed: true }>
  readMarkdownImage(sessionId: string, source: string): Promise<WorkspaceMarkdownImage | null>
  getGitStatus(sessionId: string): Promise<WorkspaceGitStatus>
  listGitBranches(sessionId: string): Promise<WorkspaceGitBranches>
  getFileDiff(sessionId: string, path: string): Promise<WorkspaceFileDiff>
  listTerminals(sessionId: string): Promise<SessionTerminal[]>
  createTerminal(sessionId: string, size?: { cols: number; rows: number }): Promise<SessionTerminal>
  attachTerminal(sessionId: string, terminalId: string, sinceSeq?: number): Promise<void>
  detachTerminal(sessionId: string, terminalId: string): Promise<void>
  sendTerminalInput(sessionId: string, terminalId: string, data: string): Promise<void>
  resizeTerminal(sessionId: string, terminalId: string, cols: number, rows: number): Promise<void>
  closeTerminal(sessionId: string, terminalId: string): Promise<{ closed: boolean }>
  getKimiSettings(): Promise<KimiSettingsSnapshot>
  setDefaultModel(modelId: string): Promise<KimiSettingsSnapshot>
  setSecondaryModel(input: KimiSecondaryModelUpdateInput): Promise<KimiSettingsSnapshot>
  disableSecondaryModel(): Promise<KimiSettingsSnapshot>
  inheritSecondaryModel(): Promise<KimiSettingsSnapshot>
  updateKimiPreferences(patch: KimiPreferencesPatch): Promise<KimiSettingsPreferences>
  addKimiProvider(input: AddKimiProviderInput): Promise<KimiSettingsSnapshot>
  updateKimiProvider(input: UpdateKimiProviderInput): Promise<KimiSettingsSnapshot>
  deleteKimiProvider(providerId: string): Promise<KimiSettingsSnapshot>
  refreshKimiProviders(input: { scope: 'all' | 'oauth' | 'provider'; providerId?: string }): Promise<KimiProviderRefreshResult>
  listKimiCatalogProviders(): Promise<KimiCatalogProviderSummary[]>
  getKimiCatalogProvider(catalogId: string): Promise<KimiCatalogProviderDetail>
  startOAuthLogin(provider?: string): Promise<KimiOAuthFlow>
  pollOAuthLogin(provider?: string): Promise<KimiOAuthFlow | null>
  cancelOAuthLogin(provider?: string): Promise<KimiOAuthCancelResult>
  logoutOAuth(provider?: string): Promise<{ loggedOut: true; provider: string }>
  listSessionSkills(sessionId: string): Promise<KimiSkill[]>
  listWorkspaceSkills(workspaceId: string): Promise<KimiSkill[]>
  activateSkill(sessionId: string, skillName: string, args?: string): Promise<KimiSkillActivationResult>
  listKimiTools(sessionId?: string): Promise<KimiTool[]>
  listMcpServers(): Promise<KimiMcpServer[]>
  restartMcpServer(serverId: string): Promise<{ restarting: true }>
  openHtmlPreview(sessionId: string, path: string): Promise<BrowserViewState>
  navigateBrowser(url: string): Promise<BrowserViewState>
  browserBack(): Promise<BrowserViewState>
  browserForward(): Promise<BrowserViewState>
  browserReload(): Promise<BrowserViewState>
  browserStop(): Promise<BrowserViewState>
  setBrowserBounds(bounds: BrowserBounds): Promise<void>
  setBrowserVisible(visible: boolean): Promise<BrowserViewState>
  setBrowserOverlay(open: boolean): Promise<void>
  setBrowserWorkspace(scope: string | null): Promise<BrowserViewState>
  setBrowserViewport(viewport: BrowserViewport): Promise<BrowserViewState>
  clearBrowserConsole(): Promise<BrowserViewState>
  clearBrowserNetwork(): Promise<BrowserViewState>
  getBrowserNetworkDetails(requestId: string): Promise<BrowserNetworkDetails>
  captureBrowser(fullPage: boolean): Promise<BrowserCaptureResult>
  pickBrowserAnnotation(mode: BrowserAnnotationMode): Promise<BrowserAnnotationDraft>
  deleteBrowserAnnotation(draftId: string): Promise<void>
  submitBrowserAnnotation(
    sessionId: string,
    input: BrowserAnnotationSubmitInput,
    controls: KimiPromptControls
  ): Promise<PromptSubmissionResult>
  openBrowserExternal(): Promise<{ opened: true }>
  discoverBrowserLocalServers(): Promise<string[]>
  getKimiUsage(): Promise<KimiUsageState>
  refreshKimiUsage(): Promise<KimiUsageState>
  updateKimiUsagePreferences(preferences: KimiUsagePreferences): Promise<KimiUsageState>
  markPetSessionViewed(sessionId: string): Promise<void>
  onRuntimeStateChanged(listener: (state: RuntimePublicState) => void): () => void
  onKimiGlobalStateChanged(listener: (event: KimiGlobalStateEvent) => void): () => void
  onSessionStateChanged(listener: (state: SessionViewState) => void): () => void
  onTerminalOutput(listener: (event: TerminalOutputEvent) => void): () => void
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
  onBrowserStateChanged(listener: (state: BrowserViewState) => void): () => void
  onKimiUsageStateChanged(listener: (state: KimiUsageState) => void): () => void
  onPetOpenSession(listener: (intent: PetOpenSessionIntent) => void): () => void
}
