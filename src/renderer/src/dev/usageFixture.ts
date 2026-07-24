import type { KimiUsageState, SessionUsageSummary } from '@shared/contracts'

export const usageFixtureState: KimiUsageState = {
  phase: 'ready',
  summary: { key: 'summary:plan', label: 'Plan usage', used: 82, limit: 100, ratio: 0.82, resetHint: '2 天 6 小时后重置' },
  limits: [{ key: 'limit:5h', label: '5h window', used: 41, limit: 100, ratio: 0.41, resetHint: '1 小时 12 分后重置' }],
  extraUsage: {
    balanceCents: 1840,
    totalCents: 5000,
    monthlyChargeLimitEnabled: true,
    monthlyChargeLimitCents: 2000,
    monthlyUsedCents: 620,
    currency: 'CNY'
  },
  updatedAt: new Date().toISOString(),
  nextRefreshAt: new Date(Date.now() + 30_000).toISOString(),
  refreshing: false,
  source: 'kimi-oauth-usage',
  error: null,
  preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
}

export const sessionUsageFixture: SessionUsageSummary = {
  inputTokens: 42_100,
  outputTokens: 8_700,
  cacheReadTokens: 12_000,
  cacheCreationTokens: 500,
  totalCostUsd: 0.2,
  contextTokens: 165_000,
  contextLimit: 262_000,
  turnCount: 12
}
