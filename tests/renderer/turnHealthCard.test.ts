// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConversationPane from '../../src/renderer/src/components/ConversationPane.vue'
import type { ChatTurn } from '../../src/renderer/src/types.js'
import type { KimiPromptControls } from '../../src/shared/contracts.js'

const promptControls: KimiPromptControls = {
  model: 'kimi-for-coding',
  thinking: 'high',
  permissionMode: 'manual',
  planMode: false,
  swarmMode: false
}

const turns: ChatTurn[] = [
  {
    id: 'turn-user-1', role: 'user', author: 'You', time: '10:24',
    blocks: [{ id: 'turn-user-1:text:0', type: 'text', text: '帮我加入深色模式' }]
  },
  {
    id: 'turn-ai-1', role: 'assistant', author: 'Kimi', time: '10:25', blocks: []
  }
]

function mountPane(overrides: Record<string, unknown> = {}) {
  return shallowMount(ConversationPane, {
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
    props: {
      turns,
      phase: 'ready' as const,
      error: null,
      composerEnabled: true,
      promptPending: false,
      promptError: null,
      promptRunning: false,
      sessionId: 'session-1',
      terminalEnabled: true,
      terminalOpen: false,
      pendingApprovals: [],
      pendingQuestions: [],
      interactionPendingKey: null,
      interactionError: null,
      agents: [],
      skills: [],
      skillsPending: false,
      skillsError: null,
      skillActivationPending: false,
      skillActivationError: null,
      models: [],
      promptControls,
      controlsPending: false,
      controlsError: null,
      goal: null,
      promptQueue: null,
      operationalActionPending: null,
      operationalError: null,
      goalMode: false,
      localPromptQueue: [],
      warnings: [],
      warningsError: null,
      markers: [],
      conversationActionPending: null,
      conversationActionError: null,
      ...overrides
    }
  })
}

describe('ConversationPane 失败 Turn 卡片', () => {
  it('lastTurnReason=failed 时渲染常驻失败卡片与失败原因', () => {
    const wrapper = mountPane({ lastTurnReason: 'failed', lastTurnError: '401 (unauthorized)' })
    const card = wrapper.find('.turn-failed-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('任务执行失败')
    expect(card.text()).toContain('401 (unauthorized)')
    wrapper.unmount()
  })

  it('手动取消（cancelled）不渲染失败卡片', () => {
    const wrapper = mountPane({ lastTurnReason: 'cancelled' })
    expect(wrapper.find('.turn-failed-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('会话正在执行（promptRunning）时不渲染失败卡片', () => {
    const wrapper = mountPane({ lastTurnReason: 'failed', promptRunning: true })
    expect(wrapper.find('.turn-failed-card').exists()).toBe(false)
    wrapper.unmount()
  })

  it('点击重新运行会以最近用户 prompt 文本触发 retryFailedTurn', async () => {
    const wrapper = mountPane({ lastTurnReason: 'failed', lastTurnError: 'boom' })
    await wrapper.find('.turn-failed-resume').trigger('click')
    const emitted = wrapper.emitted('retryFailedTurn')
    expect(emitted).toHaveLength(1)
    expect(emitted?.[0]?.[0]).toBe('帮我加入深色模式')
    wrapper.unmount()
  })

  it('最近用户消息无文本时恢复按钮禁用', () => {
    const attachmentTurn: ChatTurn = {
      id: 'turn-attach', role: 'user', author: 'You', time: '10:24',
      blocks: [{ id: 'turn-attach:file:0', type: 'attachment', fileId: 'f1', name: 'a.png', mediaType: 'image/png', size: 10 }]
    }
    const wrapper = mountPane({ turns: [attachmentTurn], lastTurnReason: 'failed', lastTurnError: 'boom' })
    expect((wrapper.find('.turn-failed-resume').element as HTMLButtonElement).disabled).toBe(true)
    wrapper.unmount()
  })
})

describe('ConversationPane 自动重试指示', () => {
  const pendingTurn: ChatTurn = {
    id: 'turn-ai-1', role: 'assistant', author: 'Kimi', time: '10:25', blocks: [], pending: true
  }
  const retry = {
    failedAttempt: 2, nextAttempt: 3, maxAttempts: 5, delayMs: 4000,
    errorName: 'ProviderOverloaded', errorMessage: 'the model is overloaded'
  }

  it('重试期间在 pending 指示里展示「重试中 (attempt N/M)」与错误摘要', () => {
    const wrapper = mountPane({ turns: [pendingTurn], retry })
    const bubble = wrapper.find('.turn-pending-response')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toContain('重试中 (attempt 3/5)')
    expect(bubble.text()).toContain('the model is overloaded')
    wrapper.unmount()
  })

  it('无重试进度时 pending 指示保持默认文案', () => {
    const wrapper = mountPane({ turns: [pendingTurn] })
    const bubble = wrapper.find('.turn-pending-response')
    expect(bubble.exists()).toBe(true)
    expect(bubble.text()).toContain('Kimi 已接收任务，正在生成回复…')
    expect(bubble.text()).not.toContain('重试中')
    wrapper.unmount()
  })
})
