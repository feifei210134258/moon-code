// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ConversationPane from '../../src/renderer/src/components/ConversationPane.vue'

function mountConversation() {
  return shallowMount(ConversationPane, {
    global: {
      stubs: {
        ComposerBar: { template: '<div class="composer-bar-stub"><slot name="session-actions" /></div>' }
      }
    },
    props: {
      turns: [{
        id: 'turn-1', role: 'user' as const, author: 'You', time: '10:24',
        blocks: [{ id: 'turn-1:text:0', type: 'text' as const, text: '实现 Compact、Undo 和会话目录' }]
      }],
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
      promptControls: null,
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
      markers: [{
        markerId: 'marker-1', marker: 'history_compacted',
        payload: { result: { tokensBefore: 48_000, tokensAfter: 12_500 } }, at: '2026-07-24T10:00:00Z'
      }],
      conversationActionPending: null,
      conversationActionError: null
    }
  })
}

describe('Conversation controls', () => {
  it('keeps user identity and time above the right-aligned message bubble', () => {
    const wrapper = mountConversation()
    expect(wrapper.get('.turn').classes()).toContain('is-user')
    expect(wrapper.find('.turn.is-user .turn-content').exists()).toBe(true)
    expect(wrapper.find('.turn.is-user .turn-header').element.parentElement?.className).toContain('turn-body')
    expect(wrapper.find('.turn.is-user .turn-content .turn-header').exists()).toBe(false)
  })

  it('removes the top conversation bar and keeps its actions with the composer', () => {
    const wrapper = mountConversation()
    expect(wrapper.find('.conversation-toolbar').exists()).toBe(false)
    expect(wrapper.get('.composer-session-actions').text()).toContain('目录')
    expect(wrapper.get('.composer-session-actions').text()).toContain('BTW')
    expect(wrapper.get('.composer-session-actions').text()).toContain('会话操作')
  })

  it('provides TOC navigation and projects authoritative transcript markers', async () => {
    const wrapper = mountConversation()
    expect(wrapper.text()).toContain('上下文已压缩')
    expect(wrapper.text()).toContain('48,000 → 12,500 tokens')
    await wrapper.get('.conversation-tool-button[aria-expanded="false"]').trigger('click')
    expect(wrapper.get('.conversation-toc').text()).toContain('实现 Compact、Undo 和会话目录')
  })

  it('emits Compact instructions and Undo from the lightweight action menu', async () => {
    const wrapper = mountConversation()
    await wrapper.get('.conversation-action-popover input').setValue('保留安全边界')
    const buttons = wrapper.findAll('.conversation-action-popover > button')
    await buttons[0]!.trigger('click')
    await buttons[1]!.trigger('click')

    expect(wrapper.emitted('compact')).toEqual([['保留安全边界']])
    expect(wrapper.emitted('undo')).toEqual([[]])
  })

  it('opens a BTW Side Chat without coupling it to the main conversation actions', async () => {
    const wrapper = mountConversation()
    const buttons = wrapper.findAll('.conversation-tool-button')
    await buttons.find((button) => button.text().includes('BTW'))!.trigger('click')
    expect(wrapper.emitted('startSideChat')).toEqual([[]])
  })
})
