// @vitest-environment happy-dom

import { reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { useTurnHealth, type TurnHealthInput } from '../../src/renderer/src/composables/useTurnHealth.js'
import { rendererLocale, setRendererLocale } from '../../src/renderer/src/i18n/rendererLocale.js'
import type { ChatTurn } from '../../src/renderer/src/types.js'

function userTurn(id: string, text: string): ChatTurn {
  return { id, role: 'user', author: 'You', time: '10:24', blocks: [{ id: `${id}:text:0`, type: 'text', text }] }
}

function assistantTurn(id: string, text: string): ChatTurn {
  return { id, role: 'assistant', author: 'Kimi', time: '10:25', blocks: [{ id: `${id}:text:0`, type: 'text', text }] }
}

function input(overrides: Partial<TurnHealthInput> = {}): TurnHealthInput {
  return {
    turns: [userTurn('turn-user-1', '实现一下登录页'), assistantTurn('turn-ai-1', '好的')],
    phase: 'ready',
    lastTurnReason: null,
    lastTurnError: null,
    retry: null,
    sessionBusy: false,
    draftActive: false,
    ...overrides
  }
}

describe('useTurnHealth 失败卡片状态', () => {
  it('lastTurnReason=failed 且会话空闲时展示失败卡片', () => {
    const health = useTurnHealth(reactive(input({ lastTurnReason: 'failed', lastTurnError: '401 (unauthorized)' })))
    expect(health.failedTurn.value).toBe(true)
    expect(health.failedReason.value).toBe('401 (unauthorized)')
  })

  it('手动取消（cancelled）不展示失败卡片', () => {
    const health = useTurnHealth(reactive(input({ lastTurnReason: 'cancelled' })))
    expect(health.failedTurn.value).toBe(false)
  })

  it('completed / null 不展示失败卡片', () => {
    expect(useTurnHealth(reactive(input({ lastTurnReason: 'completed' }))).failedTurn.value).toBe(false)
    expect(useTurnHealth(reactive(input({}))).failedTurn.value).toBe(false)
  })

  it('会话正在执行、草稿态或非 ready 阶段时不展示', () => {
    expect(useTurnHealth(reactive(input({ lastTurnReason: 'failed', sessionBusy: true }))).failedTurn.value).toBe(false)
    expect(useTurnHealth(reactive(input({ lastTurnReason: 'failed', draftActive: true }))).failedTurn.value).toBe(false)
    expect(useTurnHealth(reactive(input({ lastTurnReason: 'failed', phase: 'loading' }))).failedTurn.value).toBe(false)
  })

  it('失败卡片只在新的轮次结局覆盖后才消失', () => {
    const health = useTurnHealth(reactive(input({ lastTurnReason: 'failed', lastTurnError: 'boom' })))
    expect(health.failedTurn.value).toBe(true)
    health.failedTurn // no-op: 读取以建立对该 reader 的引用
    // 通过替换输入模拟新轮次完成
    const state = reactive(input({ lastTurnReason: 'failed', lastTurnError: 'boom' }))
    const next = useTurnHealth(state)
    state.lastTurnReason = 'completed'
    expect(next.failedTurn.value).toBe(false)
  })
})

describe('useTurnHealth 一键恢复', () => {
  it('提取最近一条用户 prompt 的文本用于重发', () => {
    const health = useTurnHealth(reactive(input({
      turns: [
        userTurn('turn-1', '第一行'),
        assistantTurn('turn-2', '已回复'),
        userTurn('turn-3', '再来一句，跨两行\n第二行')
      ],
      lastTurnReason: 'failed'
    })))
    expect(health.resumeText.value).toBe('再来一句，跨两行 第二行')
    expect(health.canResume.value).toBe(true)
  })

  it('最近用户消息纯附件（无文本）时不可恢复', () => {
    const attachmentTurn: ChatTurn = {
      id: 'turn-attach', role: 'user', author: 'You', time: '10:24',
      blocks: [{ id: 'turn-attach:file:0', type: 'attachment', fileId: 'f1', name: 'a.png', mediaType: 'image/png', size: 10 }]
    }
    const health = useTurnHealth(reactive(input({ turns: [attachmentTurn], lastTurnReason: 'failed' })))
    expect(health.resumeText.value).toBe('')
    expect(health.canResume.value).toBe(false)
  })
})

describe('useTurnHealth 重试指示', () => {
  it('retry 非空时输出本地化标签与 provider 错误摘要', () => {
    const health = useTurnHealth(reactive(input({
      retry: { failedAttempt: 2, nextAttempt: 3, maxAttempts: 5, delayMs: 4000, errorName: 'ProviderOverloaded', errorMessage: 'the model is overloaded, please retry' }
    })))
    expect(health.retryActive.value).toBe(true)
    expect(health.retryLabel.value).toBe('重试中 (attempt 3/5)')
    expect(health.retryError.value).toBe('the model is overloaded, please retry')
  })

  it('en-US 语言下标签切换为英文', () => {
    const previous = rendererLocale()
    setRendererLocale('en-US')
    try {
      const health = useTurnHealth(reactive(input({
        retry: { failedAttempt: 1, nextAttempt: 2, maxAttempts: 3, delayMs: 2000, errorName: null, errorMessage: 'boom' }
      })))
      expect(health.retryLabel.value).toBe('Retrying (attempt 2/3)')
    } finally {
      setRendererLocale(previous)
    }
  })

  it('没有重试进度时不渲染指示', () => {
    const health = useTurnHealth(reactive(input({})))
    expect(health.retryActive.value).toBe(false)
    expect(health.retryLabel.value).toBeNull()
    expect(health.retryError.value).toBeNull()
  })

  it('非 ready 阶段不渲染重试指示', () => {
    const health = useTurnHealth(reactive(input({ phase: 'loading', retry: { failedAttempt: 1, nextAttempt: 2, maxAttempts: 3, delayMs: 1, errorName: null, errorMessage: 'x' } })))
    expect(health.retryActive.value).toBe(false)
  })
})
