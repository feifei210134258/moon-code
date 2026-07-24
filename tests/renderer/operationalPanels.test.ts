// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import GoalStrip from '../../src/renderer/src/components/GoalStrip.vue'
import PromptQueueDock from '../../src/renderer/src/components/PromptQueueDock.vue'

const goal = {
  goalId: 'goal-1', objective: '完成 Kimi Web P0', completionCriterion: null,
  status: 'active' as const, turnsUsed: 4, tokensUsed: 8200, wallClockMs: 90000,
  budget: {
    tokenBudget: 20000, turnBudget: null, wallClockBudgetMs: null,
    remainingTokens: 11800, remainingTurns: null, remainingWallClockMs: null,
    tokenBudgetReached: false, turnBudgetReached: false,
    wallClockBudgetReached: false, overBudget: false
  },
  terminalReason: null
}

describe('operational panels', () => {
  it('renders the authoritative Goal and emits upstream controls', async () => {
    const wrapper = mount(GoalStrip, { props: { goal, pendingKey: null } })
    expect(wrapper.text()).toContain('完成 Kimi Web P0')
    await wrapper.get('[aria-label="暂停 Goal"]').trigger('click')
    expect(wrapper.emitted('control')).toEqual([['pause']])
  })

  it('shows active and queued Prompts with steer and abort actions', async () => {
    const wrapper = mount(PromptQueueDock, {
      props: {
        pendingKey: null,
        localQueue: [],
        queue: {
          active: { promptId: 'p1', userMessageId: 'm1', status: 'running', textPreview: '当前任务', createdAt: null },
          queued: [{ promptId: 'p2', userMessageId: 'm2', status: 'queued', textPreview: '排队任务', createdAt: null }]
        }
      }
    })
    expect(wrapper.text()).toContain('1 waiting')
    await wrapper.get('[aria-label="将 Prompt 插入当前任务"]').trigger('click')
    expect(wrapper.emitted('steer')).toEqual([['p2']])
    await wrapper.get('[aria-label="移出 Prompt 队列"]').trigger('click')
    expect(wrapper.emitted('abort')).toContainEqual(['p2'])
  })

  it('keeps official-style local drafts editable and reorderable before Kimi submission', async () => {
    const controls = {
      model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
      planMode: false, swarmMode: false
    }
    const wrapper = mount(PromptQueueDock, {
      props: {
        pendingKey: null,
        queue: null,
        localQueue: [
          { id: 'd1', sessionId: 's1', input: { text: '先写测试', controls }, createdAt: '2026-07-24T00:00:00Z' },
          { id: 'd2', sessionId: 's1', input: { text: '再实现功能', controls }, createdAt: '2026-07-24T00:01:00Z' }
        ]
      }
    })
    expect(wrapper.text()).toContain('2 waiting')
    await wrapper.get('[aria-label="编辑待发送 Prompt"]').trigger('click')
    expect(wrapper.emitted('editLocal')).toEqual([['d1']])
    const down = wrapper.findAll('[aria-label="下移待发送 Prompt"]')
    await down[0]!.trigger('click')
    expect(wrapper.emitted('moveLocal')).toEqual([['d1', 1]])
    await wrapper.findAll('[aria-label="移除待发送 Prompt"]')[1]!.trigger('click')
    expect(wrapper.emitted('removeLocal')).toEqual([['d2']])
  })
})
