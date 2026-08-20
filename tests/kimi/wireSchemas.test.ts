import { describe, expect, it } from 'vitest'
import {
  backgroundTaskSchema,
  capabilityChangedEventSchema,
  kimiSessionErrorCodeSchema,
  originUserSchema,
  pluginChangedEventSchema,
  promptSkillSchema,
  sessionBatchActionResultSchema,
  sessionListV2Schema,
  sessionPlanListSchema,
  snapshotSubagentSchema,
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
