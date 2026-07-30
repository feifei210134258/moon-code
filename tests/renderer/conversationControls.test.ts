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

  it('explains that an empty pending Kimi turn is still generating', async () => {
    const wrapper = mountConversation()
    await wrapper.setProps({
      turns: [{
        id: 'turn-pending', role: 'assistant', author: 'Kimi', time: '10:26',
        blocks: [], pending: true
      }]
    })

    const pending = wrapper.get('.turn-pending-response')
    expect(pending.attributes('role')).toBe('status')
    expect(pending.text()).toContain('Kimi 已接收任务，正在生成回复…')
    expect(pending.findAll('.turn-pending-dots i')).toHaveLength(3)
    wrapper.unmount()
  })

  it('lets a stopped prompt with no Kimi output be recalled into the composer', async () => {
    const wrapper = mountConversation()
    await wrapper.setProps({
      turns: [
        {
          id: 'turn-stopped-user', role: 'user', author: 'You', time: '10:26',
          blocks: [{ id: 'turn-stopped-user:text:0', type: 'text', text: '重新整理这条消息' }]
        },
        {
          id: 'turn-empty-assistant', role: 'assistant', author: 'Kimi', time: '10:26',
          blocks: []
        }
      ],
      recallableTurnId: 'turn-stopped-user'
    })

    const action = wrapper.get('[aria-label="撤回最后一条消息并放回输入框"]')
    expect(action.text()).toContain('撤回并编辑')
    await action.trigger('click')
    expect(wrapper.emitted('undo')).toEqual([[]])

    await wrapper.setProps({ conversationActionPending: 'undo' })
    expect((action.element as HTMLButtonElement).disabled).toBe(true)
    expect(action.text()).toContain('正在撤回')
    wrapper.unmount()
  })

  it('offers the same system-open and delete menu for files in assistant output', async () => {
    const confirm = vi.fn(() => true)
    Object.defineProperty(window, 'confirm', { configurable: true, value: confirm })
    const wrapper = mountConversation()
    await wrapper.setProps({
      turns: [{
        id: 'turn-file', role: 'assistant', author: 'Kimi', time: '10:26',
        blocks: [{ id: 'turn-file:file:0', type: 'file', name: 'dist/校看板.html' }]
      }]
    })

    const file = wrapper.get('.linked-file')
    await file.trigger('contextmenu', { clientX: 140, clientY: 90 })
    let menu = document.querySelector('.output-file-context-menu') as HTMLElement
    expect(menu.textContent).toContain('系统打开')
    ;(menu.querySelectorAll('button')[0] as HTMLButtonElement).click()
    await nextTick()
    expect(wrapper.emitted('openSystem')).toEqual([['dist/校看板.html']])

    await file.trigger('contextmenu', { clientX: 140, clientY: 90 })
    menu = document.querySelector('.output-file-context-menu') as HTMLElement
    ;(menu.querySelectorAll('button')[1] as HTMLButtonElement).click()
    await nextTick()
    expect(confirm).toHaveBeenCalledWith('将文件“校看板.html”移到废纸篓？')
    expect(wrapper.emitted('trashEntry')).toEqual([['dist/校看板.html']])
    Object.defineProperty(window, 'confirm', { configurable: true, value: undefined })
    wrapper.unmount()
  })

  it('renders a compact TOC rail with immediate content cards and scrolls to a turn on click', async () => {
    const wrapper = mountConversation()
    stubRailLayout(wrapper)
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    const rail = wrapper.get('.toc-rail')
    expect(rail.attributes('style')).toContain('top: 167px')
    expect(rail.attributes('style')).toContain('height: 333px')
    const ticks = wrapper.findAll('.toc-tick')
    expect(ticks).toHaveLength(2)
    expect(ticks[0]!.attributes('aria-label')).toBe('跳转到：实现 Compact、Undo 和会话目录')
    expect(ticks[1]!.attributes('aria-label')).toBe('跳转到：再补一个左侧目录')
    /* 相邻目录项固定紧凑排列，不再被 2000px 全文高度拉开。 */
    expect(ticks[0]!.attributes('style')).toContain('top: 10px')
    expect(ticks[1]!.attributes('style')).toContain('top: 28px')
    expect(ticks[0]!.get('.toc-preview-card').text()).toContain('实现 Compact、Undo 和会话目录')
    expect(ticks[0]!.get('.toc-preview-card').text()).toContain('用户消息· 10:24')
    expect(ticks[0]!.classes()).toContain('is-active')

    const turn = document.getElementById('conversation-turn-turn-3') as HTMLElement
    turn.scrollIntoView = vi.fn()
    await ticks[1]!.trigger('click')
    expect(turn.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
    wrapper.unmount()
  })
})
