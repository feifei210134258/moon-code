// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AgentRoster from '../../src/renderer/src/components/AgentRoster.vue'

const subagent = {
  id: 'agent-1', role: 'subagent' as const, name: 'explore', description: 'Inspect', status: 'working' as const,
  subagentType: 'explore', parentAgentId: null, parentToolCallId: null, swarmIndex: null, towerMode: null,
  runInBackground: false, model: null, thinkingEffort: null,
  createdAt: null, startedAt: null, completedAt: null, suspendedReason: null, outputPreview: null, usage: null
}

const todoList = {
  todoId: 'todo-1',
  items: [{ title: '调研', status: 'done' as const }, { title: '实现', status: 'in_progress' as const }],
  updatedAt: null
}

const task = {
  id: 'task-1', sessionId: 's1', kind: 'bash' as const, description: 'build', status: 'running' as const,
  command: 'pnpm build', createdAt: null, startedAt: null, completedAt: null, outputPreview: null, outputBytes: null
}

describe('AgentRoster 会话状态条带', () => {
  it('按 计划 → Agents → 任务 的顺序渲染三个独立芯片', () => {
    const wrapper = mount(AgentRoster, {
      props: { agents: [subagent], todos: [todoList], tasks: [task] }
    })
    const pills = wrapper.findAll('.roster-pill')
    expect(pills).toHaveLength(3)
    expect(pills[0]!.text()).toContain('计划')
    expect(pills[0]!.text()).toContain('1/2')
    expect(pills[1]!.text()).toContain('Agents')
    expect(pills[1]!.text()).toContain('1 个')
    expect(pills[2]!.text()).toContain('任务')
    expect(pills[2]!.text()).toContain('1 运行中')
    /* 纯条带：不再有展开列表与树形渲染 */
    expect(wrapper.find('.agent-roster-list').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('explore')
  })

  it('每个胶囊点击发出 select 事件（含重复点击，开关由父层决定）', async () => {
    const wrapper = mount(AgentRoster, {
      props: { agents: [subagent], todos: [todoList], tasks: [task] }
    })
    const pills = wrapper.findAll('.roster-pill')
    await pills[0]!.trigger('click')
    await pills[0]!.trigger('click')
    await pills[1]!.trigger('click')
    await pills[2]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['plan'], ['plan'], ['agents'], ['tasks']])
  })

  it('激活态 class 随 activeSegment 变化', async () => {
    const wrapper = mount(AgentRoster, {
      props: { agents: [subagent], todos: [todoList], tasks: [task], activeSegment: 'plan' }
    })
    const pills = wrapper.findAll('.roster-pill')
    expect(pills[0]!.classes()).toContain('is-active')
    expect(pills[1]!.classes()).not.toContain('is-active')
    await wrapper.setProps({ activeSegment: 'agents' })
    expect(wrapper.findAll('.roster-pill')[0]!.classes()).not.toContain('is-active')
    expect(wrapper.findAll('.roster-pill')[1]!.classes()).toContain('is-active')
  })

  it('三类都无内容时整个条带隐藏；各胶囊独立按空态隐藏', () => {
    const empty = mount(AgentRoster, { props: { agents: [], todos: [], tasks: [] } })
    expect(empty.find('.roster-strip').exists()).toBe(false)

    const onlyTodos = mount(AgentRoster, {
      props: { agents: [], todos: [{ ...todoList, items: [{ title: 'a', status: 'done' }] }], tasks: [] }
    })
    expect(onlyTodos.findAll('.roster-pill')).toHaveLength(1)
    expect(onlyTodos.text()).toContain('1/1')

    const onlyAgents = mount(AgentRoster, { props: { agents: [subagent], todos: [], tasks: [] } })
    expect(onlyAgents.findAll('.roster-pill')).toHaveLength(1)
    expect(onlyAgents.text()).toContain('Agents')

    const onlyTasks = mount(AgentRoster, { props: { agents: [], todos: [], tasks: [{ ...task, status: 'completed' }] } })
    expect(onlyTasks.findAll('.roster-pill')).toHaveLength(1)
    expect(onlyTasks.text()).toContain('任务')
    expect(onlyTasks.text()).not.toContain('运行中')
  })
})
