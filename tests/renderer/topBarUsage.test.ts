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
  it('keeps plan, Extra Usage, Session tokens and Context visibly separate', async () => {
    const wrapper = mount(TopBar, {
      props: {
        runtimeLabel: 'Kimi 0.29.0', runtimeStatus: 'running', runtimePending: false,
        workspaceName: 'Kimi Agent', gitBranch: 'main', usage, sessionUsage, usageOpen: true
      }
    })

    expect(wrapper.text()).toContain('82%')
    expect(wrapper.text()).toContain('Extra Usage')
    expect(wrapper.text()).toContain('余额')
    expect(wrapper.text()).toContain('Input')
    expect(wrapper.text()).toContain('Cost')
    expect(wrapper.text()).toContain('Turns')
    expect(wrapper.text()).toContain('Context')
    expect(wrapper.text()).toContain('准实时轮询')

    await wrapper.get('[aria-label="查看 Kimi 套餐用量"]').trigger('click')
    expect(wrapper.emitted('toggleUsage')).toHaveLength(1)
    await wrapper.get('[aria-label="刷新用量"]').trigger('click')
    expect(wrapper.emitted('refreshUsage')).toHaveLength(1)
  })
})
