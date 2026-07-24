<script setup lang="ts">
import { computed } from 'vue'
import {
  PhCaretDown,
  PhFolderSimple,
  PhGitBranch,
  PhSidebarSimple,
  PhArrowClockwise
} from '@phosphor-icons/vue'
import type { KimiPlanUsageWindow, KimiUsageState, RuntimeStatus, SessionUsageSummary } from '@shared/contracts'
import { rendererLocale } from '../i18n/rendererLocale'

const props = defineProps<{
  runtimeLabel: string
  runtimeStatus: RuntimeStatus
  runtimePending: boolean
  workspaceName: string
  gitBranch: string | null
  usage: KimiUsageState
  sessionUsage: SessionUsageSummary | null
  contextOpen: boolean
  usageOpen: boolean
  extensionsOpen: boolean
}>()

defineEmits<{
  toggleRuntime: []
  chooseWorkspace: []
  toggleContext: []
  toggleUsage: []
  toggleExtensions: []
  refreshUsage: []
}>()

const contextRatio = computed(() => {
  const usage = props.sessionUsage
  return usage === null || usage.contextLimit <= 0
    ? null
    : Math.max(0, Math.min(1, usage.contextTokens / usage.contextLimit))
})

const tightestWindow = computed<KimiPlanUsageWindow | null>(() => {
  const windows = [props.usage.summary, ...props.usage.limits].filter(
    (window): window is KimiPlanUsageWindow => window !== null && window.ratio !== null
  )
  return windows.sort((left, right) => (right.ratio ?? 0) - (left.ratio ?? 0))[0] ?? null
})
const usageWindows = computed(() => [props.usage.summary, ...props.usage.limits].filter(
  (window): window is KimiPlanUsageWindow => window !== null
))

function percent(value: number | null): string {
  return value === null ? '--' : `${Math.round(value * 100)}%`
}

function usageTone(value: number | null): string | null {
  if (value === null) return null
  if (value >= props.usage.preferences.criticalThreshold) return 'is-critical'
  if (value >= props.usage.preferences.warningThreshold) return 'is-warning'
  if (value >= props.usage.preferences.infoThreshold) return 'is-info'
  return null
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(rendererLocale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(rendererLocale(), { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`
  }
}

function usd(value: number): string {
  return new Intl.NumberFormat(rendererLocale(), { style: 'currency', currency: 'USD' }).format(value)
}

function updatedLabel(value: string | null): string {
  if (value === null) return '尚未更新'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1_000))
  if (seconds < 60) return `${seconds} 秒前更新`
  return `${Math.round(seconds / 60)} 分钟前更新`
}
</script>

<template>
  <header class="topbar">
    <div class="brand-lockup">
      <span class="brand-name">Moon Code</span>
    </div>

    <div class="topbar-context">
      <button class="topbar-item" type="button" aria-label="选择项目文件夹" @click="$emit('chooseWorkspace')">
        <PhFolderSimple :size="17" weight="regular" />
        <span>{{ workspaceName }}</span>
        <PhCaretDown :size="12" />
      </button>
      <span class="topbar-divider" />
      <span class="topbar-item topbar-readout" :title="gitBranch || '非 Git 项目'">
        <PhGitBranch :size="17" />
        <span>{{ gitBranch || '非 Git 项目' }}</span>
      </span>
      <span class="topbar-divider" />
      <button
        class="runtime-status topbar-item"
        :class="`is-${runtimeStatus}`"
        type="button"
        :disabled="runtimePending"
        @click="$emit('toggleRuntime')"
      >
        <span class="status-dot" />
        <span>{{ runtimeLabel }}</span>
      </button>
    </div>

    <div class="topbar-actions">
      <button class="usage-pill" :class="usageTone(contextRatio)" type="button" aria-label="查看 Context 用量" aria-controls="context-popover" :aria-expanded="contextOpen" @click="$emit('toggleContext')">
        <span>Context</span>
        <strong>{{ percent(contextRatio) }}</strong>
        <span class="usage-track"><span :style="{ width: percent(contextRatio) }" /></span>
      </button>
      <button class="usage-pill plan-usage" :class="usageTone(tightestWindow?.ratio ?? null)" type="button" aria-label="查看 Kimi 套餐用量" aria-controls="usage-popover" :aria-expanded="usageOpen" @click="$emit('toggleUsage')">
        <span>套餐</span>
        <strong>{{ percent(tightestWindow?.ratio ?? null) }}</strong>
        <span v-if="usage.phase === 'stale'" class="muted">· 已过期</span>
        <span v-else-if="tightestWindow?.resetHint" class="muted">· {{ tightestWindow.resetHint }}</span>
      </button>
      <button class="icon-button" type="button" :aria-label="extensionsOpen ? '收起扩展栏' : '展开扩展栏'" @click="$emit('toggleExtensions')">
        <PhSidebarSimple :size="19" />
      </button>
      <section v-if="contextOpen" id="context-popover" class="context-popover" aria-label="当前 Session Context 用量">
        <header class="usage-popover-header">
          <div>
            <strong>Context 窗口</strong>
            <span>当前 Session 的上下文占用</span>
          </div>
        </header>
        <div class="usage-section">
          <div class="usage-token-grid">
            <span>Input <strong>{{ compactNumber(sessionUsage?.inputTokens ?? 0) }}</strong></span>
            <span>Output <strong>{{ compactNumber(sessionUsage?.outputTokens ?? 0) }}</strong></span>
            <span>Cache read <strong>{{ compactNumber(sessionUsage?.cacheReadTokens ?? 0) }}</strong></span>
            <span>Cache create <strong>{{ compactNumber(sessionUsage?.cacheCreationTokens ?? 0) }}</strong></span>
            <span v-if="sessionUsage?.totalCostUsd !== null && sessionUsage?.totalCostUsd !== undefined">Cost <strong>{{ usd(sessionUsage.totalCostUsd) }}</strong></span>
            <span v-if="sessionUsage?.turnCount !== null && sessionUsage?.turnCount !== undefined">Turns <strong>{{ sessionUsage.turnCount }}</strong></span>
          </div>
          <div class="usage-context-row">
            <span>Context</span>
            <strong>{{ percent(contextRatio) }}</strong>
            <span>{{ compactNumber(sessionUsage?.contextTokens ?? 0) }} / {{ compactNumber(sessionUsage?.contextLimit ?? 0) }}</span>
          </div>
        </div>
      </section>
      <section v-if="usageOpen" id="usage-popover" class="usage-popover" aria-label="Kimi 用量详情">
        <header class="usage-popover-header">
          <div>
            <strong>Kimi 用量</strong>
            <span>套餐数据为准实时轮询</span>
          </div>
          <button class="icon-button" type="button" aria-label="刷新用量" :disabled="usage.refreshing" @click="$emit('refreshUsage')">
            <PhArrowClockwise :size="16" :class="{ 'is-spinning': usage.refreshing }" />
          </button>
        </header>

        <div v-if="usageWindows.length" class="usage-section">
          <span class="usage-section-label">套餐限额</span>
          <div v-for="window in usageWindows" :key="window.key" class="usage-detail-row">
            <div>
              <strong>{{ window.label }}</strong>
              <span>{{ compactNumber(window.used) }} / {{ compactNumber(window.limit) }}</span>
            </div>
            <div class="usage-detail-value">
              <strong>{{ percent(window.ratio) }}</strong>
              <span>{{ window.resetHint || '暂无重置时间' }}</span>
            </div>
          </div>
        </div>

        <div v-if="usage.extraUsage" class="usage-section">
          <span class="usage-section-label">Extra Usage</span>
          <div class="usage-detail-row">
            <div><strong>余额</strong><span>{{ money(usage.extraUsage.balanceCents, usage.extraUsage.currency) }}</span></div>
            <div class="usage-detail-value">
              <strong>本月已用 {{ money(usage.extraUsage.monthlyUsedCents, usage.extraUsage.currency) }}</strong>
              <span v-if="usage.extraUsage.monthlyChargeLimitEnabled">本月上限 {{ money(usage.extraUsage.monthlyChargeLimitCents, usage.extraUsage.currency) }}</span>
              <span v-else>未启用月度上限</span>
            </div>
          </div>
        </div>

        <footer class="usage-popover-footer" :class="{ 'is-stale': usage.phase === 'stale' || usage.phase === 'unavailable' }">
          <span>{{ updatedLabel(usage.updatedAt) }}</span>
          <span v-if="usage.error">{{ usage.error }}</span>
          <span v-else>数据源：Kimi `/oauth/usage`</span>
        </footer>
      </section>
    </div>
  </header>
</template>
