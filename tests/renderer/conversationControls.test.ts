// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ConversationPane from '../../src/renderer/src/components/ConversationPane.vue'

const turns = [
  {
    id: 'turn-1', role: 'user' as const, author: 'You', time: '10:24',
    blocks: [{ id: 'turn-1:text:0', type: 'text' as const, text: '实现 Compact、Undo 和会话目录' }]
  },
  {
    id: 'turn-2', role: 'assistant' as const, author: 'Kimi', time: '10:25',
    blocks: [{ id: 'turn-2:text:0', type: 'text' as const, text: '已完成。' }]
  },
  {
    id: 'turn-3', role: 'user' as const, author: 'You', time: '10:30',
    blocks: [{ id: 'turn-3:text:0', type: 'text' as const, text: '再补一个左侧目录' }]
  }
]

function mountConversation() {
  return shallowMount(ConversationPane, {
    attachTo: document.body,
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

function stubRailLayout(wrapper: ReturnType<typeof mountConversation>): void {
  const scrollEl = wrapper.find('.transcript-scroll').element as HTMLElement
  Object.defineProperty(scrollEl, 'clientHeight', { configurable: true, value: 500 })
  Object.defineProperty(scrollEl, 'scrollHeight', { configurable: true, value: 2000 })
  Object.defineProperty(scrollEl, 'offsetTop', { configurable: true, value: 0 })
  scrollEl.getBoundingClientRect = () => ({ top: 0, bottom: 500 }) as DOMRect
  const positions: Record<string, { top: number; height: number }> = {
    'conversation-turn-turn-1': { top: 40, height: 300 },
    'conversation-turn-turn-3': { top: 900, height: 420 }
  }
  for (const [id, rect] of Object.entries(positions)) {
    const node = document.getElementById(id) as HTMLElement
    node.getBoundingClientRect = () => ({ top: rect.top, height: rect.height }) as DOMRect
  }
}

describe('Conversation controls', () => {
  it('keeps user identity and time above the right-aligned message bubble', () => {
    const wrapper = mountConversation()
    expect(wrapper.get('.turn').classes()).toContain('is-user')
    expect(wrapper.find('.turn.is-user .turn-content').exists()).toBe(true)
    expect(wrapper.find('.turn.is-user .turn-header').element.parentElement?.className).toContain('turn-body')
    expect(wrapper.find('.turn.is-user .turn-content .turn-header').exists()).toBe(false)
    wrapper.unmount()
  })

  it('no longer carries 目录/BTW/会话操作 inside the composer', () => {
    const wrapper = mountConversation()
    expect(wrapper.find('.composer-session-actions').exists()).toBe(false)
    expect(wrapper.find('.conversation-action-menu').exists()).toBe(false)
    expect(wrapper.find('.conversation-toc').exists()).toBe(false)
    wrapper.unmount()
  })

  it('projects authoritative transcript markers', () => {
    const wrapper = mountConversation()
    expect(wrapper.text()).toContain('上下文已压缩')
    expect(wrapper.text()).toContain('48,000 → 12,500 tokens')
    wrapper.unmount()
  })

  it('renders a Codex-style TOC rail for user turns and scrolls to a turn on click', async () => {
    const wrapper = mountConversation()
    stubRailLayout(wrapper)
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    const rail = wrapper.get('.toc-rail')
    expect(rail.attributes('style')).toContain('height: 500px')
    const ticks = wrapper.findAll('.toc-tick')
    expect(ticks).toHaveLength(2)
    expect(ticks[0]!.attributes('title')).toBe('实现 Compact、Undo 和会话目录')
    expect(ticks[1]!.attributes('title')).toBe('再补一个左侧目录')
    /* 刻度纵向位置 ∝ 回合位置：turn-3 在 2000px 内容的 900px 处 → 500px 轨道的 225px 附近 */
    expect(ticks[1]!.attributes('style')).toContain('top: 221px')
    expect(ticks[0]!.classes()).toContain('is-active')

    const turn = document.getElementById('conversation-turn-turn-3') as HTMLElement
    turn.scrollIntoView = vi.fn()
    await ticks[1]!.trigger('click')
    expect(turn.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    wrapper.unmount()
  })
})
