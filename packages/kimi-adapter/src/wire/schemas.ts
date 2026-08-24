import { z } from 'zod'

export const envelopeSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    code: z.number().int(),
    msg: z.string(),
    data: dataSchema,
    request_id: z.string().optional()
  })

export const kimiServerMetaSchema = z.object({
  server_version: z.string().min(1),
  capabilities: z.record(z.string(), z.boolean()),
  server_id: z.string().min(1),
  started_at: z.iso.datetime(),
  open_in_apps: z.array(z.string()).optional(),
  dangerous_bypass_auth: z.boolean(),
  backend: z.enum(['v1', 'v2']).optional()
})

export type KimiServerMeta = z.infer<typeof kimiServerMetaSchema>

export const workspaceSummarySchema = z.object({
  id: z.string().min(1),
  root: z.string().min(1),
  name: z.string(),
  created_at: z.unknown(),
  last_opened_at: z.unknown(),
  session_count: z.number().int().nonnegative()
})

export const sessionSummarySchema = z.object({
  id: z.string().min(1),
  workspace_id: z.string().min(1),
  title: z.string(),
  created_at: z.unknown(),
  updated_at: z.unknown(),
  busy: z.boolean(),
  main_turn_active: z.boolean().optional(),
  pending_interaction: z.enum(['none', 'approval', 'question']).optional(),
  last_turn_reason: z.enum(['completed', 'cancelled', 'failed']).optional(),
  archived: z.boolean().optional(),
  current_prompt_id: z.string().optional(),
  last_prompt: z.string().optional(),
  metadata: z.object({ cwd: z.string().min(1) }).passthrough(),
  agent_config: z.object({ model: z.string() }).passthrough(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative().optional(),
    cache_creation_tokens: z.number().int().nonnegative().optional(),
    total_cost_usd: z.number().nonnegative().optional(),
    context_tokens: z.number().int().nonnegative(),
    // 0.38.0：usage 三字段均降为可选（快照 required 仅 input/output/cache/context_tokens）
    context_limit: z.number().int().nonnegative().optional(),
    turn_count: z.number().int().nonnegative().optional()
  }).passthrough(),
  permission_rules: z.array(z.unknown()),
  message_count: z.number().int().nonnegative(),
  last_seq: z.number().int().nonnegative()
})

export const workspaceListSchema = z.object({ items: z.array(workspaceSummarySchema) })
export const workspaceDeleteResultSchema = z.object({ deleted: z.literal(true) })
export const uploadedFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  media_type: z.string().min(1),
  size: z.number().int().nonnegative(),
  created_at: z.unknown(),
  expires_at: z.unknown().optional()
})
export const uploadedFileDeleteResultSchema = z.object({ deleted: z.literal(true) })
export const sessionListSchema = z.object({
  items: z.array(sessionSummarySchema),
  has_more: z.boolean()
})

export const sessionSummaryV2Schema = z.object({
  id: z.string().min(1),
  workspace: z.object({
    id: z.string().min(1),
    cwd: z.string().nullable()
  }),
  meta: z.object({
    title: z.string().nullable(),
    last_prompt: z.string().nullable(),
    created_at: z.number().int(),
    updated_at: z.number().int(),
    archived: z.boolean(),
    archived_at: z.number().int().nullable()
  }),
  activity: z.object({
    status: z.enum(['running', 'approval', 'question', 'failed', 'idle'])
  }),
  git: z.object({
    branch: z.string().nullable(),
    pull_request: z.object({
      number: z.number().int(),
      state: z.enum(['open', 'closed', 'merged']),
      url: z.string()
    }).nullable()
  }).optional()
})

/**
 * v2 sessions 列表条目：`fields=id,archived` 时服务端返回轻量投影
 * `{ id, archived }`，否则返回完整条目（workspace/meta/activity）。
 */
export const sessionSummaryV2LiteSchema = z.object({
  id: z.string().min(1),
  archived: z.boolean()
})

export const sessionListV2Schema = z.object({
  items: z.array(z.union([sessionSummaryV2Schema, sessionSummaryV2LiteSchema])),
  // 0.37.2+：每次列表响应的总条数（必填）
  total: z.number().int().nonnegative(),
  has_more: z.boolean(),
  next_page_token: z.string().nullable()
})

/** 0.38.0：`view=by_workspace` 时 group 内的 workspace 引用。 */
export const sessionV2WorkspaceRefSchema = z.object({
  id: z.string().min(1),
  cwd: z.string().nullable()
})

/** 0.38.0：`view=by_workspace` 时按 workspace 分组的会话条目（含组内总条数）。 */
export const sessionV2GroupSchema = z.object({
  workspace: sessionV2WorkspaceRefSchema,
  sessions: z.array(z.union([sessionSummaryV2Schema, sessionSummaryV2LiteSchema])),
  total: z.number().int().nonnegative()
})

/** 0.38.0：`view=by_workspace` 的列表响应（groups 替代 items）。 */
export const sessionListV2ByWorkspaceSchema = z.object({
  groups: z.array(sessionV2GroupSchema),
  total: z.number().int().nonnegative(),
  has_more: z.boolean(),
  next_page_token: z.string().nullable()
})

/**
 * 0.38.0：`GET /api/v2/sessions` 响应 data 按 `view` 查询参数分流——
 * 默认 `flat`（items/total/has_more/next_page_token，现状）与
 * `by_workspace`（groups/total/has_more/next_page_token）。两分支键不重叠
 * （items vs groups），zod 可无歧义收敛。
 */
export const sessionListV2PageSchema = z.union([
  sessionListV2Schema,
  sessionListV2ByWorkspaceSchema
])

export const messageContentPartSchema = z.object({
  type: z.string().min(1)
}).passthrough()

export const sessionMessageSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.array(messageContentPartSchema),
  created_at: z.unknown(),
  prompt_id: z.string().min(1).optional(),
  parent_message_id: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

export const inFlightToolSchema = z.object({
  tool_call_id: z.string().min(1),
  name: z.string().min(1),
  args: z.unknown().optional(),
  description: z.string().optional(),
  display: z.unknown().optional(),
  last_progress: z.object({
    kind: z.enum(['stdout', 'stderr', 'progress', 'status', 'custom']),
    text: z.string().optional(),
    percent: z.number().optional()
  }).optional()
})

export const inFlightTurnSchema = z.object({
  turn_id: z.number().int().nonnegative(),
  assistant_text: z.string(),
  thinking_text: z.string(),
  running_tools: z.array(inFlightToolSchema),
  current_prompt_id: z.string().optional()
})

export const approvalRequestSchema = z.object({
  approval_id: z.string().min(1),
  session_id: z.string().min(1),
  turn_id: z.number().int().nonnegative().optional(),
  tool_call_id: z.string().min(1),
  tool_name: z.string().min(1),
  action: z.string(),
  tool_input_display: z.unknown(),
  created_at: z.unknown(),
  expires_at: z.unknown()
})

export const questionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  recommended: z.boolean().optional(),
  is_recommended: z.boolean().optional()
})

export const questionItemSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  header: z.string().optional(),
  body: z.string().optional(),
  options: z.array(questionOptionSchema).min(2).max(4),
  multi_select: z.boolean().optional().default(false),
  allow_other: z.boolean().optional().default(false),
  other_label: z.string().optional(),
  other_description: z.string().optional()
})

export const questionRequestSchema = z.object({
  question_id: z.string().min(1),
  session_id: z.string().min(1),
  turn_id: z.number().int().nonnegative().optional(),
  tool_call_id: z.string().optional(),
  questions: z.array(questionItemSchema).min(1).max(4),
  created_at: z.unknown()
})

export const sessionSnapshotSchema = z.object({
  as_of_seq: z.number().int().nonnegative(),
  epoch: z.string().min(1),
  session: sessionSummarySchema,
  messages: z.object({
    items: z.array(sessionMessageSchema),
    has_more: z.boolean()
  }),
  in_flight_turn: inFlightTurnSchema.nullable(),
  subagents: z.array(z.lazy(() => snapshotSubagentSchema)).optional(),
  pending_approvals: z.array(approvalRequestSchema),
  pending_questions: z.array(questionRequestSchema)
})

export const snapshotSubagentSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  kind: z.enum(['subagent', 'bash', 'tool']),
  description: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  command: z.string().optional(),
  created_at: z.unknown(),
  started_at: z.unknown().optional(),
  completed_at: z.unknown().optional(),
  output_preview: z.string().optional(),
  output_bytes: z.number().int().nonnegative().optional(),
  subagent_phase: z.enum(['queued', 'working', 'suspended', 'completed', 'failed']).optional(),
  agent_id: z.string().optional(),
  subagent_type: z.string().optional(),
  parent_tool_call_id: z.string().optional(),
  suspended_reason: z.string().optional(),
  swarm_index: z.number().int().nonnegative().optional(),
  run_in_background: z.boolean().optional(),
  model: z.string().optional(),
  thinking_effort: z.string().optional()
})

export const transcriptMarkerSchema = z.object({
  kind: z.literal('marker'),
  markerId: z.string(),
  marker: z.string(),
  payload: z.unknown().optional(),
  at: z.string().optional()
})

export const transcriptItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turn') }).passthrough(),
  transcriptMarkerSchema,
  z.object({
    kind: z.literal('taskref'),
    refId: z.string(),
    taskId: z.string().min(1),
    at: z.string().optional()
  })
])

/**
 * 官方 web 端容错语义：`title` 缺失时回退 `content` 字段，
 * `completed`/`complete`/`finished` 等完成态写法归一为 `done`。
 */
export const sessionTodoItemSchema = z.preprocess(
  (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    const record: Record<string, unknown> = { ...(value as Record<string, unknown>) }
    if (typeof record.title !== 'string' && typeof record.content === 'string') {
      record.title = record.content
    }
    if (typeof record.status === 'string') {
      const status = record.status.toLowerCase()
      if (status === 'completed' || status === 'complete' || status === 'finished') {
        record.status = 'done'
      }
    }
    return record
  },
  z.object({
    title: z.string(),
    status: z.enum(['pending', 'in_progress', 'done'])
  })
)

export const sessionTodoSchema = z.object({
  todoId: z.string(),
  items: z.array(sessionTodoItemSchema),
  updatedAt: z.string().optional()
})

export const sideChatStartResultSchema = z.object({
  agent_id: z.string().min(1)
})

export const sessionTranscriptSchema = z.object({
  agent_id: z.string().min(1),
  // 逐条 safeParse：未知 kind / 字段漂移的条目被丢弃，不再拖垮整个数组
  items: z.array(z.unknown()).default([]).transform((items) =>
    items.flatMap((item) => {
      const parsed = transcriptItemSchema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  ),
  has_more: z.boolean().default(false),
  tasks: z.array(z.record(z.string(), z.unknown())).default([]),
  interactions: z.array(z.record(z.string(), z.unknown())).default([]),
  attachments: z.array(z.record(z.string(), z.unknown())).default([]),
  todos: z.array(sessionTodoSchema).default([]),
  meta: z.record(z.string(), z.unknown()).default({}),
  agents: z.array(z.record(z.string(), z.unknown())).default([]),
  // 服务端实际发送的是 interactionId 字符串数组；兼容对象形态以防旧版本漂移
  pending_interactions: z.array(z.union([z.string(), z.record(z.string(), z.unknown())])).default([])
})

export const promptSubmitResultSchema = z.object({
  prompt_id: z.string().min(1),
  user_message_id: z.string().min(1),
  status: z.enum(['running', 'queued', 'blocked']),
  content: z.array(messageContentPartSchema).min(1),
  created_at: z.unknown()
})

/**
 * `GET /sessions/{id}/transcript/plan`（0.37.2+）：Agent 的 ExitPlanMode 工具调用
 * 对应的计划内容、计划文件路径、可选操作与审批结果，按时间线顺序返回。
 * 形状按 contracts/kimi-0.37.2-openapi.json 快照建模。
 */
export const sessionPlanOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional()
})

export const sessionPlanReviewOutcomeSchema = z.object({
  state: z.enum(['pending', 'approved', 'rejected', 'cancelled']),
  selected_option: z.string().optional(),
  feedback: z.string().optional()
})

export const sessionPlanItemSchema = z.object({
  tool_call_id: z.string().min(1),
  turn_id: z.string().min(1),
  source: z.enum(['interaction', 'display', 'output']),
  plan: z.string(),
  path: z.string().optional(),
  options: z.array(sessionPlanOptionSchema).optional(),
  review: sessionPlanReviewOutcomeSchema.optional()
})

export const sessionPlanListSchema = z.object({
  agent_id: z.string().min(1),
  plans: z.array(sessionPlanItemSchema)
})

/** POST /sessions/{id}/prompts 请求体中随 prompt 一次激活的 skills（0.37.2+，可选）。 */
export const promptSkillSchema = z.object({
  name: z.string().min(1),
  args: z.string().optional()
})

export const sessionRuntimeStatusSchema = z.object({
  busy: z.boolean(),
  model: z.string().optional(),
  thinking_level: z.string(),
  permission: z.string(),
  plan_mode: z.boolean(),
  swarm_mode: z.boolean(),
  context_tokens: z.number().int().nonnegative(),
  // 0.38.0：max_context_tokens 与 context_usage 均不在 required 内；default(0) 让下游
  // （Main 的 runtime status 映射）保持 number 类型，服务端省略时按 0 处理。
  max_context_tokens: z.number().int().nonnegative().optional().default(0),
  context_usage: z.number().min(0).max(1).optional().default(0)
})

export const promptQueueSchema = z.object({
  active: promptSubmitResultSchema.nullable(),
  queued: z.array(promptSubmitResultSchema)
})

export const sessionGoalBudgetSchema = z.object({
  tokenBudget: z.number().nullable(),
  turnBudget: z.number().nullable(),
  wallClockBudgetMs: z.number().nullable(),
  remainingTokens: z.number().nullable(),
  remainingTurns: z.number().nullable(),
  remainingWallClockMs: z.number().nullable(),
  tokenBudgetReached: z.boolean(),
  turnBudgetReached: z.boolean(),
  wallClockBudgetReached: z.boolean(),
  overBudget: z.boolean()
})

export const sessionGoalSchema = z.object({
  goalId: z.string(),
  objective: z.string(),
  completionCriterion: z.string().optional(),
  status: z.enum(['active', 'paused', 'blocked', 'complete']),
  turnsUsed: z.number(),
  tokensUsed: z.number(),
  wallClockMs: z.number(),
  budget: sessionGoalBudgetSchema,
  terminalReason: z.string().optional()
})

export const sessionWarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(['info', 'warning', 'error'])
})
export const sessionWarningListSchema = z.object({ warnings: z.array(sessionWarningSchema) })

export const backgroundTaskSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  kind: z.enum(['subagent', 'bash', 'tool']),
  description: z.string(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']),
  command: z.string().optional(),
  created_at: z.unknown(),
  started_at: z.unknown().optional(),
  completed_at: z.unknown().optional(),
  output_preview: z.string().optional(),
  output_bytes: z.number().int().nonnegative().optional(),
  // 0.37.2+：任务归属的 agent/子代理信息
  agent_id: z.string().optional(),
  subagent_type: z.string().optional(),
  parent_tool_call_id: z.string().optional()
})

export const backgroundTaskListSchema = z.object({ items: z.array(backgroundTaskSchema) })
export const backgroundTaskCancelResultSchema = z.object({ cancelled: z.literal(true) })

export const promptSteerResultSchema = z.object({
  steered: z.boolean(),
  prompt_ids: z.array(z.string().min(1)).min(1)
})

export const promptAbortResultSchema = z.object({
  aborted: z.boolean(),
  at_seq: z.number().int().nonnegative().optional()
})

export const sessionAbortResultSchema = z.object({
  aborted: z.boolean()
})

export const sessionArchiveResultSchema = z.object({ archived: z.literal(true) })

/** v2 批量 archive/restore 的逐项结果（0.37.2+）。 */
export const sessionBatchItemResultSchema = z.object({
  id: z.string().min(1),
  ok: z.boolean(),
  error: z.object({
    code: z.number().int(),
    message: z.string()
  }).optional()
})
export const sessionBatchActionResultSchema = z.object({
  results: z.array(sessionBatchItemResultSchema),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative()
})

export const interactionResolveResultSchema = z.object({
  resolved: z.literal(true),
  resolved_at: z.unknown()
})

export const questionDismissResultSchema = z.object({
  dismissed: z.boolean(),
  dismissed_at: z.unknown()
})

export const fileGitStatusSchema = z.enum([
  'clean',
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'ignored',
  'conflicted'
])

export const fileEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: z.enum(['file', 'directory', 'symlink']),
  size: z.number().int().nonnegative().optional(),
  modified_at: z.unknown(),
  etag: z.string().optional(),
  mime: z.string().optional(),
  language_id: z.string().optional(),
  is_binary: z.boolean().optional(),
  is_symlink_to: z.string().optional(),
  git_status: fileGitStatusSchema.optional(),
  child_count: z.number().int().nonnegative().optional()
})

export const fileListResultSchema = z.object({
  items: z.array(fileEntrySchema),
  children_by_path: z.record(z.string(), z.array(fileEntrySchema)).optional(),
  truncated: z.boolean()
})

export const fileReadResultSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(['utf-8', 'base64']),
  size: z.number().int().nonnegative(),
  truncated: z.boolean(),
  etag: z.string(),
  mime: z.string(),
  language_id: z.string().optional(),
  line_count: z.number().int().nonnegative().optional(),
  is_binary: z.boolean()
})

export const fileSearchItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  kind: z.enum(['file', 'directory', 'symlink']),
  score: z.number().min(0).max(1),
  match_positions: z.array(z.number().int().nonnegative())
})

export const fileSearchResultSchema = z.object({
  items: z.array(fileSearchItemSchema),
  truncated: z.boolean()
})

export const fileGrepMatchSchema = z.object({
  line: z.number().int().positive(),
  col: z.number().int().positive(),
  text: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string())
})

export const fileGrepResultSchema = z.object({
  files: z.array(z.object({
    path: z.string(),
    matches: z.array(fileGrepMatchSchema)
  })),
  files_scanned: z.number().int().nonnegative(),
  truncated: z.boolean(),
  elapsed_ms: z.number().int().nonnegative()
})

export const fileOpenResultSchema = z.object({ opened: z.literal(true) })
export const fileRevealResultSchema = z.object({ revealed: z.literal(true) })

export const gitPullRequestSchema = z.object({
  number: z.number().int().positive(),
  state: z.enum(['open', 'merged', 'closed', 'draft']),
  url: z.url()
})

export const gitStatusResultSchema = z.object({
  branch: z.string(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  entries: z.record(z.string(), fileGitStatusSchema),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  pullRequest: gitPullRequestSchema.nullable()
})

export const fileDiffResultSchema = z.object({
  path: z.string(),
  diff: z.string(),
  truncated: z.boolean()
})

export const terminalSchema = z.object({
  id: z.string().min(1),
  session_id: z.string().min(1),
  cwd: z.string().min(1),
  shell: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  status: z.enum(['running', 'exited']),
  created_at: z.unknown(),
  exited_at: z.unknown().optional(),
  exit_code: z.number().int().nullable().optional()
})

export const terminalListSchema = z.object({ items: z.array(terminalSchema) })
export const terminalCloseResultSchema = z.object({ closed: z.literal(true) })

export const authSummarySchema = z.object({
  ready: z.boolean(),
  providers_count: z.number().int().nonnegative(),
  default_model: z.string().nullable(),
  managed_provider: z.object({
    name: z.string().min(1),
    status: z.enum(['authenticated', 'expired', 'revoked', 'unauthenticated'])
  }).nullable()
})

export const modelCatalogItemSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  display_name: z.string().min(1).optional(),
  max_context_size: z.number().int().positive(),
  capabilities: z.array(z.string()).optional(),
  support_efforts: z.array(z.string()).optional(),
  default_effort: z.string().optional()
})

export const modelCatalogListSchema = z.object({ items: z.array(modelCatalogItemSchema) })

export const providerCatalogItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  base_url: z.string().min(1).optional(),
  default_model: z.string().min(1).optional(),
  has_api_key: z.boolean(),
  status: z.enum(['connected', 'error', 'unconfigured']),
  models: z.array(z.string().min(1)).optional()
})

export const providerCatalogListSchema = z.object({ items: z.array(providerCatalogItemSchema) })

/** Response returned by the provider replace route in Kimi 0.29.2+. */
export const providerMutationResultSchema = z.object({ provider: providerCatalogItemSchema })

export const providerDirectoryModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  max_context_size: z.number().int().positive(),
  capabilities: z.array(z.string()).optional(),
  reasoning: z.boolean()
})

export const providerDirectoryItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  wire_type: z.enum(['kimi', 'openai', 'openai_responses', 'anthropic', 'google-genai', 'vertexai']).nullable(),
  guessed: z.boolean(),
  needs_base_url: z.boolean(),
  rejected: z.boolean(),
  reject_reason: z.string().nullable(),
  env_key: z.string().nullable(),
  models: z.array(providerDirectoryModelSchema)
})

export const providerDirectoryListSchema = z.object({ items: z.array(providerDirectoryItemSchema) })

export const setDefaultModelResultSchema = z.object({
  default_model: z.string().min(1),
  model: modelCatalogItemSchema
})

export const providerRefreshResultSchema = z.object({
  changed: z.array(z.object({
    provider_id: z.string().min(1),
    provider_name: z.string().min(1),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative()
  })),
  unchanged: z.array(z.string().min(1)),
  failed: z.array(z.object({
    provider: z.string().min(1),
    reason: z.string().min(1)
  }))
})

export const configProviderSummarySchema = z.object({
  type: z.string(),
  base_url: z.string().optional(),
  default_model: z.string().optional(),
  has_api_key: z.boolean()
})

export const secondaryModelConfigSchema = z.object({
  model: z.string().min(1).optional(),
  defaultEffort: z.string().min(1).optional(),
  maxContextSize: z.number().int().positive().optional(),
  maxInputSize: z.number().int().positive().optional(),
  maxOutputSize: z.number().int().positive().optional(),
  capabilities: z.array(z.string()).optional(),
  displayName: z.string().min(1).optional(),
  reasoningKey: z.string().min(1).optional(),
  adaptiveThinking: z.boolean().optional(),
  supportEfforts: z.array(z.string()).optional(),
  default_effort: z.string().min(1).optional(),
  max_context_size: z.number().int().positive().optional(),
  max_input_size: z.number().int().positive().optional(),
  max_output_size: z.number().int().positive().optional(),
  support_efforts: z.array(z.string()).optional()
}).passthrough()

export const kimiConfigSnapshotSchema = z.object({
  providers: z.record(z.string(), configProviderSummarySchema),
  default_provider: z.string().optional(),
  default_model: z.string().optional(),
  models: z.record(z.string(), z.unknown()).optional(),
  thinking: z.unknown().optional(),
  plan_mode: z.boolean().optional(),
  yolo: z.boolean().optional(),
  default_permission_mode: z.string().optional(),
  default_plan_mode: z.boolean().optional(),
  permission: z.unknown().optional(),
  hooks: z.array(z.unknown()).optional(),
  services: z.unknown().optional(),
  merge_all_available_skills: z.boolean().optional(),
  extra_skill_dirs: z.array(z.string()).optional(),
  loop_control: z.unknown().optional(),
  background: z.unknown().optional(),
  secondary_model: secondaryModelConfigSchema.optional(),
  experimental: z.record(z.string(), z.boolean()).optional(),
  telemetry: z.boolean().optional(),
  raw: z.record(z.string(), z.unknown()).optional()
})

export const oauthFlowStatusSchema = z.enum([
  'pending',
  'authenticated',
  'denied',
  'expired',
  'cancelled'
])

export const oauthFlowStartSchema = z.union([
  z.object({
    flow_id: z.string().min(1),
    provider: z.string().min(1),
    status: z.literal('pending'),
    verification_uri: z.url(),
    verification_uri_complete: z.url(),
    user_code: z.string().min(1),
    expires_in: z.number().int().positive(),
    interval: z.number().int().positive(),
    expires_at: z.unknown()
  }),
  z.object({
    flow_id: z.string().min(1),
    provider: z.string().min(1),
    status: z.literal('authenticated')
  })
])

export const oauthFlowSnapshotSchema = z.object({
  flow_id: z.string().min(1),
  provider: z.string().min(1),
  status: oauthFlowStatusSchema,
  verification_uri: z.url(),
  verification_uri_complete: z.url(),
  user_code: z.string().min(1),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
  expires_at: z.unknown(),
  resolved_at: z.unknown().optional(),
  error_message: z.string().optional()
})

export const oauthLoginCancelResultSchema = z.object({
  cancelled: z.boolean(),
  status: oauthFlowStatusSchema
})

export const oauthLogoutResultSchema = z.object({
  logged_out: z.literal(true),
  provider: z.string().min(1)
})

/** 0.38.0：`GET /api/v1/oauth/region` 的登录区域（必填）。 */
export const oauthRegionResultSchema = z.object({
  region: z.enum(['mainland-cn', 'global'])
})

export const managedUsageWindowSchema = z.object({
  // Kimi <= 0.29 exposes the presentation-ready label/reset_hint pair.
  label: z.string().min(1).optional(),
  reset_hint: z.string().optional(),
  // Kimi >= 0.30 exposes the semantic name/window/reset_at fields instead.
  name: z.string().min(1).optional(),
  window: z.object({
    duration: z.number().int(),
    unit: z.enum(['minute', 'hour', 'day', 'week'])
  }).optional(),
  used: z.number().int(),
  limit: z.number().int(),
  reset_at: z.string().optional()
})

export const managedExtraUsageSchema = z.object({
  balance_cents: z.number().int(),
  total_cents: z.number().int(),
  monthly_charge_limit_enabled: z.boolean(),
  monthly_charge_limit_cents: z.number().int(),
  monthly_used_cents: z.number().int(),
  currency: z.string().min(1)
})

export const managedUsageResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ok'),
    summary: managedUsageWindowSchema.nullable(),
    limits: z.array(managedUsageWindowSchema),
    extra_usage: managedExtraUsageSchema.nullable()
  }),
  z.object({
    kind: z.literal('error'),
    message: z.string().min(1),
    status: z.number().int().optional()
  })
])

export const skillSourceSchema = z.enum(['project', 'user', 'extra', 'builtin'])
export const skillDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  path: z.string(),
  source: skillSourceSchema,
  type: z.string().optional(),
  disable_model_invocation: z.boolean().optional()
})
export const skillListSchema = z.object({ skills: z.array(skillDescriptorSchema) })
export const skillActivationResultSchema = z.object({
  activated: z.literal(true),
  skill_name: z.string().min(1)
})

export const toolSourceSchema = z.enum(['builtin', 'skill', 'mcp'])
export const toolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  input_schema: z.unknown(),
  source: toolSourceSchema,
  mcp_server_id: z.string().min(1).optional(),
  active: z.boolean().optional()
})
export const toolListSchema = z.object({ tools: z.array(toolDescriptorSchema) })

export const mcpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.enum(['stdio', 'http', 'sse']),
  status: z.enum(['connected', 'connecting', 'disconnected', 'error']),
  last_error: z.string().optional(),
  tool_count: z.number().int().nonnegative()
})
export const mcpServerListSchema = z.object({ servers: z.array(mcpServerSchema) })
export const mcpServerRestartResultSchema = z.object({ restarting: z.literal(true) })

/**
 * Kimi 会话事件 payload 模型（0.37.2 基线，0.38.0 增补）。
 *
 * 事件帧的 envelope（type/seq/epoch/.../payload）由 wire/ws.ts 的
 * `sessionEventFrameSchema` 约束；这里只固定新增/演进的事件 payload 形状，
 * 供投影器与契约测试按快照核对（字段按 contracts/kimi-0.38.0-asyncapi.json）。
 *
 * 0.38.0 起约 30 个事件变体新增 required `agentId`；本套 schema 保持宽松
 * （0.37 响应同样可解析），因此都建模为 `agentId: z.string().optional()`，
 * 由投影层按需透传。
 */

/** turn.started origin.user.skillActivations 条目。activationId/skillName 必填。 */
export const skillActivationInfoSchema = z.object({
  activationId: z.string().min(1),
  skillName: z.string().min(1),
  skillArgs: z.string().optional(),
  skillType: z.string().optional(),
  skillPath: z.string().optional(),
  skillSource: skillSourceSchema.optional()
})

/** turn.started origin 的 user 分支（携带本轮的 skillActivations）。 */
export const originUserSchema = z.object({
  kind: z.literal('user'),
  skillActivations: z.array(skillActivationInfoSchema).default([])
}).passthrough()

/** turn.started（0.37.2 起可携带 promptId；0.38.0 起携带 promptAttachments，agentId 必填）。origin 为多分支 oneOf，保持不透明。 */
export const promptAttachmentSchema = z.object({
  kind: z.enum(['image', 'video', 'audio']),
  fileId: z.string().min(1)
})

export const turnStartedEventSchema = z.object({
  type: z.literal('turn.started'),
  agentId: z.string().optional(),
  turnId: z.number().int().nonnegative().optional(),
  origin: z.unknown().optional(),
  prompt: z.unknown().optional(),
  promptId: z.string().optional(),
  promptAttachments: z.array(promptAttachmentSchema).optional()
}).passthrough()

/** turn.ended（0.37.2 起携带 time；0.38.0 起 agentId 必填）。 */
export const turnEndedEventSchema = z.object({
  type: z.literal('turn.ended'),
  agentId: z.string().optional(),
  time: z.string().optional(),
  turnId: z.number().int().nonnegative().optional(),
  reason: z.enum(['completed', 'failed', 'cancelled', 'blocked']).optional(),
  error: z.unknown().optional(),
  durationMs: z.number().optional(),
  interruptReason: z.string().optional()
}).passthrough()

/** 0.37.2：插件列表变更（全局配置事件，不携带配置数据）。 */
export const pluginChangedEventSchema = z.object({
  type: z.literal('event.plugin.changed')
}).passthrough()

/** 0.37.2：内置能力安装状态变更。 */
export const capabilityChangedEventSchema = z.object({
  type: z.literal('event.capability.changed'),
  capability_id: z.string().min(1),
  install: z.object({
    running: z.boolean(),
    step: z.string().optional(),
    percent: z.number().optional(),
    error: z.string().optional(),
    note: z.string().optional()
  })
}).passthrough()

/**
 * 0.38.0：会话被归档（别的客户端/CLI 归档了会话）。
 * 快照 required 为 `type` + `workspace_id`；实测服务端还会带 `agentId`，
 * 建模为可选以兼容两种形态。会话 id 不在 payload 里，走帧 envelope 的
 * `session_id`（ADR-0017：结构性 event.session.* 保留真实会话 id）。
 */
export const sessionArchivedEventSchema = z.object({
  type: z.literal('event.session.archived'),
  workspace_id: z.string().min(1),
  agentId: z.string().optional()
}).passthrough()

/** tool.progress / shell.output 的 update 对象（0.38.0 起含可选 replace）。 */
export const progressUpdateSchema = z.object({
  kind: z.enum(['stdout', 'stderr', 'progress', 'status', 'custom']),
  text: z.string().optional(),
  percent: z.number().optional(),
  customKind: z.string().optional(),
  customData: z.unknown().optional(),
  replace: z.boolean().optional()
})

/** 0.38.0：`tool.progress` 会话事件（agentId 必填；update 为可选，0.37 无此帧）。 */
export const toolProgressEventSchema = z.object({
  type: z.literal('tool.progress'),
  agentId: z.string().optional(),
  turnId: z.number().optional(),
  toolCallId: z.string().optional(),
  update: progressUpdateSchema.optional()
}).passthrough()

/** 0.38.0：`shell.output` 会话事件（agentId 必填；update 含 replace）。 */
export const shellOutputEventSchema = z.object({
  type: z.literal('shell.output'),
  agentId: z.string().optional(),
  commandId: z.string().optional(),
  update: progressUpdateSchema.optional()
}).passthrough()

/**
 * session_event 中 error 变体的错误码枚举（Kimi 0.37.2，114 项）。
 * 0.37.2 起新增 `prompt.id_conflict`。与 REST 层的数字 code（KimiApiError.code）
 * 是两套坐标，这里按异步契约快照 pin 住字符串语义码。
 */
export const kimiSessionErrorCodes = [
  'config.invalid',
  'session.not_found',
  'session.already_exists',
  'session.id_invalid',
  'session.id_required',
  'session.id_empty',
  'session.title_empty',
  'session.state_not_found',
  'session.state_invalid',
  'session.fork_active_turn',
  'session.undo_unavailable',
  'session.export_not_found',
  'session.export_missing_version',
  'session.export_output_conflict',
  'session.export_too_large',
  'session.closed',
  'session.permission_mode_invalid',
  'session.thinking_empty',
  'session.model_empty',
  'session.plan_mode_invalid',
  'session.approval_handler_error',
  'session.question_handler_error',
  'session.init_failed',
  'agent.not_found',
  'agent.already_exists',
  'agent.already_running',
  'agent.not_a_subagent',
  'agent.not_owned',
  'agent.type_not_allowed',
  'agent.max_tokens_exceeded',
  'activity.agent_busy',
  'activity.cancelling',
  'activity.disposing',
  'activity.disposed',
  'activity.initializing',
  'activity.session_rejected',
  'turn.agent_busy',
  'goal.already_exists',
  'goal.not_found',
  'goal.objective_empty',
  'goal.objective_too_long',
  'goal.status_invalid',
  'goal.metadata_reserved',
  'goal.not_resumable',
  'goal.unsupported_agent',
  'model.not_configured',
  'model.config_invalid',
  'profile.thinking_alias_conflict',
  'model.not_found',
  'auth.login_required',
  'auth.provisioning_required',
  'auth.token_missing',
  'auth.token_unauthorized',
  'auth.model_not_resolved',
  'context.overflow',
  'loop.max_steps_exceeded',
  'provider.api_error',
  'provider.filtered',
  'provider.rate_limit',
  'provider.auth_error',
  'provider.connection_error',
  'provider.overloaded',
  'provider.not_found',
  'skill.not_found',
  'skill.type_unsupported',
  'skill.name_empty',
  'skill.parse_failed',
  'skill.nested_too_deep',
  'records.write_failed',
  'compaction.failed',
  'compaction.unable',
  'task.task_id_empty',
  'task.limit_exceeded',
  'usage.turn_id_conflict',
  'mcp.server_not_found',
  'mcp.server_disabled',
  'mcp.startup_failed',
  'mcp.tool_name_collision',
  'mcp.oauth_failed',
  'message.not_found',
  'plugin.not_found',
  'plugin.load_failed',
  'request.invalid',
  'request.work_dir_required',
  'request.prompt_input_empty',
  'prompt.id_conflict',
  'prompt.not_found',
  'prompt.already_completed',
  'session.busy',
  'shell.git_bash_not_found',
  'workspace.not_found',
  'terminal.not_found',
  'file.not_found',
  'file.too_large',
  'fs.path_not_found',
  'fs.permission_denied',
  'fs.path_escapes',
  'fs.is_directory',
  'fs.is_binary',
  'fs.too_large',
  'fs.already_exists',
  'fs.too_many_results',
  'fs.grep_timeout',
  'fs.git_unavailable',
  'wire.migration_missing',
  'storage.permission_denied',
  'storage.disk_full',
  'cron.expression_invalid',
  'web.invalid_url',
  'web.private_address',
  'web.fetch_failed',
  'validation.failed',
  'not_implemented',
  'internal'
] as const

export type KimiSessionErrorCode = (typeof kimiSessionErrorCodes)[number]
export const kimiSessionErrorCodeSchema = z.enum(kimiSessionErrorCodes)

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>
export type WorkspaceDeleteResult = z.infer<typeof workspaceDeleteResultSchema>
export type UploadedFile = z.infer<typeof uploadedFileSchema>
export type UploadedFileDeleteResult = z.infer<typeof uploadedFileDeleteResultSchema>
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type SessionSummaryV2 = z.infer<typeof sessionSummaryV2Schema>
export type SessionActivityStatus = SessionSummaryV2['activity']['status']
export type MessageContentPart = z.infer<typeof messageContentPartSchema>
export type SessionMessage = z.infer<typeof sessionMessageSchema>
export type InFlightTool = z.infer<typeof inFlightToolSchema>
export type InFlightTurn = z.infer<typeof inFlightTurnSchema>
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>
export type SnapshotSubagent = z.infer<typeof snapshotSubagentSchema>
export type TranscriptItem = z.infer<typeof transcriptItemSchema>
export type TranscriptMarker = z.infer<typeof transcriptMarkerSchema>
export type SessionTranscript = z.infer<typeof sessionTranscriptSchema>
export type SessionPlanOption = z.infer<typeof sessionPlanOptionSchema>
export type SessionPlanReviewOutcome = z.infer<typeof sessionPlanReviewOutcomeSchema>
export type SessionPlanItem = z.infer<typeof sessionPlanItemSchema>
export type SessionPlanList = z.infer<typeof sessionPlanListSchema>
export type PromptSubmitResult = z.infer<typeof promptSubmitResultSchema>
export type PromptSteerResult = z.infer<typeof promptSteerResultSchema>
export type PromptAbortResult = z.infer<typeof promptAbortResultSchema>
export type SessionAbortResult = z.infer<typeof sessionAbortResultSchema>
export type SessionArchiveResult = z.infer<typeof sessionArchiveResultSchema>
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>
export type QuestionOption = z.infer<typeof questionOptionSchema>
export type QuestionItem = z.infer<typeof questionItemSchema>
export type QuestionRequest = z.infer<typeof questionRequestSchema>
export type InteractionResolveResult = z.infer<typeof interactionResolveResultSchema>
export type QuestionDismissResult = z.infer<typeof questionDismissResultSchema>
export type FileGitStatus = z.infer<typeof fileGitStatusSchema>
export type FileEntry = z.infer<typeof fileEntrySchema>
export type FileListResult = z.infer<typeof fileListResultSchema>
export type FileReadResult = z.infer<typeof fileReadResultSchema>
export type SessionTodo = z.infer<typeof sessionTodoSchema>
export type SideChatStartResult = z.infer<typeof sideChatStartResultSchema>
export type FileSearchResult = z.infer<typeof fileSearchResultSchema>
export type FileGrepResult = z.infer<typeof fileGrepResultSchema>
export type FileOpenResult = z.infer<typeof fileOpenResultSchema>
export type FileRevealResult = z.infer<typeof fileRevealResultSchema>
export type GitStatusResult = z.infer<typeof gitStatusResultSchema>
export type FileDiffResult = z.infer<typeof fileDiffResultSchema>
export type Terminal = z.infer<typeof terminalSchema>
export type TerminalCloseResult = z.infer<typeof terminalCloseResultSchema>
export type AuthSummary = z.infer<typeof authSummarySchema>
export type ModelCatalogItem = z.infer<typeof modelCatalogItemSchema>
export type ProviderCatalogItem = z.infer<typeof providerCatalogItemSchema>
export type ProviderMutationResult = z.infer<typeof providerMutationResultSchema>
export type ProviderDirectoryItem = z.infer<typeof providerDirectoryItemSchema>
export type ProviderDirectoryModel = z.infer<typeof providerDirectoryModelSchema>
export type SetDefaultModelResult = z.infer<typeof setDefaultModelResultSchema>
export type ProviderRefreshResult = z.infer<typeof providerRefreshResultSchema>
export type KimiConfigSnapshot = z.infer<typeof kimiConfigSnapshotSchema>
export type OAuthFlowStatus = z.infer<typeof oauthFlowStatusSchema>
export type SessionRuntimeStatus = z.infer<typeof sessionRuntimeStatusSchema>
export type PromptQueue = z.infer<typeof promptQueueSchema>
export type SessionGoal = z.infer<typeof sessionGoalSchema>
export type SessionWarning = z.infer<typeof sessionWarningSchema>
export type BackgroundTask = z.infer<typeof backgroundTaskSchema>
export type BackgroundTaskCancelResult = z.infer<typeof backgroundTaskCancelResultSchema>
export type OAuthFlowStart = z.infer<typeof oauthFlowStartSchema>
export type OAuthFlowSnapshot = z.infer<typeof oauthFlowSnapshotSchema>
export type OAuthLoginCancelResult = z.infer<typeof oauthLoginCancelResultSchema>
export type OAuthLogoutResult = z.infer<typeof oauthLogoutResultSchema>
export type ManagedUsageWindow = z.infer<typeof managedUsageWindowSchema>
export type ManagedExtraUsage = z.infer<typeof managedExtraUsageSchema>
export type ManagedUsageResult = z.infer<typeof managedUsageResultSchema>
export type SkillDescriptor = z.infer<typeof skillDescriptorSchema>
export type SkillActivationResult = z.infer<typeof skillActivationResultSchema>
export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>
export type McpServer = z.infer<typeof mcpServerSchema>
export type McpServerRestartResult = z.infer<typeof mcpServerRestartResultSchema>
export type PromptSkill = z.infer<typeof promptSkillSchema>
export type SkillActivationInfo = z.infer<typeof skillActivationInfoSchema>
export type OriginUser = z.infer<typeof originUserSchema>
export type PromptAttachment = z.infer<typeof promptAttachmentSchema>
export type TurnStartedEvent = z.infer<typeof turnStartedEventSchema>
export type TurnEndedEvent = z.infer<typeof turnEndedEventSchema>
export type PluginChangedEvent = z.infer<typeof pluginChangedEventSchema>
export type CapabilityChangedEvent = z.infer<typeof capabilityChangedEventSchema>
export type SessionArchivedEvent = z.infer<typeof sessionArchivedEventSchema>
export type ProgressUpdate = z.infer<typeof progressUpdateSchema>
export type ToolProgressEvent = z.infer<typeof toolProgressEventSchema>
export type ShellOutputEvent = z.infer<typeof shellOutputEventSchema>
export type SessionSummaryV2Lite = z.infer<typeof sessionSummaryV2LiteSchema>
export type SessionBatchItemResult = z.infer<typeof sessionBatchItemResultSchema>
export type SessionBatchActionResult = z.infer<typeof sessionBatchActionResultSchema>
export type SessionV2WorkspaceRef = z.infer<typeof sessionV2WorkspaceRefSchema>
export type SessionV2Group = z.infer<typeof sessionV2GroupSchema>
export type SessionListV2ByWorkspace = z.infer<typeof sessionListV2ByWorkspaceSchema>
export type SessionListV2Page = z.infer<typeof sessionListV2PageSchema>
export type OAuthRegionResult = z.infer<typeof oauthRegionResultSchema>
export type OAuthRegion = OAuthRegionResult['region']
