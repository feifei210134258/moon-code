import { describe, expect, it } from 'vitest'
import {
  backgroundTaskSchema,
  capabilityChangedEventSchema,
  kimiSessionErrorCodeSchema,
  oauthRegionResultSchema,
  originUserSchema,
  pluginChangedEventSchema,
  promptSkillSchema,
  sessionArchivedEventSchema,
  sessionBatchActionResultSchema,
  sessionListV2PageSchema,
  sessionListV2Schema,
  sessionPlanListSchema,
  sessionRuntimeStatusSchema,
  sessionSummarySchema,
  shellOutputEventSchema,
  snapshotSubagentSchema,
  toolProgressEventSchema,
  turnEndedEventSchema,
  turnStartedEventSchema
} from '../../packages/kimi-adapter/src/wire/schemas.js'

describe('Kimi 0.37.2 wire schemas', () => {
  it('accepts prompt skills with a required name and optional args', () => {
    expect(promptSkillSchema.parse({ name: 'commit' })).toEqual({ name: 'commit' })
    expect(promptSkillSchema.parse({ name: 'pdf', args: '--page 2' })).toEqual({
      name: 'pdf', args: '--page 2'
    })
    expect(promptSkillSchema.safeParse({ args: 'only' }).success).toBe(false)
  })

  it('parses the turn.started origin.user skillActivations branch', () => {
    const parsed = originUserSchema.parse({
      kind: 'user',
      skillActivations: [{
        activationId: 'act-1', skillName: 'commit', skillArgs: '-m "x"',
        skillType: 'builtin', skillPath: '/skills', skillSource: 'project'
      }]
    })
    expect(parsed.skillActivations).toHaveLength(1)
    expect(parsed.skillActivations[0]).toEqual({
      activationId: 'act-1', skillName: 'commit', skillArgs: '-m "x"',
      skillType: 'builtin', skillPath: '/skills', skillSource: 'project'
    })
  })

  it('keeps non-user turn origins as opaque but still parseable in turn.started', () => {
    const parsed = turnStartedEventSchema.parse({
      type: 'turn.started',
      turnId: 3,
      origin: { kind: 'skill_activation', activationId: 'act-9', skillName: 'pdf', trigger: 'user-slash' }
    })
    expect(parsed.type).toBe('turn.started')
  })

  it('models turn.started.promptId and turn.ended.time as optional (0.37.2)', () => {
    expect(turnStartedEventSchema.parse({
      type: 'turn.started', turnId: 1, promptId: 'prompt-7'
    }).promptId).toBe('prompt-7')
    const ended = turnEndedEventSchema.parse({
      type: 'turn.ended', turnId: 1, reason: 'completed', time: '2026-07-23T00:05:00.000Z'
    })
    expect(ended.time).toBe('2026-07-23T00:05:00.000Z')
    expect(turnEndedEventSchema.parse({ type: 'turn.ended', turnId: 1, reason: 'completed' }).time).toBeUndefined()
  })

  it('recognizes the two new session_event variants', () => {
    expect(pluginChangedEventSchema.parse({ type: 'event.plugin.changed' }).type)
      .toBe('event.plugin.changed')
    const capability = capabilityChangedEventSchema.parse({
      type: 'event.capability.changed',
      capability_id: 'terminal',
      install: { running: true, step: 'installing', percent: 0.5, note: 'x' }
    })
    expect(capability.install.running).toBe(true)
    expect(capabilityChangedEventSchema.safeParse({
      type: 'event.capability.changed', capability_id: 'terminal'
    }).success).toBe(false)
  })

  it('pins the session error-code enum including the new prompt.id_conflict', () => {
    expect(kimiSessionErrorCodeSchema.enum).toHaveProperty('prompt.id_conflict')
    expect(kimiSessionErrorCodeSchema.parse('prompt.id_conflict')).toBe('prompt.id_conflict')
    expect(kimiSessionErrorCodeSchema.safeParse('not.a.code').success).toBe(false)
  })

  it('accepts the task object agent fields added in 0.37.2', () => {
    const parsed = backgroundTaskSchema.parse({
      id: 'task-1', session_id: 'session-1', kind: 'subagent', description: 'Explore',
      status: 'running', created_at: '2026-07-23T00:00:00.000Z',
      agent_id: 'agent-1', subagent_type: 'explore', parent_tool_call_id: 'tool-1'
    })
    expect(parsed).toEqual(expect.objectContaining({
      agent_id: 'agent-1', subagent_type: 'explore', parent_tool_call_id: 'tool-1'
    }))
  })

  it('accepts the snapshot subagent agent_id added in 0.37.2', () => {
    const parsed = snapshotSubagentSchema.safeParse({
      id: 'task-9', session_id: 'session-1', kind: 'subagent', description: 'Review',
      status: 'completed', created_at: '2026-07-23T00:00:00.000Z',
      agent_id: 'agent-9', subagent_type: 'verify', parent_tool_call_id: 'tool-9'
    })
    expect(parsed.success).toBe(true)
  })

  it('requires total on the v2 session list and accepts the lite id/archived projection', () => {
    const full = sessionListV2Schema.parse({
      items: [{
        id: 'session-1',
        workspace: { id: 'workspace-1', cwd: '/tmp' },
        meta: { title: 'T', last_prompt: null, created_at: 1, updated_at: 2, archived: false, archived_at: null },
        activity: { status: 'idle' }
      }],
      total: 1,
      has_more: false,
      next_page_token: null
    })
    expect(full.total).toBe(1)

    expect(sessionListV2Schema.safeParse({
      items: [], has_more: false, next_page_token: null
    }).success).toBe(false)

    const lite = sessionListV2Schema.parse({
      items: [{ id: 'session-2', archived: true }],
      total: 43,
      has_more: false,
      next_page_token: null
    })
    expect(lite.items[0]).toEqual({ id: 'session-2', archived: true })
  })

  it('parses the batch archive/restore per-item result', () => {
    const result = sessionBatchActionResultSchema.parse({
      results: [
        { id: 'session-1', ok: true },
        { id: 'session-2', ok: false, error: { code: 40401, message: 'not found' } }
      ],
      succeeded: 1,
      failed: 1
    })
    expect(result.results[1]?.error?.code).toBe(40401)
  })

  it('parses the transcript plan list envelope (0.37.2)', () => {
    const parsed = sessionPlanListSchema.parse({
      agent_id: 'main',
      plans: [{
        tool_call_id: 'plan-tool-1',
        turn_id: 'turn-7',
        source: 'interaction',
        plan: '1. 先读 README\n2. 改 App.vue',
        path: 'docs/plan.md',
        options: [{ label: '批准计划', description: '直接开始执行' }],
        review: { state: 'rejected', selected_option: '批准计划', feedback: '第三点补充测试命令' }
      }, {
        tool_call_id: 'plan-tool-2',
        turn_id: 'turn-8',
        source: 'display',
        plan: '只读计划'
      }]
    })
    expect(parsed.plans).toHaveLength(2)
    expect(parsed.plans[0]?.review).toEqual({
      state: 'rejected', selected_option: '批准计划', feedback: '第三点补充测试命令'
    })
    expect(parsed.plans[0]?.options).toEqual([{ label: '批准计划', description: '直接开始执行' }])
    expect(parsed.plans[1]).toEqual({
      tool_call_id: 'plan-tool-2', turn_id: 'turn-8', source: 'display', plan: '只读计划'
    })
    // tool_call_id 必填；缺 review/options/path 允许
    expect(sessionPlanListSchema.safeParse({
      agent_id: 'main', plans: [{ turn_id: 'turn-8', source: 'display', plan: 'x' }]
    }).success).toBe(false)
    // source 必须是官方三态
    expect(sessionPlanListSchema.safeParse({
      agent_id: 'main', plans: [{ tool_call_id: 't', turn_id: 'tr', source: 'other', plan: 'x' }]
    }).success).toBe(false)
  })
})

describe('Kimi 0.38.0 wire schemas', () => {
  const summary = {
    id: 'session-1',
    workspace_id: 'workspace-1',
    title: 'Session',
    created_at: '',
    updated_at: '',
    busy: false,
    metadata: { cwd: '/tmp' },
    agent_config: { model: 'kimi-code' },
    usage: { input_tokens: 1, output_tokens: 2, context_tokens: 3 },
    permission_rules: [],
    message_count: 0,
    last_seq: 0
  }

  it('accepts usage without the now-optional context_limit/total_cost_usd/turn_count', () => {
    const parsed = sessionSummarySchema.parse(summary)
    expect(parsed.usage.context_limit).toBeUndefined()
    expect(parsed.usage.total_cost_usd).toBeUndefined()
    expect(parsed.usage.turn_count).toBeUndefined()
    /* 旧版必填形态仍可解析 */
    expect(sessionSummarySchema.parse({
      ...summary,
      usage: {
        input_tokens: 1, output_tokens: 2, cache_read_tokens: 0, cache_creation_tokens: 0,
        total_cost_usd: 0.02, context_tokens: 3, context_limit: 100, turn_count: 2
      }
    }).usage.context_limit).toBe(100)
  })

  it('accepts runtime status without context_usage and defaults it to 0', () => {
    const parsed = sessionRuntimeStatusSchema.parse({
      busy: false, thinking_level: 'high', permission: 'manual', plan_mode: false,
      swarm_mode: false, context_tokens: 10, max_context_tokens: 100
    })
    expect(parsed.context_usage).toBe(0)
    expect(sessionRuntimeStatusSchema.parse({
      busy: false, thinking_level: 'high', permission: 'manual', plan_mode: false,
      swarm_mode: false, context_tokens: 10, max_context_tokens: 100, context_usage: 0.42
    }).context_usage).toBe(0.42)
  })

  it('parses the event.session.archived payload with a required workspace_id', () => {
    expect(sessionArchivedEventSchema.parse({
      type: 'event.session.archived', workspace_id: 'workspace-1'
    })).toEqual({ type: 'event.session.archived', workspace_id: 'workspace-1' })
    /* 实测服务端还会携带 agentId；建模为可选兼容两者 */
    expect(sessionArchivedEventSchema.parse({
      type: 'event.session.archived', workspace_id: 'workspace-1', agentId: 'main'
    }).agentId).toBe('main')
    expect(sessionArchivedEventSchema.safeParse({ type: 'event.session.archived' }).success).toBe(false)
  })

  it('accepts turn.started agentId and promptAttachments while staying 0.37-compatible', () => {
    const parsed = turnStartedEventSchema.parse({
      type: 'turn.started',
      agentId: 'main',
      turnId: 1,
      origin: { kind: 'user' },
      promptAttachments: [
        { kind: 'image', fileId: 'file-1' },
        { kind: 'video', fileId: 'file-2' },
        { kind: 'audio', fileId: 'file-3' }
      ]
    })
    expect(parsed.agentId).toBe('main')
    expect(parsed.promptAttachments).toHaveLength(3)
    expect(parsed.promptAttachments?.[0]).toEqual({ kind: 'image', fileId: 'file-1' })
    /* kind 枚举限定 image/video/audio */
    expect(turnStartedEventSchema.safeParse({
      type: 'turn.started', turnId: 1, promptAttachments: [{ kind: 'document', fileId: 'x' }]
    }).success).toBe(false)
    /* 0.37 响应缺 agentId/promptAttachments 仍可解析 */
    expect(turnStartedEventSchema.parse({ type: 'turn.started', turnId: 1 }).promptAttachments).toBeUndefined()
    expect(turnEndedEventSchema.parse({
      type: 'turn.ended', agentId: 'main', turnId: 1, reason: 'completed'
    }).agentId).toBe('main')
  })

  it('parses the tool.progress/shell.output update with optional replace (0.38.0)', () => {
    const progress = toolProgressEventSchema.parse({
      type: 'tool.progress',
      agentId: 'main',
      turnId: 2,
      toolCallId: 'tool-1',
      update: { kind: 'stdout', text: 'line', replace: true }
    })
    expect(progress.update).toEqual({ kind: 'stdout', text: 'line', replace: true })
    expect(progress.agentId).toBe('main')
    /* 0.37 兼容：无 agentId/update 也解析 */
    expect(toolProgressEventSchema.parse({ type: 'tool.progress', toolCallId: 'tool-1' }).update).toBeUndefined()

    const shell = shellOutputEventSchema.parse({
      type: 'shell.output',
      agentId: 'main',
      commandId: 'cmd-1',
      update: { kind: 'progress', percent: 0.5, customKind: 'build', customData: {}, replace: false }
    })
    expect(shell.update?.replace).toBe(false)
    expect(shell.update?.customKind).toBe('build')
  })

  it('parses both the flat and by_workspace v2 session list pages', () => {
    const sessionItem = {
      id: 'session-1',
      workspace: { id: 'workspace-1', cwd: '/tmp' },
      meta: { title: 'T', last_prompt: null, created_at: 1, updated_at: 2, archived: false, archived_at: null },
      activity: { status: 'idle' }
    }
    const flat = sessionListV2PageSchema.parse({
      items: [sessionItem], total: 1, has_more: false, next_page_token: null
    })
    expect('items' in flat).toBe(true)
    expect(flat.total).toBe(1)

    const grouped = sessionListV2PageSchema.parse({
      groups: [{
        workspace: { id: 'workspace-1', cwd: '/tmp' },
        sessions: [sessionItem, { id: 'session-lite', archived: false }],
        total: 2
      }],
      total: 2, has_more: true, next_page_token: 'cursor-2'
    })
    expect('groups' in grouped).toBe(true)
    const groups = 'groups' in grouped ? grouped.groups : []
    expect(groups[0]?.workspace).toEqual({ id: 'workspace-1', cwd: '/tmp' })
    expect(groups[0]?.sessions).toHaveLength(2)
    expect(grouped.has_more).toBe(true)
    /* 缺 groups/items 的响应无法解析（两分支必居其一） */
    expect(sessionListV2PageSchema.safeParse({ total: 0, has_more: false, next_page_token: null }).success).toBe(false)
  })

  it('parses the OAuth region result with the required region enum', () => {
    expect(oauthRegionResultSchema.parse({ region: 'mainland-cn' }).region).toBe('mainland-cn')
    expect(oauthRegionResultSchema.parse({ region: 'global' }).region).toBe('global')
    expect(oauthRegionResultSchema.safeParse({}).success).toBe(false)
    expect(oauthRegionResultSchema.safeParse({ region: 'other' }).success).toBe(false)
  })
})
