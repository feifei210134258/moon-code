// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TopBar from '../../src/renderer/src/components/TopBar.vue'
import type { KimiUsageState, SessionUsageSummary } from '../../src/shared/contracts.js'

const usage: KimiUsageState = {
  phase: 'ready',
  summary: { key: 'summary:plan', label: 'Plan', used: 82, limit: 100, ratio: 0.82, resetHint: '2 天后重置' },
  limits: [{ key: 'limit:5h', label: '5h window', used: 41, limit: 100, ratio: 0.41, resetHint: '1 小时后重置' }],
  extraUsage: {
    balanceCents: 1840, totalCents: 5000, monthlyChargeLimitEnabled: true,
    monthlyChargeLimitCents: 2000, monthlyUsedCents: 620, currency: 'CNY'
  },
  updatedAt: new Date().toISOString(), nextRefreshAt: null, refreshing: false,
  source: 'kimi-oauth-usage', error: null,
  preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
}

const sessionUsage: SessionUsageSummary = {
  inputTokens: 42_100, outputTokens: 8_700, cacheReadTokens: 12_000, cacheCreationTokens: 500,
  totalCostUsd: 0.2, contextTokens: 165_000, contextLimit: 262_000, turnCount: 12
}

describe('TopBar usage', () => {
  it('separates Context from Kimi plan usage and wires the actionable navigation controls', async () => {
    const wrapper = mount(TopBar, {
      props: {
        runtimeLabel: 'Kimi 0.29.0', runtimeStatus: 'running', runtimePending: false,
        workspaceName: 'Kimi Agent', gitBranch: 'main', usage, sessionUsage,
        contextOpen: true, usageOpen: false, extensionsOpen: true
      }
    })

    expect(wrapper.text()).toContain('82%')
    expect(wrapper.get('.context-popover').text()).toContain('上下文窗口')
    expect(wrapper.text()).toContain('输入')
    expect(wrapper.text()).toContain('费用')
    expect(wrapper.text()).toContain('轮次')
    expect(wrapper.text()).toContain('上下文')
    expect(wrapper.find('.usage-popover').exists()).toBe(false)

    await wrapper.get('[aria-label="选择项目文件夹"]').trigger('click')
    expect(wrapper.emitted('chooseWorkspace')).toEqual([[]])
    await wrapper.get('[aria-label="收起扩展栏"]').trigger('click')
    expect(wrapper.emitted('toggleExtensions')).toEqual([[]])
    await wrapper.get('[aria-label="查看上下文窗口"]').trigger('click')
    expect(wrapper.emitted('toggleContext')).toEqual([[]])

    await wrapper.setProps({ contextOpen: false, usageOpen: true })
    expect(wrapper.get('.usage-popover').text()).toContain('额外用量')
    expect(wrapper.get('.usage-popover').text()).toContain('套餐总量')
    expect(wrapper.get('.usage-popover').text()).toContain('余额')
    expect(wrapper.get('.usage-popover').text()).toContain('准实时轮询')

    await wrapper.get('[aria-label="查看 Kimi 套餐用量"]').trigger('click')
    expect(wrapper.emitted('toggleUsage')).toHaveLength(1)
    await wrapper.get('[aria-label="刷新用量"]').trigger('click')
    expect(wrapper.emitted('refreshUsage')).toHaveLength(1)
  })

  it('keeps English reset hint on the pill but localizes the popover to Chinese', () => {
    const englishUsage: KimiUsageState = {
      ...usage,
      summary: { key: 'summary:plan', label: 'Plan usage', used: 82, limit: 100, ratio: 0.82, resetHint: 'resets in 5d 20h 5m' },
      limits: [{ key: 'limit:5h', label: '5h window', used: 41, limit: 100, ratio: 0.41, resetHint: 'resets in 1h 12m' }]
    }
    const wrapper = mount(TopBar, {
      props: {
        runtimeLabel: 'Kimi 0.29.0', runtimeStatus: 'running', runtimePending: false,
        workspaceName: 'Kimi Agent', gitBranch: 'main', usage: englishUsage, sessionUsage,
        contextOpen: false, usageOpen: true, extensionsOpen: true
      }
    })

    /* 胶囊按钮保留服务端英文原文 */
    const pill = wrapper.get('.usage-pill.plan-usage').text()
    expect(pill).toContain('resets in 5d 20h 5m')
    /* 弹窗内部一律中文 */
    const popover = wrapper.get('.usage-popover').text()
    expect(popover).toContain('套餐总量')
    expect(popover).toContain('5 小时窗口')
    expect(popover).toContain('5 天 20 小时 5 分钟后重置')
    expect(popover).toContain('1 小时 12 分钟后重置')
    expect(popover).not.toContain('resets in')
  })

  it('keeps the compact icon in the context strip and undo inside the popover', async () => {
    const wrapper = mount(TopBar, {
      props: {
        runtimeLabel: 'Kimi 0.29.0', runtimeStatus: 'running', runtimePending: false,
        workspaceName: 'Kimi Agent', gitBranch: 'main', usage, sessionUsage,
        contextOpen: true, usageOpen: false, extensionsOpen: true,
        sessionReady: true, promptRunning: false, hasTurns: true, conversationActionPending: null
      }
    })

    const compactButton = wrapper.get('[aria-label="压缩当前会话上下文"]')
    expect(compactButton.element.closest('.context-meter')).not.toBeNull()
    expect(compactButton.attributes('title')).toBe('压缩上下文')
    expect(wrapper.get('[role="tooltip"]').text()).toBe('压缩上下文')
    expect(wrapper.find('.context-popover .context-compact-button').exists()).toBe(false)
    await compactButton.trigger('click')
    expect(wrapper.emitted('compact')).toEqual([[]])

    const undoButton = wrapper.get('.context-action-row > button')
    expect(undoButton.text()).toContain('撤销上一轮')
    await undoButton.trigger('click')
    expect(wrapper.emitted('undo')).toEqual([[]])

    await wrapper.setProps({ promptRunning: true })
    expect((wrapper.get('[aria-label="压缩当前会话上下文"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('does not fake progress and explains unavailable Context and plan data', async () => {
    const unavailableUsage: KimiUsageState = {
      ...usage,
      phase: 'unavailable',
      summary: null,
      limits: [],
      extraUsage: null,
      updatedAt: null,
      error: '尚未登录 Kimi'
    }
    const wrapper = mount(TopBar, {
      props: {
        runtimeLabel: 'Kimi 未连接', runtimeStatus: 'stopped', runtimePending: false,
        workspaceName: 'Kimi Agent', gitBranch: 'main', usage: unavailableUsage, sessionUsage: null,
        contextOpen: true, usageOpen: false, extensionsOpen: true
      }
    })

    expect(wrapper.find('.context-meter .usage-track > span').exists()).toBe(false)
    expect(wrapper.get('.context-popover').text()).toContain('暂无上下文数据')
    expect(wrapper.get('.context-popover').text()).not.toContain('0 / 0')

    await wrapper.setProps({ contextOpen: false, usageOpen: true })
    expect(wrapper.get('.usage-popover').text()).toContain('暂无套餐数据')
    expect(wrapper.get('.usage-popover').text()).toContain('尚未登录 Kimi')
  })
})
