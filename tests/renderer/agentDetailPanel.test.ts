// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentDetailPanel from '../../src/renderer/src/components/AgentDetailPanel.vue'

const agents = [
  {
    id: 'agent-1', role: 'subagent' as const, name: 'explore', description: 'Inspect auth', status: 'completed' as const,
    subagentType: 'explore', parentAgentId: null, parentToolCallId: null, swarmIndex: 0, towerMode: null,
    runInBackground: false, model: 'kimi-for-coding', thinkingEffort: 'high',
    createdAt: null, startedAt: null, completedAt: null, suspendedReason: null, outputPreview: null,
    usage: { inputTokens: 100, outputTokens: 25, cacheReadTokens: 20, cacheCreationTokens: 5, contextTokens: 256 }
  },
  {
    id: 'agent-2', role: 'subagent' as const, name: 'coder', description: 'Fix the bug', status: 'working' as const,
    subagentType: 'coder', parentAgentId: 'agent-1', parentToolCallId: 'tool-2', swarmIndex: null, towerMode: null,
    runInBackground: false, model: null, thinkingEffort: null,
    createdAt: null, startedAt: null, completedAt: null, suspendedReason: null, outputPreview: null, usage: null
  }
]

const selectedAgent = agents[0]!
const transcript = {
  agentId: 'agent-1', hasMore: false,
  usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, contextTokens: null },
  messages: [{
    id: 'agent-message-1', sessionId: 'session-1', role: 'assistant' as const,
    content: [{ type: 'text' as const, text: '核心路径已有覆盖。' }], createdAt: '', promptId: 'turn-1', status: 'completed' as const
  }]
}

const todos = [{
  todoId: 'todo-1',
  items: [
    { title: '调研', status: 'done' as const },
    { title: '实现', status: 'in_progress' as const },
    { title: '验证', status: 'pending' as const }
  ],
  updatedAt: null
}]

const tasks = [
  { id: 'task-1', sessionId: 's1', kind: 'bash' as const, description: 'build', status: 'running' as const, command: 'pnpm build', createdAt: null, startedAt: null, completedAt: null, outputPreview: 'compiling', outputBytes: null },
  { id: 'task-2', sessionId: 's1', kind: 'tool' as const, description: 'lint', status: 'completed' as const, command: null, createdAt: null, startedAt: null, completedAt: null, outputPreview: null, outputBytes: null }
]

const base = { agents, transcript: null, pending: false, error: null, todos, tasks }

describe('AgentDetailPanel 向上展开的会话状态面板', () => {
  it('不渲染任何分段 tab（胶囊即切换器）', () => {
    const wrapper = mount(AgentDetailPanel, { props: { ...base, segment: 'todos', agent: null } })
    expect(wrapper.find('.agent-detail-segments').exists()).toBe(false)
    expect(wrapper.findAll('button').some((b) => b.text() === '子 Agent')).toBe(false)
  })

  it('agents 段渲染树形名册，追踪按钮发出 openAgent，嵌套子代缩进', async () => {
    const wrapper = mount(AgentDetailPanel, { props: { ...base, segment: 'agents', agent: null } })
    const rows = wrapper.findAll('.agent-row')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('explore')
    expect(wrapper.text()).toContain('Inspect auth')
    expect(rows[0]!.attributes('data-depth')).toBe('0')
    expect(rows[1]!.attributes('data-depth')).toBe('1')
    expect(rows[1]!.classes()).toContain('is-nested')
    expect(wrapper.text()).toContain('150 tokens')

    await rows[0]!.get('.agent-track-button').trigger('click')
    expect(wrapper.emitted('openAgent')?.[0]?.[0]).toEqual(expect.objectContaining({ id: 'agent-1' }))
  })

  it('agents 段选中 agent 后显示转录，返回名册按钮发出 clearAgent', async () => {
    const wrapper = mount(AgentDetailPanel, {
      props: { ...base, segment: 'agents', agent: selectedAgent, transcript }
    })
    expect(wrapper.text()).toContain('explore')
    expect(wrapper.text()).toContain('核心路径已有覆盖。')
    expect(wrapper.find('.agent-detail-roster').exists()).toBe(false)

    await wrapper.get('.agent-detail-back').trigger('click')
    expect(wrapper.emitted('clearAgent')).toHaveLength(1)
  })

  it('todos 段渲染清单与完成计数', () => {
    const wrapper = mount(AgentDetailPanel, { props: { ...base, segment: 'todos', agent: null } })
    expect(wrapper.text()).toContain('1/3')
    expect(wrapper.text()).toContain('调研')
    expect(wrapper.text()).toContain('进行中')
    expect(wrapper.find('.agent-detail-todos li.is-done').exists()).toBe(true)
  })

  it('tasks 段渲染任务行，运行中的行可取消', async () => {
    const wrapper = mount(AgentDetailPanel, { props: { ...base, segment: 'tasks', agent: null } })
    const rows = wrapper.findAll('.detail-task-row')
    expect(rows).toHaveLength(2)
    expect(wrapper.text()).toContain('pnpm build')
    const cancel = rows[0]!.findAll('button').find((b) => b.text() === '取消')
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancelTask')?.[0]).toEqual(['task-1'])
    expect(rows[1]!.text()).not.toContain('取消')
  })

  it('关闭按钮发出 close', async () => {
    const wrapper = mount(AgentDetailPanel, { props: { ...base, segment: 'todos', agent: null } })
    await wrapper.get('[aria-label="关闭"]').trigger('click')
    expect(wrapper.emitted('close')).toEqual([[]])
  })
})
