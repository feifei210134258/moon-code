// @vitest-environment happy-dom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PlanViewerPanel from '../../src/renderer/src/components/PlanViewerPanel.vue'
import ActivityBlock from '../../src/renderer/src/components/ActivityBlock.vue'
import { useWorkbenchStore } from '../../src/renderer/src/stores/workbench.js'
import { rendererLocale, setRendererLocale } from '../../src/renderer/src/i18n/rendererLocale.js'
import type { PlanReview, SessionViewState } from '../../src/shared/contracts.js'

function plan(overrides: Partial<PlanReview> = {}): PlanReview {
  return {
    toolCallId: 'plan-tool-1',
    turnId: 'turn-7',
    source: 'interaction',
    plan: '1. 先读 README\n2. 再改 App.vue\n3. 跑测试',
    ...overrides
  }
}

function approvedPlan(): PlanReview {
  return plan({
    path: 'docs/plan.md',
    options: [{ label: '批准计划', description: '直接开始执行' }],
    review: { state: 'approved', selectedOption: '批准计划', feedback: '第三点补充一下测试命令' }
  })
}

function dialog(): HTMLElement | null {
  return document.body.querySelector('.plan-viewer-dialog')
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...document.body.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label)
}

function mountPanel(planValue: PlanReview | null) {
  return mount(PlanViewerPanel, {
    global: { stubs: { Teleport: false } },
    props: { plan: planValue }
  })
}

describe('PlanViewerPanel 内容渲染', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('展示完整 plan 文本、路径与审批状态', () => {
    mountPanel(approvedPlan())
    const node = dialog()
    expect(node).not.toBeNull()
    expect(node!.textContent).toContain('1. 先读 README')
    expect(node!.textContent).toContain('docs/plan.md')
    expect(node!.textContent).toContain('已批准')
    expect(node!.textContent).toContain('批准计划')
    expect(node!.textContent).toContain('第三点补充一下测试命令')
  })

  it('无 plan 文本或 plan 为 null 时展示缺省说明而不崩溃', () => {
    mountPanel(plan({ plan: '' }))
    expect(dialog()!.textContent).toContain('暂无计划文本')
    document.body.replaceChildren()
    mountPanel(null)
    expect(dialog()!.textContent).toContain('暂无计划文本')
  })
})

describe('PlanViewerPanel 反馈输入框自适应增高与发送', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('发送按钮在空内容时禁用，输入后启用并发送反馈', async () => {
    const wrapper = mountPanel(plan())
    const sendButton = () => findButton('发送反馈')

    expect(sendButton()?.disabled).toBe(true)

    const textarea = document.body.querySelector<HTMLTextAreaElement>('.plan-viewer-feedback')!
    textarea.value = '这里需要调整'
    await textarea.dispatchEvent(new Event('input'))
    expect(sendButton()?.disabled).toBe(false)

    await sendButton()!.dispatchEvent(new Event('click'))
    await textarea.dispatchEvent(new Event('click'))
    /* 发送后清空输入并回到禁用态 */
    expect(textarea.value).toBe('')
    expect(sendButton()?.disabled).toBe(true)
    /* 反馈文本经 sendFeedback 事件提交给上层走真实 respondApproval feedback 通道 */
    expect(wrapper.emitted('sendFeedback')).toEqual([['这里需要调整']])
  })

  it('textarea 高度随内容自适应增高（对齐上游 0.37 修复）', async () => {
    mountPanel(plan())
    const textarea = document.body.querySelector<HTMLTextAreaElement>('.plan-viewer-feedback')!

    /* happy-dom 不布局，固定可读 scrollHeight 验证 autoGrow 计算 */
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 96 })
    textarea.value = '多行反馈\n第二行\n第三行'
    await textarea.dispatchEvent(new Event('input'))

    expect(textarea.style.height).toBe('96px')
    expect(textarea.style.overflowY).toBe('hidden')
    /* 超过阈值后进入滚动 */
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 210 })
    await textarea.dispatchEvent(new Event('input'))
    expect(textarea.style.overflowY).toBe('auto')
  })

  it('复制计划写入剪贴板并短暂显示已复制', async () => {
    const clipboard: string[] = []
    try {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (text: string) => { clipboard.push(text) } }
      })
    } catch {
      Object.assign(navigator, { clipboard: { writeText: async (text: string) => { clipboard.push(text) } } })
    }

    const wrapper = mountPanel(plan({ plan: '复制这段计划' }))
    await findButton('复制计划')!.dispatchEvent(new Event('click'))
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(clipboard).toEqual(['复制这段计划'])
    expect(document.body.textContent).toContain('已复制')
  })

  it('点击关闭按钮、遮罩按下或按 Esc 都关闭面板', async () => {
    const wrapper = mountPanel(plan())

    await findButton('关闭计划查看器')!.dispatchEvent(new Event('click'))
    expect(wrapper.emitted('close')).toHaveLength(1)

    await document.body.querySelector<HTMLElement>('.plan-viewer-backdrop')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(2)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('en-US 语言下面板文案切换为英文', async () => {
    const previous = rendererLocale()
    document.body.replaceChildren()
    setRendererLocale('en-US')
    try {
      mountPanel(approvedPlan())
      /* MutationObserver 回调用微任务落地，等待刷新再断言 */
      await Promise.resolve()
      await Promise.resolve()
      expect(dialog()!.textContent).toContain('Full plan')
      expect(dialog()!.textContent).toContain('Approved')
      expect(dialog()!.textContent).toContain('Send feedback')
    } finally {
      setRendererLocale(previous)
    }
  })
})

describe('workbench Plan 查看面板状态', () => {
  it('openPlanReview 保存克隆并 closePlanReview 清空', () => {
    setActivePinia(createPinia())
    const store = useWorkbenchStore()
    store.openPlanReview(approvedPlan())
    expect(store.planReview?.plan).toBe('1. 先读 README\n2. 再改 App.vue\n3. 跑测试')
    expect(store.planReview?.review?.state).toBe('approved')

    store.closePlanReview()
    expect(store.planReview).toBeNull()
  })

  it('重新加载 transcript 时关闭已打开的面板', () => {
    setActivePinia(createPinia())
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    store.openPlanReview(plan({ plan: '一份简短的计划' }))
    expect(store.planReview).not.toBeNull()

    store.markTranscriptLoading('session-1')
    expect(store.planReview).toBeNull()
  })

  it('tool part 携带 plan 时投影到活动条目的 plan 字段', () => {
    setActivePinia(createPinia())
    const store = useWorkbenchStore()
    store.activeSessionId = 'session-1'
    const state: SessionViewState = sessionState()
    state.messages = [{
      id: 'message-plan',
      sessionId: 'session-1',
      role: 'assistant',
      content: [{ type: 'tool', toolCallId: 'plan-tool-1', toolName: 'Plan', state: 'done', plan: plan({ plan: '一份简短的计划' }) }],
      createdAt: '2026-07-23T01:02:00.000Z',
      promptId: 'prompt-1',
      status: 'completed'
    }]
    store.hydrateTranscript(state)

    const block = store.turns[0]?.blocks[0]
    expect(block?.type === 'activity' ? block.activity.plan?.plan : undefined).toBe('一份简短的计划')
  })
})

describe('ActivityBlock plan 入口', () => {
  it('带 plan 的活动展示「查看计划」并派发 open-plan', async () => {
    const review = approvedPlan()
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'plan-1',
          kind: 'tool',
          label: 'Plan',
          description: 'docs/plan.md · 先读 README',
          status: 'done',
          plan: review
        }
      }
    })

    const button = wrapper.get('.activity-plan-open')
    expect(button.text()).toContain('查看计划')
    await button.trigger('click')
    expect(wrapper.emitted('open-plan')).toEqual([[review]])
  })

  it('普通工具活动不渲染 plan 入口', () => {
    const wrapper = mount(ActivityBlock, {
      props: {
        activity: {
          id: 'tool-1', kind: 'tool', label: 'Bash', description: 'pnpm test', status: 'done'
        }
      }
    })
    expect(wrapper.find('.activity-plan-open').exists()).toBe(false)
  })
})

function sessionState(): SessionViewState {
  return {
    sessionId: 'session-1',
    title: 'Real session',
    workspaceRoot: '/tmp/project',
    busy: false,
    mainTurnActive: false,
    activePromptId: null,
    activePromptStatus: null,
    phase: 'ready',
    cursor: { seq: 12, epoch: 'epoch-1' },
    messages: [],
    markers: [],
    todos: [],
    sideChat: null,
    pendingApprovals: [],
    pendingQuestions: [],
    agents: [],
    usage: {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
      totalCostUsd: null, contextTokens: 0, contextLimit: 0, turnCount: null
    },
    hasMoreMessages: false,
    resyncCount: 0,
    unknownEventCount: 0,
    error: null,
    lastTurnReason: null,
    lastTurnError: null,
    retry: null,
    skillActivations: []
  }
}
