import { describe, expect, it } from 'vitest'
import { AgentProjector } from '../../packages/kimi-adapter/src/projector/AgentProjector.js'
import type { SessionSnapshot } from '../../packages/kimi-adapter/src/wire/schemas.js'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

function snapshot(): SessionSnapshot {
  return {
    as_of_seq: 10,
    epoch: 'epoch-1',
    session: {
      id: 'session-1', workspace_id: 'workspace-1', title: 'Session',
      created_at: '', updated_at: '', busy: true, main_turn_active: true,
      metadata: { cwd: '/tmp' }, agent_config: { model: 'kimi' },
      usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 100 },
      permission_rules: [], message_count: 0, last_seq: 10
    },
    messages: { items: [], has_more: false },
    in_flight_turn: null,
    subagents: [{
      id: 'agent-1', session_id: 'session-1', kind: 'subagent', description: 'Inspect auth',
      status: 'running', created_at: '2026-07-23T00:00:00.000Z', subagent_phase: 'working',
      subagent_type: 'explore', parent_tool_call_id: 'tool-1', swarm_index: 0,
      model: 'kimi-for-coding', thinking_effort: 'high'
    }],
    pending_approvals: [],
    pending_questions: []
  }
}

function frame(type: string, payload: Record<string, unknown>, seq: number): SessionEventFrame {
  return { type, payload, seq, epoch: 'epoch-1', session_id: 'session-1', timestamp: `2026-07-23T00:00:${seq}.000Z` }
}

describe('AgentProjector', () => {
  it('seeds snapshot roster and applies authoritative subagent lifecycle usage', () => {
    const projector = new AgentProjector()
    expect(projector.seedSnapshot('session-1', snapshot())).toEqual([
      expect.objectContaining({ id: 'main', role: 'main', status: 'working', model: 'kimi' }),
      expect.objectContaining({
        id: 'agent-1', status: 'working', parentToolCallId: 'tool-1',
        model: 'kimi-for-coding', thinkingEffort: 'high'
      })
    ])

    projector.project(frame('subagent.completed', {
      subagentId: 'agent-1',
      resultSummary: 'Auth is safe',
      usage: { inputOther: 120, output: 30, inputCacheRead: 50, inputCacheCreation: 4 },
      contextTokens: 512
    }, 11))

    expect(projector.getRoster('session-1')[1]).toEqual(expect.objectContaining({
      status: 'completed',
      outputPreview: 'Auth is safe',
      usage: { inputTokens: 120, outputTokens: 30, cacheReadTokens: 50, cacheCreationTokens: 4, contextTokens: 512 }
    }))
  })

  it('preserves spawn identity across started and suspended lifecycle frames', () => {
    const projector = new AgentProjector()
    projector.seedSnapshot('session-1', { ...snapshot(), subagents: [] })
    projector.project(frame('subagent.spawned', {
      subagentId: 'agent-2', subagentName: 'coder', description: 'Implement settings',
      parentAgentId: 'main', parentToolCallId: 'tool-2', runInBackground: false, swarmIndex: 1
    }, 12))
    projector.project(frame('subagent.started', { subagentId: 'agent-2' }, 13))
    projector.project(frame('subagent.suspended', { subagentId: 'agent-2', reason: 'waiting for task' }, 14))
    projector.project(frame('tool.progress', {
      agentId: 'agent-2', update: { text: 'late buffered output' }
    }, 15))
    projector.project(frame('turn.ended', { agentId: 'agent-2', reason: 'completed' }, 16))

    expect(projector.getRoster('session-1')[1]).toEqual(expect.objectContaining({
      name: 'coder', description: 'Implement settings', status: 'suspended',
      parentAgentId: 'main', parentToolCallId: 'tool-2', swarmIndex: 1,
      suspendedReason: 'waiting for task', outputPreview: null
    }))
  })

  it('excludes background subagents from snapshot and live foreground rosters', () => {
    const projector = new AgentProjector()
    const initial = snapshot()
    initial.subagents?.push({
      id: 'background-snapshot', session_id: 'session-1', kind: 'subagent',
      description: 'Background', status: 'running', created_at: '', run_in_background: true
    })
    expect(projector.seedSnapshot('session-1', initial).map((agent) => agent.id)).not.toContain('background-snapshot')

    expect(projector.project(frame('subagent.spawned', {
      subagentId: 'background-live', subagentName: 'explore', runInBackground: true
    }, 15))).toBe(false)
    expect(projector.project(frame('subagent.started', { subagentId: 'background-live' }, 16))).toBe(false)
    expect(projector.project(frame('assistant.delta', {
      agentId: 'background-live', delta: 'background output'
    }, 17))).toBe(false)
    expect(projector.getRoster('session-1').map((agent) => agent.id)).not.toContain('background-live')
  })

  it('tracks model and thinking effort from spawn and status frames', () => {
    const projector = new AgentProjector()
    projector.seedSnapshot('session-1', { ...snapshot(), subagents: [] })

    projector.project(frame('subagent.spawned', {
      subagentId: 'agent-3', subagentName: 'explore', description: 'Inspect config',
      parentAgentId: 'main', runInBackground: false,
      model: 'kimi-for-coding-highspeed', thinkingEffort: 'low'
    }, 12))
    expect(projector.getRoster('session-1')[1]).toEqual(expect.objectContaining({
      id: 'agent-3', model: 'kimi-for-coding-highspeed', thinkingEffort: 'low'
    }))

    expect(projector.project(frame('agent.status.updated', {
      agentId: 'main', model: 'kimi-k3', thinkingEffort: 'max'
    }, 13))).toBe(true)
    expect(projector.getRoster('session-1')[0]).toEqual(expect.objectContaining({
      id: 'main', model: 'kimi-k3', thinkingEffort: 'max'
    }))
  })

  it('drops a foreground subagent when it detaches into a background task', () => {
    const projector = new AgentProjector()
    projector.seedSnapshot('session-1', snapshot())

    expect(projector.project(frame('task.started', {
      info: { kind: 'agent', detached: true, agentId: 'agent-1' }
    }, 15))).toBe(true)
    expect(projector.getRoster('session-1').map((agent) => agent.id)).toEqual(['main'])
  })

  it('fails live foreground subagents when the main turn is aborted', () => {
    const projector = new AgentProjector()
    projector.seedSnapshot('session-1', snapshot())

    projector.project(frame('turn.ended', { agentId: 'main', reason: 'cancelled' }, 16))

    expect(projector.getRoster('session-1')).toEqual([
      expect.objectContaining({ id: 'main', status: 'cancelled' }),
      expect.objectContaining({ id: 'agent-1', status: 'failed', outputPreview: 'Main turn cancelled' })
    ])
  })

  it('keys the roster by snapshot agent_id when present and exposes task fields (0.37.2)', () => {
    const projector = new AgentProjector()
    const initial = snapshot()
    initial.subagents?.push({
      id: 'task-9', session_id: 'session-1', kind: 'subagent', description: 'Review changes',
      status: 'completed', created_at: '2026-07-23T00:00:00.000Z', agent_id: 'agent-9',
      subagent_type: 'verify', parent_tool_call_id: 'tool-9'
    })
    const roster = projector.seedSnapshot('session-1', initial)
    expect(roster).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'agent-9', subagentType: 'verify', parentToolCallId: 'tool-9' })
    ]))

    // 实时生命周期事件按 agent 同键命中
    expect(projector.project(frame('subagent.completed', {
      subagentId: 'agent-9', resultSummary: 'verified'
    }, 16))).toBe(true)
    expect(projector.getRoster('session-1').find((agent) => agent.id === 'agent-9')).toEqual(
      expect.objectContaining({ status: 'completed', outputPreview: 'verified' })
    )
  })
})
