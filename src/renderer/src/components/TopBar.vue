<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  PhCaretDown,
  PhFolderSimple,
  PhGitBranch,
  PhSidebarSimple,
  PhArrowClockwise,
  PhArrowsInLineVertical,
  PhSpinnerGap,
  PhTerminalWindow
} from '@phosphor-icons/vue'
import type { KimiPlanUsageWindow, KimiUsageState, RuntimeStatus, SessionUsageSummary, WorkspaceGitBranches } from '@shared/contracts'
import { rendererLocale } from '../i18n/rendererLocale'

const props = defineProps<{
  runtimeLabel: string
  runtimeStatus: RuntimeStatus
  runtimePending: boolean
  workspaceName: string
  gitBranch: string | null
  gitBranches: WorkspaceGitBranches | null
  branchesOpen: boolean
  branchesPending?: boolean
  usage: KimiUsageState
  sessionUsage: SessionUsageSummary | null
  contextOpen: boolean
  usageOpen: boolean
  extensionsOpen: boolean
  terminalEnabled?: boolean
  terminalOpen?: boolean
  sessionReady?: boolean
  promptRunning?: boolean
  hasTurns?: boolean
  conversationActionPending?: 'compact' | 'undo' | null
}>()

// Keep 5h primary without making 7d feel like a flash. Warning windows stay pinned.
const PRIMARY_USAGE_DISPLAY_MS = 8_000
const WEEKLY_USAGE_DISPLAY_MS = 5_000

const emit = defineEmits<{
  toggleRuntime: []
  chooseWorkspace: []
  toggleBranches: []
  toggleContext: []
  toggleUsage: []
  toggleExtensions: []
  toggleTerminal: []
  refreshUsage: []
  compact: [instruction?: string]
  undo: []
}>()

const contextRatio = computed(() => {
  const usage = props.sessionUsage
  return usage === null || usage.contextLimit <= 0
    ? null
    : Math.max(0, Math.min(1, usage.contextTokens / usage.contextLimit))
})

const usageWindows = computed(() => [props.usage.summary, ...props.usage.limits].filter(
  (window): window is KimiPlanUsageWindow => window !== null
))

function isFiveHourWindow(window: KimiPlanUsageWindow): boolean {
  const value = `${window.key} ${window.label}`.toLocaleLowerCase()
  return /\b5\s*h(?:ours?)?\b|5\s*小时|5-hour/.test(value)
}

function isWeeklyWindow(window: KimiPlanUsageWindow): boolean {
  const value = `${window.key} ${window.label}`.toLocaleLowerCase()
  return /\b7\s*d(?:ays?)?\b|7\s*天|7-day|weekly|week/.test(value)
}

const primaryUsageWindow = computed<KimiPlanUsageWindow | null>(() =>
  usageWindows.value.find(isFiveHourWindow) ?? null
)
const weeklyUsageWindow = computed<KimiPlanUsageWindow | null>(() =>
  usageWindows.value.find(isWeeklyWindow) ?? null
)
const alertUsageWindow = computed<KimiPlanUsageWindow | null>(() => {
  const warningThreshold = props.usage.preferences.warningThreshold
  return [primaryUsageWindow.value, weeklyUsageWindow.value]
    .filter((window): window is KimiPlanUsageWindow => (
      window?.ratio !== null && window?.ratio !== undefined && window.ratio >= warningThreshold
    ))
    .sort((left, right) => (right.ratio ?? 0) - (left.ratio ?? 0))[0] ?? null
})
const usageDisplayMode = ref<'primary' | 'weekly'>(
  alertUsageWindow.value !== null && alertUsageWindow.value.key === weeklyUsageWindow.value?.key
    ? 'weekly'
    : 'primary'
)
const displayUsageWindow = computed<KimiPlanUsageWindow | null>(() =>
  usageDisplayMode.value === 'weekly'
    ? weeklyUsageWindow.value
    : primaryUsageWindow.value
)
const displayUsageLabel = computed(() =>
  usageDisplayMode.value === 'weekly' && weeklyUsageWindow.value !== null ? '7d用量' : '5h用量'
)
const displayUsageNotice = computed(() => {
  if (props.usage.phase === 'stale') return '· 已过期'
  const window = displayUsageWindow.value
  if (window !== null && window.key === alertUsageWindow.value?.key) {
    return window.ratio !== null && window.ratio >= props.usage.preferences.criticalThreshold
      ? '· 即将用尽'
      : '· 接近上限'
  }
  if (!window?.resetHint) return null
  const hint = Number.isNaN(Date.parse(window.resetHint))
    ? window.resetHint
    : resetHintLabel(window.resetHint)
  return `· ${hint}`
})
let usageDisplayTimer: ReturnType<typeof setTimeout> | null = null

function clearUsageDisplayTimer(): void {
  if (usageDisplayTimer !== null) clearTimeout(usageDisplayTimer)
  usageDisplayTimer = null
}

function scheduleUsageDisplay(): void {
  clearUsageDisplayTimer()
  const alertWindow = alertUsageWindow.value
  if (alertWindow !== null) {
    usageDisplayMode.value = alertWindow.key === weeklyUsageWindow.value?.key ? 'weekly' : 'primary'
    return
  }
  if (primaryUsageWindow.value === null || weeklyUsageWindow.value === null) {
    usageDisplayMode.value = 'primary'
    return
  }
  usageDisplayTimer = setTimeout(() => {
    usageDisplayMode.value = usageDisplayMode.value === 'primary' ? 'weekly' : 'primary'
    scheduleUsageDisplay()
  }, usageDisplayMode.value === 'primary' ? PRIMARY_USAGE_DISPLAY_MS : WEEKLY_USAGE_DISPLAY_MS)
}

onMounted(scheduleUsageDisplay)
onBeforeUnmount(clearUsageDisplayTimer)
watch([primaryUsageWindow, weeklyUsageWindow, alertUsageWindow], () => {
  scheduleUsageDisplay()
})

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

function usageWindowLabel(label: string): string {
  const normalized = label.trim().toLocaleLowerCase()
  if (normalized === 'plan' || normalized === 'plan usage') return '套餐总量'
  const hourWindow = /^(\d+)\s*h(?:\s*(?:window|limit))?$/.exec(normalized)
  if (hourWindow !== null) return `${hourWindow[1]} 小时窗口`
  const dayWindow = /^(\d+)\s*d(?:\s*(?:window|limit))?$/.exec(normalized)
  if (dayWindow !== null) return `${dayWindow[1]} 天窗口`
  if (/^daily/.test(normalized)) return '每日窗口'
  if (/^weekly/.test(normalized)) return '每周窗口'
  if (/^monthly/.test(normalized)) return '每月窗口'
  return label
}

/* 用量接口返回英文重置提示（如 "resets in 5d 20h 5m"），展示前换算成总秒数再格式化。 */
function resetHintLabel(hint: string): string {
  const resetAt = Date.parse(hint)
  if (!Number.isNaN(resetAt)) {
    const remainingSeconds = Math.max(0, Math.floor((resetAt - Date.now()) / 1_000))
    return remainingSeconds === 0 ? '即将重置' : `${resetDurationLabel(remainingSeconds)}后重置`
  }
  const body = /^resets?\s+in\s+(.+)$/i.exec(hint.trim())?.[1]
  if (body === undefined) return hint
  const unitSeconds: Record<string, number> = { s: 1, m: 60, h: 3_600, d: 86_400, w: 604_800 }
  let matched = false
  let totalSeconds = 0
  for (const part of body.matchAll(/(\d+)\s*([smhdw])\b/gi)) {
    matched = true
    totalSeconds += Number(part[1]) * (unitSeconds[(part[2] ?? '').toLowerCase()] ?? 0)
  }
  return matched ? `${resetDurationLabel(totalSeconds)}后重置` : hint
}

/* 紧凑倒计时：天/时/分最多三段，前导零单位省略（0 天不显示），不足一分钟显示“不到 1 分”。 */
function resetDurationLabel(totalSeconds: number): string {
  const units = [
    ['天', 86_400],
    ['时', 3_600],
    ['分', 60]
  ] as const
  let remaining = totalSeconds
  const parts: string[] = []
  for (const [label, seconds] of units) {
    const value = Math.floor(remaining / seconds)
    if (value > 0) parts.push(`${value}${label}`)
    remaining %= seconds
  }
  return parts.join('') || '不到 1 分'
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
      <button
        v-if="gitBranch !== null"
        class="topbar-item"
        type="button"
        title="查看分支"
        aria-controls="branch-popover"
        :aria-expanded="branchesOpen"
        @click="$emit('toggleBranches')"
      >
        <PhGitBranch :size="17" />
        <span>{{ gitBranch }}</span>
        <PhCaretDown :size="12" />
      </button>
      <span v-else class="topbar-item topbar-readout" title="非 Git 项目">
        <PhGitBranch :size="17" />
        <span>非 Git 项目</span>
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
      <section v-if="branchesOpen" id="branch-popover" class="branch-popover" aria-label="Git 分支列表">
        <header class="usage-popover-header">
          <div>
            <strong>本地分支</strong>
            <span>{{ gitBranches?.available === true ? `共 ${gitBranches.branches.length} 个` : '来自当前项目 Git' }}</span>
          </div>
        </header>
        <div v-if="gitBranches?.available === true && gitBranches.branches.length > 0" class="branch-list">
          <span
            v-for="branch in gitBranches.branches"
            :key="branch"
            class="branch-list-item"
            :class="{ 'is-current': branch === gitBranches.current }"
          >
            <PhGitBranch :size="14" />
            <span>{{ branch }}</span>
            <em v-if="branch === gitBranches.current">当前分支</em>
          </span>
        </div>
        <div v-else-if="branchesPending === true" class="branch-empty">正在读取分支…</div>
        <div v-else class="branch-empty">当前项目没有可用的 Git 分支。</div>
      </section>
    </div>

    <div class="topbar-actions">
      <div class="context-meter" :class="usageTone(contextRatio)">
        <button class="usage-pill context-pill" type="button" aria-label="查看上下文窗口" aria-controls="context-popover" :aria-expanded="contextOpen" @click="$emit('toggleContext')">
          <span>上下文</span>
          <strong>{{ percent(contextRatio) }}</strong>
          <span class="usage-track" :class="{ 'is-unavailable': contextRatio === null }">
            <span v-if="contextRatio !== null" :style="{ width: `${contextRatio * 100}%` }" />
          </span>
        </button>
        <span class="context-compact-control">
          <button
            class="context-compact-button"
            type="button"
            aria-label="压缩当前会话上下文"
            aria-describedby="context-compact-tooltip"
            title="压缩上下文"
            :disabled="sessionReady !== true || promptRunning === true || conversationActionPending != null"
            @click="emit('compact')"
          >
            <PhSpinnerGap v-if="conversationActionPending === 'compact'" class="spin" :size="14" />
            <PhArrowsInLineVertical v-else :size="15" />
          </button>
          <span id="context-compact-tooltip" class="context-compact-tooltip" role="tooltip">压缩上下文</span>
        </span>
      </div>
      <button class="usage-pill plan-usage" :class="usageTone(displayUsageWindow?.ratio ?? null)" type="button" :aria-label="`查看 Kimi ${displayUsageLabel}`" aria-controls="usage-popover" :aria-expanded="usageOpen" @click="$emit('toggleUsage')">
        <Transition name="usage-swap" mode="out-in">
          <span :key="`${usageDisplayMode}:${displayUsageWindow?.key ?? 'empty'}`" class="plan-usage-content">
            <span class="plan-usage-label">{{ displayUsageLabel }}</span>
            <strong>{{ percent(displayUsageWindow?.ratio ?? null) }}</strong>
            <span v-if="displayUsageNotice" class="muted">{{ displayUsageNotice }}</span>
          </span>
        </Transition>
      </button>
      <button
        class="icon-button terminal-toggle"
        type="button"
        :class="{ 'is-open': terminalOpen }"
        aria-label="打开终端"
        title="终端 · ⌘J"
        :aria-pressed="terminalOpen === true"
        :disabled="terminalEnabled !== true"
        @click="$emit('toggleTerminal')"
      >
        <PhTerminalWindow :size="19" :weight="terminalOpen === true ? 'fill' : 'regular'" />
      </button>
      <button
        class="icon-button extensions-toggle"
        type="button"
        :class="{ 'is-open': extensionsOpen }"
        :aria-label="extensionsOpen ? '收起扩展栏' : '展开扩展栏'"
        :aria-pressed="extensionsOpen"
        :title="extensionsOpen ? '收起扩展栏' : '展开扩展栏'"
        @click="$emit('toggleExtensions')"
      >
        <PhSidebarSimple :size="19" :weight="extensionsOpen ? 'fill' : 'regular'" />
      </button>
      <section v-if="contextOpen" id="context-popover" class="context-popover" aria-label="当前会话上下文用量">
        <header class="usage-popover-header">
          <div>
            <strong>上下文窗口</strong>
            <span>当前会话的上下文占用</span>
          </div>
        </header>
        <div v-if="sessionUsage !== null" class="usage-section">
          <div class="usage-token-grid">
            <span>输入 <strong>{{ compactNumber(sessionUsage?.inputTokens ?? 0) }}</strong></span>
            <span>输出 <strong>{{ compactNumber(sessionUsage?.outputTokens ?? 0) }}</strong></span>
            <span>缓存读取 <strong>{{ compactNumber(sessionUsage?.cacheReadTokens ?? 0) }}</strong></span>
            <span>缓存写入 <strong>{{ compactNumber(sessionUsage?.cacheCreationTokens ?? 0) }}</strong></span>
            <span v-if="sessionUsage?.totalCostUsd !== null && sessionUsage?.totalCostUsd !== undefined">费用 <strong>{{ usd(sessionUsage.totalCostUsd) }}</strong></span>
            <span v-if="sessionUsage?.turnCount !== null && sessionUsage?.turnCount !== undefined">轮次 <strong>{{ sessionUsage.turnCount }}</strong></span>
          </div>
          <div class="usage-context-row">
            <span>上下文</span>
            <strong>{{ percent(contextRatio) }}</strong>
            <span>{{ compactNumber(sessionUsage?.contextTokens ?? 0) }} / {{ compactNumber(sessionUsage?.contextLimit ?? 0) }}</span>
          </div>
        </div>
        <div v-else class="usage-section usage-empty-state">
          <strong>暂无上下文数据</strong>
          <span>连接 Kimi 并选择一个会话后，这里会显示真实占用。</span>
        </div>
        <div class="usage-section context-session-actions">
          <span class="usage-section-label">会话操作</span>
          <div class="context-action-row">
            <button
              type="button"
              :disabled="sessionReady !== true || promptRunning === true || conversationActionPending != null || hasTurns !== true"
              @click="emit('undo')"
            >
              <PhSpinnerGap v-if="conversationActionPending === 'undo'" class="spin" :size="13" />
              撤销上一轮
            </button>
          </div>
        </div>
      </section>
      <section v-if="usageOpen" id="usage-popover" class="usage-popover" aria-label="Kimi 用量详情">
        <header class="usage-popover-header">
          <div>
            <strong>Kimi 套餐用量</strong>
            <span>套餐数据为准实时轮询</span>
          </div>
          <button class="icon-button" type="button" aria-label="刷新用量" :disabled="usage.refreshing" @click="$emit('refreshUsage')">
            <PhArrowClockwise :size="16" :class="{ 'is-spinning': usage.refreshing }" />
          </button>
        </header>

        <div v-if="usageWindows.length" class="usage-section">
          <span class="usage-section-label">套餐限额</span>
          <div v-for="window in usageWindows" :key="window.key" class="usage-detail-row" :class="usageTone(window.ratio)">
            <div>
              <strong>{{ usageWindowLabel(window.label) }}</strong>
              <span>{{ compactNumber(window.used) }} / {{ compactNumber(window.limit) }}</span>
            </div>
            <div class="usage-detail-value">
              <strong>{{ percent(window.ratio) }}</strong>
              <span>{{ window.resetHint === null ? '暂无重置时间' : resetHintLabel(window.resetHint) }}</span>
            </div>
            <span class="usage-track usage-detail-track" :class="{ 'is-unavailable': window.ratio === null }">
              <span v-if="window.ratio !== null" :style="{ width: `${window.ratio * 100}%` }" />
            </span>
          </div>
        </div>

        <div v-if="usage.extraUsage" class="usage-section">
          <span class="usage-section-label">额外用量</span>
          <div class="usage-detail-row">
            <div><strong>余额</strong><span>{{ money(usage.extraUsage.balanceCents, usage.extraUsage.currency) }}</span></div>
            <div class="usage-detail-value">
              <strong>本月已用 {{ money(usage.extraUsage.monthlyUsedCents, usage.extraUsage.currency) }}</strong>
              <span v-if="usage.extraUsage.monthlyChargeLimitEnabled">本月上限 {{ money(usage.extraUsage.monthlyChargeLimitCents, usage.extraUsage.currency) }}</span>
              <span v-else>未启用月度上限</span>
            </div>
          </div>
        </div>

        <div v-if="usageWindows.length === 0 && !usage.extraUsage" class="usage-section usage-empty-state">
          <strong>暂无套餐数据</strong>
          <span>{{ usage.error || '刷新后仍无数据时，请检查 Kimi 登录与网络连接。' }}</span>
        </div>

        <footer class="usage-popover-footer" :class="{ 'is-stale': usage.phase === 'stale' || usage.phase === 'unavailable' }">
          <span>{{ updatedLabel(usage.updatedAt) }}</span>
          <span v-if="usage.error">{{ usage.error }}</span>
          <span v-else>数据来源：Kimi 用量接口</span>
        </footer>
      </section>
    </div>
  </header>
</template>
