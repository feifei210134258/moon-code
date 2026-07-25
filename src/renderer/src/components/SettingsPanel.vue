<script setup lang="ts">
import {
  PhArchive,
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhCheck,
  PhCpu,
  PhChartDonut,
  PhGearSix,
  PhKey,
  PhMagicWand,
  PhPlugsConnected,
  PhSignOut,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  KimiOAuthFlow,
  KimiMcpServer,
  KimiPreferencesPatch,
  KimiSettingsSnapshot,
  KimiSkill,
  KimiTool,
  KimiUsagePreferences,
  KimiUsageState,
  SessionNavigationItem
} from '@shared/contracts'

const props = defineProps<{
  open: boolean
  runtimeRunning: boolean
  activeSessionId: string
  activeWorkspaceId: string
  usage: KimiUsageState
  configRevision?: number | undefined
}>()

const emit = defineEmits<{ close: []; sessionRestored: [sessionId: string] }>()

type SettingsTab = 'account' | 'models' | 'skills' | 'tools' | 'usage' | 'archives' | 'general'
const activeTab = ref<SettingsTab>('account')
const snapshot = ref<KimiSettingsSnapshot | null>(null)
const pending = ref(false)
const actionPending = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const oauthFlow = ref<KimiOAuthFlow | null>(null)
const skills = ref<KimiSkill[]>([])
const tools = ref<KimiTool[]>([])
const mcpServers = ref<KimiMcpServer[]>([])
const capabilitiesPending = ref(false)
const archivedSessions = ref<SessionNavigationItem[]>([])
const archivesPending = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let oauthGeneration = 0
let capabilitiesGeneration = 0

const managedProviderName = computed(() =>
  snapshot.value?.auth.managedProvider?.name ?? 'managed:kimi-code'
)
const accountStatusLabel = computed(() => {
  const status = snapshot.value?.auth.managedProvider?.status
  if (status === 'authenticated') return '已登录'
  if (status === 'expired') return '登录已过期'
  if (status === 'revoked') return '授权已撤销'
  return '未登录'
})

async function loadSettings(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || !props.runtimeRunning) return
  pending.value = true
  error.value = null
  try {
    snapshot.value = await api.getKimiSettings()
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    pending.value = false
  }
}

async function loadCapabilityTab(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || !props.runtimeRunning || (activeTab.value !== 'skills' && activeTab.value !== 'tools')) return
  const generation = ++capabilitiesGeneration
  capabilitiesPending.value = true
  error.value = null
  try {
    if (activeTab.value === 'skills') {
      const result = props.activeSessionId.length > 0
        ? await api.listSessionSkills(props.activeSessionId)
        : props.activeWorkspaceId.length > 0
          ? await api.listWorkspaceSkills(props.activeWorkspaceId)
          : []
      if (generation === capabilitiesGeneration) skills.value = result
    } else {
      const [nextServers, nextTools] = await Promise.all([
        api.listMcpServers(),
        api.listKimiTools(props.activeSessionId.length > 0 ? props.activeSessionId : undefined)
      ])
      if (generation === capabilitiesGeneration) {
        mcpServers.value = nextServers
        tools.value = nextTools
      }
    }
  } catch (reason) {
    if (generation === capabilitiesGeneration) error.value = errorMessage(reason)
  } finally {
    if (generation === capabilitiesGeneration) capabilitiesPending.value = false
  }
}

async function loadArchivedSessions(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || !props.runtimeRunning || activeTab.value !== 'archives') return
  archivesPending.value = true
  error.value = null
  try {
    archivedSessions.value = await api.listArchivedSessions()
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    archivesPending.value = false
  }
}

async function restoreSession(sessionId: string): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = `session:restore:${sessionId}`
  error.value = null
  notice.value = null
  try {
    const restored = await api.restoreSession(sessionId)
    archivedSessions.value = archivedSessions.value.filter((session) => session.id !== sessionId)
    notice.value = '任务已恢复到原项目。'
    emit('sessionRestored', restored.sessionId)
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

function archivedTime(value: string | null): string {
  if (value === null) return '时间未知'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString(props.usage.preferences.locale ?? 'zh-CN')
}

async function restartMcpServer(serverId: string): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = `mcp:${serverId}`
  error.value = null
  notice.value = null
  try {
    await api.restartMcpServer(serverId)
    await loadCapabilityTab()
    const status = mcpServers.value.find((server) => server.id === serverId)?.status
    notice.value = `已请求 Kimi 重启 MCP Server ${serverId}${status === undefined ? '' : `；当前状态：${status}`}。`
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function setDefaultModel(modelId: string): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = `model:${modelId}`
  error.value = null
  notice.value = null
  try {
    snapshot.value = await api.setDefaultModel(modelId)
    notice.value = '默认模型已更新；现有 Session 仍保持自己的模型。'
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function refreshModels(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = 'refresh:models'
  error.value = null
  notice.value = null
  try {
    const result = await api.refreshKimiProviders({ scope: 'oauth' })
    await loadSettings()
    const changed = result.changed.reduce((count, item) => count + item.added + item.removed, 0)
    notice.value = result.failed.length > 0
      ? 'Kimi 模型目录刷新失败，请稍后重试。'
      : `模型目录已刷新${changed > 0 ? `，共 ${changed} 项变化` : '，没有变化'}。`
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function updatePreference(patch: KimiPreferencesPatch): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || snapshot.value === null || actionPending.value !== null) return
  actionPending.value = 'preferences'
  error.value = null
  try {
    snapshot.value = {
      ...snapshot.value,
      preferences: await api.updateKimiPreferences(patch)
    }
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function updateUsagePreference(patch: Partial<KimiUsagePreferences>): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = 'usage-preferences'
  error.value = null
  notice.value = null
  try {
    await api.updateKimiUsagePreferences({ ...props.usage.preferences, ...patch })
    notice.value = 'petEnabled' in patch
      ? '宠物设置已保存在本机。'
      : '用量阈值已保存在本机；不会修改 Kimi 套餐数据。'
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

function thresholdFromEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value) / 100
}

function usageUpdatedLabel(value: string | null): string {
  return value === null ? '尚无成功数据' : new Date(value).toLocaleString(props.usage.preferences.locale ?? 'zh-CN')
}

async function startOAuthLogin(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  actionPending.value = 'oauth:start'
  const generation = ++oauthGeneration
  error.value = null
  notice.value = null
  try {
    const flow = await api.startOAuthLogin(managedProviderName.value)
    if (generation !== oauthGeneration || !props.open) return
    oauthFlow.value = flow
    if (oauthFlow.value.status === 'authenticated') {
      notice.value = 'Kimi 账号已登录。'
      await loadSettings()
    } else {
      scheduleOAuthPoll(oauthFlow.value)
    }
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function pollOAuthLogin(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || !props.open) return
  const generation = oauthGeneration
  try {
    const flow = await api.pollOAuthLogin(managedProviderName.value)
    if (generation !== oauthGeneration || !props.open) return
    oauthFlow.value = flow
    if (flow?.status === 'pending') scheduleOAuthPoll(flow)
    else if (flow?.status === 'authenticated') {
      notice.value = '登录成功，Kimi 已刷新可用模型。'
      await loadSettings()
    } else if (flow !== null) {
      error.value = flow.errorMessage ?? `登录流程已结束：${flow.status}`
    }
  } catch (reason) {
    error.value = errorMessage(reason)
  }
}

async function cancelOAuthLogin(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined) return
  oauthGeneration += 1
  clearOAuthPoll()
  actionPending.value = 'oauth:cancel'
  try {
    await api.cancelOAuthLogin(managedProviderName.value)
    oauthFlow.value = null
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function logoutOAuth(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  oauthGeneration += 1
  actionPending.value = 'oauth:logout'
  error.value = null
  try {
    await api.logoutOAuth(managedProviderName.value)
    oauthFlow.value = null
    await loadSettings()
    notice.value = 'Kimi 账号已退出。'
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

function scheduleOAuthPoll(flow: KimiOAuthFlow): void {
  clearOAuthPoll()
  pollTimer = setTimeout(() => void pollOAuthLogin(), Math.max(1_000, (flow.interval ?? 5) * 1_000))
}

function clearOAuthPoll(): void {
  if (pollTimer !== null) clearTimeout(pollTimer)
  pollTimer = null
}

function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => [props.open, props.runtimeRunning] as const,
  ([open, running]) => {
    if (!open) {
      oauthGeneration += 1
      clearOAuthPoll()
      return
    }
    if (running) {
      void loadSettings()
      void loadCapabilityTab()
      void loadArchivedSessions()
    }
  },
  { immediate: true }
)

watch(
  [activeTab, () => props.activeSessionId, () => props.activeWorkspaceId],
  () => {
    if (props.open) {
      void loadCapabilityTab()
      void loadArchivedSessions()
    }
  }
)

watch(
  () => props.configRevision,
  () => {
    if (!props.open || actionPending.value !== null) return
    void loadSettings()
    void loadCapabilityTab()
  }
)

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.open) return
  event.preventDefault()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  clearOAuthPoll()
  window.removeEventListener('keydown', onWindowKeydown)
})

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-backdrop" @click.self="emit('close')" @keydown="onDialogKeydown">
      <section class="settings-panel glass-panel" role="dialog" aria-modal="true" aria-label="Moon Code 设置">
        <header class="settings-header">
          <div><PhGearSix :size="19" /><strong>设置</strong></div>
          <button type="button" aria-label="关闭设置" @click="emit('close')"><PhX :size="17" /></button>
        </header>

        <div class="settings-layout">
          <nav class="settings-nav" aria-label="设置分类">
            <button :class="{ 'is-active': activeTab === 'account' }" type="button" @click="activeTab = 'account'">
              <PhKey :size="17" />账号
            </button>
            <button :class="{ 'is-active': activeTab === 'models' }" type="button" @click="activeTab = 'models'">
              <PhCpu :size="17" />模型
            </button>
            <button :class="{ 'is-active': activeTab === 'skills' }" type="button" @click="activeTab = 'skills'">
              <PhMagicWand :size="17" />Skills
            </button>
            <button :class="{ 'is-active': activeTab === 'tools' }" type="button" @click="activeTab = 'tools'">
              <PhPlugsConnected :size="17" />MCP 与工具
            </button>
            <button :class="{ 'is-active': activeTab === 'usage' }" type="button" @click="activeTab = 'usage'">
              <PhChartDonut :size="17" />用量
            </button>
            <button :class="{ 'is-active': activeTab === 'archives' }" type="button" @click="activeTab = 'archives'">
              <PhArchive :size="17" />已归档任务
            </button>
            <button :class="{ 'is-active': activeTab === 'general' }" type="button" @click="activeTab = 'general'">
              <PhGearSix :size="17" />通用
            </button>
          </nav>

          <div class="settings-content">
            <div v-if="!runtimeRunning" class="settings-empty">
              <strong>需要先连接 Kimi Runtime</strong>
              <span>设置直接来自 Kimi，不会读取或维护第二份配置。</span>
            </div>
            <div v-else-if="pending && snapshot === null" class="settings-empty">
              <PhSpinnerGap class="spin" :size="20" /><span>正在读取 Kimi 设置…</span>
            </div>

            <template v-else-if="snapshot">
              <section v-if="activeTab === 'account'" class="settings-section">
                <div class="settings-title"><div><h2>Kimi 账号</h2><p>使用官方 device-code 登录流程。</p></div></div>
                <div class="settings-row account-row">
                  <div><strong>{{ managedProviderName }}</strong><span>{{ accountStatusLabel }}</span></div>
                  <button
                    v-if="snapshot.auth.managedProvider?.status === 'authenticated'"
                    class="secondary-button"
                    type="button"
                    :disabled="actionPending !== null"
                    @click="logoutOAuth"
                  ><PhSignOut :size="15" />退出登录</button>
                  <button
                    v-else
                    class="primary-button"
                    type="button"
                    :disabled="actionPending !== null"
                    @click="startOAuthLogin"
                  >登录 Kimi</button>
                </div>
                <div v-if="oauthFlow?.status === 'pending'" class="oauth-device-panel">
                  <span>在浏览器完成授权</span>
                  <strong>{{ oauthFlow.userCode }}</strong>
                  <a
                    v-if="oauthFlow.verificationUriComplete"
                    :href="oauthFlow.verificationUriComplete"
                    target="_blank"
                    rel="noopener noreferrer"
                  >打开 Kimi 授权页</a>
                  <button type="button" @click="cancelOAuthLogin">取消登录</button>
                </div>
              </section>

              <section v-else-if="activeTab === 'models'" class="settings-section">
                <div class="settings-title">
                  <div><h2>默认模型</h2><p>影响新 Session；已有 Session 保留自己的模型。</p></div>
                  <button class="icon-text-button" type="button" :disabled="actionPending !== null" @click="refreshModels">
                    <PhArrowClockwise :class="{ spin: actionPending?.startsWith('refresh:') }" :size="15" />刷新目录
                  </button>
                </div>
                <div class="model-list">
                  <button
                    v-for="model in snapshot.models"
                    :key="model.id"
                    class="model-row"
                    :class="{ 'is-selected': snapshot.preferences.defaultModel === model.id }"
                    type="button"
                    :disabled="actionPending !== null"
                    @click="setDefaultModel(model.id)"
                  >
                    <span class="model-check"><PhCheck v-if="snapshot.preferences.defaultModel === model.id" :size="13" /></span>
                    <span><strong>{{ model.displayName }}</strong><small>{{ model.id }} · {{ model.providerId }}</small></span>
                    <small>{{ Math.round(model.maxContextSize / 1024) }}k context</small>
                  </button>
                </div>
              </section>

              <section v-else-if="activeTab === 'skills'" class="settings-section">
                <div class="settings-title">
                  <div>
                    <h2>Skills</h2>
                    <p>{{ activeSessionId ? '来自当前 Session 的真实 Skill 目录。' : '当前没有 Session，显示 Workspace 可用 Skill。' }}</p>
                  </div>
                  <button class="icon-text-button" type="button" :disabled="capabilitiesPending" @click="loadCapabilityTab">
                    <PhArrowClockwise :class="{ spin: capabilitiesPending }" :size="15" />刷新
                  </button>
                </div>
                <div v-if="capabilitiesPending && skills.length === 0" class="settings-inline-empty">
                  <PhSpinnerGap class="spin" :size="18" />正在扫描 Kimi Skills…
                </div>
                <div v-else-if="skills.length === 0" class="settings-inline-empty">
                  当前上下文没有发现可用 Skill。
                </div>
                <div v-else class="skill-list">
                  <article v-for="skill in skills" :key="skill.name" class="skill-row">
                    <div><strong>/{{ skill.name }}</strong><small>{{ skill.description || '无描述' }}</small></div>
                    <div class="capability-tags">
                      <span>{{ skill.source }}</span>
                      <span v-if="skill.type">{{ skill.type }}</span>
                      <span v-if="skill.userInvocableOnly">仅用户调用</span>
                    </div>
                  </article>
                </div>
                <p class="compatibility-note">Skill 激活入口位于 Composer 的 “/” 菜单；激活会直接使用 Kimi 的 Session route 开始 Turn。</p>
              </section>

              <section v-else-if="activeTab === 'tools'" class="settings-section">
                <div class="settings-title">
                  <div><h2>MCP 与工具</h2><p>状态和有效工具集均由当前 Kimi Agent 返回。</p></div>
                  <button class="icon-text-button" type="button" :disabled="capabilitiesPending" @click="loadCapabilityTab">
                    <PhArrowClockwise :class="{ spin: capabilitiesPending }" :size="15" />刷新
                  </button>
                </div>
                <h3 class="settings-subtitle">MCP Servers</h3>
                <div v-if="capabilitiesPending && mcpServers.length === 0" class="settings-inline-empty">
                  <PhSpinnerGap class="spin" :size="18" />正在读取 MCP 状态…
                </div>
                <div v-else-if="mcpServers.length === 0" class="settings-inline-empty">尚未配置 MCP Server。</div>
                <div v-else class="mcp-list">
                  <article v-for="server in mcpServers" :key="server.id" class="mcp-row">
                    <span class="mcp-status" :class="`is-${server.status}`" />
                    <div><strong>{{ server.name }}</strong><small>{{ server.transport }} · {{ server.toolCount }} tools</small><small v-if="server.lastError" class="is-error">{{ server.lastError }}</small></div>
                    <span>{{ server.status }}</span>
                    <button type="button" :disabled="actionPending !== null" :aria-label="`重启 ${server.name}`" @click="restartMcpServer(server.id)">
                      <PhArrowClockwise :class="{ spin: actionPending === `mcp:${server.id}` }" :size="14" />
                    </button>
                  </article>
                </div>
                <h3 class="settings-subtitle tools-title">有效工具 <span>{{ tools.filter((tool) => tool.active).length }}/{{ tools.length }}</span></h3>
                <div v-if="tools.length === 0" class="settings-inline-empty">当前 Agent 尚未公布工具。</div>
                <div v-else class="tool-list">
                  <article v-for="tool in tools" :key="tool.name" class="tool-row" :class="{ 'is-disabled': !tool.active }">
                    <div><strong>{{ tool.name }}</strong><small>{{ tool.description || '无描述' }}</small></div>
                    <div class="capability-tags"><span>{{ tool.source }}</span><span v-if="tool.mcpServerId">{{ tool.mcpServerId }}</span><span>{{ tool.active ? '可用' : '已禁用' }}</span></div>
                  </article>
                </div>
              </section>

              <section v-else-if="activeTab === 'usage'" class="settings-section">
                <div class="settings-title">
                  <div><h2>用量与通知</h2><p>只保存客户端阈值；套餐数据仍来自 Kimi `/oauth/usage`。</p></div>
                </div>
                <div class="settings-row">
                  <div><strong>官方数据源</strong><span>Kimi `/api/v1/oauth/usage` · {{ usageUpdatedLabel(usage.updatedAt) }}</span></div>
                  <span :class="{ 'is-error': usage.error }">{{ usage.error || (usage.phase === 'ready' ? '数据有效' : usage.phase) }}</span>
                </div>
                <label class="preference-row"><span><strong>轻提示阈值</strong><small>只改变界面强调，默认 50%</small></span>
                  <input type="number" min="10" :max="Math.round(usage.preferences.warningThreshold * 100) - 1" step="1" :value="Math.round(usage.preferences.infoThreshold * 100)" :disabled="actionPending !== null" @change="updateUsagePreference({ infoThreshold: thresholdFromEvent($event) })" />
                </label>
                <label class="preference-row"><span><strong>警告阈值</strong><small>触发第一次系统通知，默认 80%</small></span>
                  <input type="number" :min="Math.round(usage.preferences.infoThreshold * 100) + 1" :max="Math.round(usage.preferences.criticalThreshold * 100) - 1" step="1" :value="Math.round(usage.preferences.warningThreshold * 100)" :disabled="actionPending !== null" @change="updateUsagePreference({ warningThreshold: thresholdFromEvent($event) })" />
                </label>
                <label class="preference-row"><span><strong>严重阈值</strong><small>触发高优先级通知，默认 95%</small></span>
                  <input type="number" :min="Math.round(usage.preferences.warningThreshold * 100) + 1" max="100" step="1" :value="Math.round(usage.preferences.criticalThreshold * 100)" :disabled="actionPending !== null" @change="updateUsagePreference({ criticalThreshold: thresholdFromEvent($event) })" />
                </label>
                <label class="preference-row"><span><strong>系统通知</strong><small>同一 reset 周期每个阈值只提醒一次</small></span>
                  <input type="checkbox" :checked="usage.preferences.systemNotifications" :disabled="actionPending !== null" @change="updateUsagePreference({ systemNotifications: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="preference-row"><span><strong>任务完成通知</strong><small>主 Turn 完成或失败时发送系统通知</small></span>
                  <input type="checkbox" :checked="usage.preferences.turnNotifications !== false" :disabled="actionPending !== null" @change="updateUsagePreference({ turnNotifications: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="preference-row"><span><strong>通知声音</strong><small>系统通知同时播放系统提示音</small></span>
                  <input type="checkbox" :checked="usage.preferences.notificationSound !== false" :disabled="actionPending !== null" @change="updateUsagePreference({ notificationSound: ($event.target as HTMLInputElement).checked })" />
                </label>
                <p class="compatibility-note">前台 30 秒、后台 60 秒轮询；Prompt 结束、窗口聚焦、网络恢复与登录完成时立即刷新。</p>
              </section>

              <section v-else-if="activeTab === 'archives'" class="settings-section">
                <div class="settings-title">
                  <div><h2>已归档任务</h2><p>列表和恢复操作均直接来自 Kimi Session。</p></div>
                  <button class="icon-text-button" type="button" :disabled="archivesPending" @click="loadArchivedSessions">
                    <PhArrowClockwise :class="{ spin: archivesPending }" :size="15" />刷新
                  </button>
                </div>
                <div v-if="archivesPending && archivedSessions.length === 0" class="settings-inline-empty">
                  <PhSpinnerGap class="spin" :size="18" />正在读取归档任务…
                </div>
                <div v-else-if="archivedSessions.length === 0" class="settings-inline-empty">当前没有已归档任务。</div>
                <div v-else class="archive-session-list">
                  <article v-for="session in archivedSessions" :key="session.id" class="archive-session-row">
                    <div>
                      <strong>{{ session.title || session.lastPrompt || '未命名任务' }}</strong>
                      <small>{{ archivedTime(session.updatedAt) }}</small>
                    </div>
                    <button class="secondary-button" type="button" :disabled="actionPending !== null" @click="restoreSession(session.id)">
                      <PhArrowCounterClockwise :class="{ spin: actionPending === `session:restore:${session.id}` }" :size="14" />恢复
                    </button>
                  </article>
                </div>
              </section>

              <section v-else class="settings-section">
                <div class="settings-title"><div><h2>通用</h2><p>Kimi 配置和仅本机的产品偏好会明确分开保存。</p></div></div>
                <label class="preference-row"><span><strong>桌面宠物</strong><small>在桌面显示当前会话状态；默认关闭</small></span>
                  <input type="checkbox" :checked="usage.preferences.petEnabled === true" :disabled="actionPending !== null" @change="updateUsagePreference({ petEnabled: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="preference-row"><span><strong>界面语言</strong><small>影响系统通知、日期/数字格式与界面语言标记</small></span>
                  <select :value="usage.preferences.locale ?? 'zh-CN'" :disabled="actionPending !== null" @change="updateUsagePreference({ locale: ($event.target as HTMLSelectElement).value as 'zh-CN' | 'en-US' })">
                    <option value="zh-CN">简体中文</option><option value="en-US">English</option>
                  </select>
                </label>
                <label class="preference-row"><span><strong>默认 Permission</strong><small>新 Session 的权限模式</small></span>
                  <select :value="snapshot.preferences.defaultPermissionMode ?? 'manual'" :disabled="actionPending !== null" @change="updatePreference({ defaultPermissionMode: ($event.target as HTMLSelectElement).value as 'manual' | 'auto' | 'yolo' })">
                    <option value="manual">Manual</option><option value="auto">Auto</option><option value="yolo">Yolo</option>
                  </select>
                </label>
                <label class="preference-row"><span><strong>默认 Plan</strong><small>新 Session 自动规划</small></span>
                  <input type="checkbox" :checked="snapshot.preferences.defaultPlanMode === true" :disabled="actionPending !== null" @change="updatePreference({ defaultPlanMode: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="preference-row"><span><strong>合并可用 Skills</strong><small>遵循 Kimi 的 Skill 发现规则</small></span>
                  <input type="checkbox" :checked="snapshot.preferences.mergeAllAvailableSkills === true" :disabled="actionPending !== null" @change="updatePreference({ mergeAllAvailableSkills: ($event.target as HTMLInputElement).checked })" />
                </label>
                <label class="preference-row"><span><strong>Telemetry</strong><small>只控制 Kimi 官方遥测，不增加客户端追踪</small></span>
                  <input type="checkbox" :checked="snapshot.preferences.telemetry === true" :disabled="actionPending !== null" @change="updatePreference({ telemetry: ($event.target as HTMLInputElement).checked })" />
                </label>
              </section>
            </template>

            <div v-if="error" class="settings-message is-error" role="alert">{{ error }}</div>
            <div v-else-if="notice" class="settings-message"><PhCheck :size="14" />{{ notice }}</div>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
