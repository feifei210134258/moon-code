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
    context_limit: z.number().int().nonnegative(),
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

export const sessionListV2Schema = z.object({
  items: z.array(sessionSummaryV2Schema),
  has_more: z.boolean(),
  next_page_token: z.string().nullable()
})

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

export const sessionRuntimeStatusSchema = z.object({
  busy: z.boolean(),
  model: z.string().optional(),
  thinking_level: z.string(),
  permission: z.string(),
  plan_mode: z.boolean(),
  swarm_mode: z.boolean(),
  context_tokens: z.number().int().nonnegative(),
  max_context_tokens: z.number().int().nonnegative(),
  context_usage: z.number().min(0).max(1)
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
  output_bytes: z.number().int().nonnegative().optional()
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
