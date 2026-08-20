// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentRoster from '../../src/renderer/src/components/AgentRoster.vue'

describe('AgentRoster', () => {
  it('reveals name, task and status inline, with track button as the only entry to details', async () => {
    const wrapper = mount(AgentRoster, {
      props: {
        agents: [
          {
            id: 'main', role: 'main', name: 'Kimi', description: 'Main', status: 'working',
            subagentType: null, parentAgentId: null, parentToolCallId: null, swarmIndex: null,
            runInBackground: false, model: null, thinkingEffort: null,
            createdAt: null, startedAt: null, completedAt: null,
            suspendedReason: null, outputPreview: null, usage: null
          },
          {
            id: 'agent-1', role: 'subagent', name: 'explore', description: 'Inspect auth', status: 'completed',
            subagentType: 'explore', parentAgentId: 'main', parentToolCallId: 'tool-1', swarmIndex: 0,
            runInBackground: false, model: 'kimi-for-coding', thinkingEffort: 'high',
            createdAt: null, startedAt: null, completedAt: null,
            suspendedReason: null, outputPreview: 'No credential leak found',
            usage: { inputTokens: 100, outputTokens: 25, cacheReadTokens: 20, cacheCreationTokens: 5, contextTokens: 256 }
          },
          {
            id: 'agent-2', role: 'subagent', name: 'coder', description: 'Fix the bug', status: 'working',
            subagentType: 'coder', parentAgentId: 'main', parentToolCallId: 'tool-2', swarmIndex: 1,
            runInBackground: false, model: null, thinkingEffort: null,
            createdAt: null, startedAt: null, completedAt: null,
            suspendedReason: null, outputPreview: 'Patching store.ts', usage: null
          }
        ]
      }
    })

    expect(wrapper.find('.agent-roster-list').exists()).toBe(false)
    expect(wrapper.get('.agent-roster-summary').text()).toContain('2 个')
    await wrapper.get('.agent-roster-summary').trigger('click')

    const list = wrapper.get('.agent-roster-list')
    // 名称、任务、状态仍直接渲染
    expect(list.text()).toContain('explore')
    expect(list.text()).toContain('Inspect auth')
    expect(list.text()).toContain('已完成')
    expect(list.text()).toContain('coder')
    expect(list.text()).toContain('Fix the bug')
    expect(list.text()).toContain('工作中')
    expect(list.text()).toContain('150 tokens')
    // 模型与思考档位在展开行内展示
    expect(list.text()).toContain('kimi-for-coding · high')
    // 任务报告不再内联渲染
    expect(list.text()).not.toContain('No credential leak found')
    expect(list.text()).not.toContain('Patching store.ts')

    // 每行有“追踪”按钮，行本身不可点击打开
    const rows = wrapper.findAll('.agent-row')
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row.find('.agent-track-button').exists()).toBe(true))
    const firstRow = rows[0]!
    const firstButton = firstRow.get('.agent-track-button')
    expect(firstButton.attributes('aria-label')).toBe('追踪 explore')
    await wrapper.get('.agent-row').trigger('click')
    expect(wrapper.emitted('open')).toBeUndefined()

    // 点击“追踪”按钮打开详情，参数为该 agent
    await firstButton.trigger('click')
    expect(wrapper.emitted('open')?.[0]?.[0]).toEqual(expect.objectContaining({ id: 'agent-1' }))
    await rows[1]!.get('.agent-track-button').trigger('click')
    expect(wrapper.emitted('open')?.[1]?.[0]).toEqual(expect.objectContaining({ id: 'agent-2' }))
  })

  it('groups subagents whose parentAgentId matches another subagent under it, indenting each level', async () => {
    const base = {
      role: 'subagent' as const, description: 'task', status: 'working' as const,
      subagentType: 'explore', runInBackground: false, model: null, thinkingEffort: null,
      createdAt: null, startedAt: null, completedAt: null,
      suspendedReason: null, outputPreview: null, usage: null
    }
    const wrapper = mount(AgentRoster, {
      props: {
        agents: [
          { ...base, id: 'agent-1', name: 'root-1', parentAgentId: 'main', parentToolCallId: 'tool-1', swarmIndex: 0 },
          { ...base, id: 'agent-2', name: 'child-1', parentAgentId: 'agent-1', parentToolCallId: 'tool-2', swarmIndex: 0 },
          { ...base, id: 'agent-3', name: 'grandchild', parentAgentId: 'agent-2', parentToolCallId: 'tool-3', swarmIndex: 0 },
          { ...base, id: 'agent-4', name: 'orphan', parentAgentId: null, parentToolCallId: null, swarmIndex: 1 }
        ]
      }
    })
    await wrapper.get('.agent-roster-summary').trigger('click')

    // 前序遍历：父节点先于子节点，嵌套层级通过 data-depth 表达
    const rows = wrapper.findAll('.agent-row').map((row) => ({
      id: row.find('strong').text(),
      depth: row.attributes('data-depth'),
      nested: row.classes().includes('is-nested')
    }))
    expect(rows).toEqual([
      { id: 'root-1', depth: '0', nested: false },
      { id: 'child-1', depth: '1', nested: true },
      { id: 'grandchild', depth: '2', nested: true },
      { id: 'orphan', depth: '0', nested: false }
    ])
  })

  it('falls back to the main-agent level when parentAgentId does not resolve to a roster node', async () => {
    const base = {
      role: 'subagent' as const, description: 'task', status: 'completed' as const,
      subagentType: 'verify', runInBackground: false, model: null, thinkingEffort: null,
      createdAt: null, startedAt: null, completedAt: null,
      suspendedReason: null, outputPreview: null, usage: null
    }
    const wrapper = mount(AgentRoster, {
      props: {
        agents: [
          { ...base, id: 'agent-1', name: 'self-ref', parentAgentId: 'agent-1', parentToolCallId: 'tool-1', swarmIndex: null },
          { ...base, id: 'agent-2', name: 'missing-parent', parentAgentId: 'no-such-agent', parentToolCallId: 'tool-2', swarmIndex: null }
        ]
      }
    })
    await wrapper.get('.agent-roster-summary').trigger('click')
    const rows = wrapper.findAll('.agent-row')
    expect(rows).toHaveLength(2)
    // 自指向 / 未知父 ID 都回退到顶层，不进入嵌套
    rows.forEach((row) => expect(row.attributes('data-depth')).toBe('0'))
  })
})
