<script setup lang="ts">
import {
  PhArchive,
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhCheck,
  PhCpu,
  PhChartDonut,
  PhDownloadSimple,
  PhGearSix,
  PhKey,
  PhMagicWand,
  PhPencilSimple,
  PhPlus,
  PhPlugsConnected,
  PhTrash,
  PhSignOut,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  KimiOAuthFlow,
  KimiMcpServer,
  KimiCliUpdateState,
  KimiPreferencesPatch,
  KimiProviderType,
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
type ModelSettingsView = 'primary' | 'secondary'
const activeTab = ref<SettingsTab>('account')
const modelSettingsView = ref<ModelSettingsView>('secondary')
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
const cliUpdate = ref<KimiCliUpdateState | null>(null)
const cliUpdateAction = ref<'check' | 'download' | null>(null)
const secondaryModelDraft = ref({ model: '', defaultEffort: '', maxOutputSize: '' })
const secondaryProviderId = ref('')
const showSecondaryProviderForm = ref(false)
const secondaryProviderDraft = ref<{
  id: string
  type: KimiProviderType
  baseUrl: string
  apiKey: string
  defaultModel: string
  defaultModelContextSize: string
}>({ id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: '', defaultModelContextSize: '' })
const editingProviderId = ref<string | null>(null)
const secondaryProviderTypes: Array<{ value: KimiProviderType; label: string }> = [
  { value: 'openai', label: 'OpenAI Chat Completions' },
  { value: 'openai_responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'kimi', label: 'Kimi Open Platform' },
  { value: 'google-genai', label: 'Google GenAI' },
  { value: 'vertexai', label: 'Google Vertex AI' }
]
let pollTimer: ReturnType<typeof setTimeout> | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
let oauthGeneration = 0
let capabilitiesGeneration = 0
const NOTICE_DURATION_MS = 2_800

const managedProviderName = computed(() =>
  snapshot.value?.auth.managedProvider?.name ?? 'managed:kimi-code'
)
const usesSecondaryRuntimePreference = computed(() =>
  snapshot.value?.secondaryModelControl.configurationMode === 'runtime-env'
)
const secondaryModelDescriptor = computed(() => {
  const settings = snapshot.value
  if (settings === null) return null
  const preferredModel = usesSecondaryRuntimePreference.value &&
    settings.secondaryModelControl.preference.mode === 'configured'
    ? settings.secondaryModelControl.preference.model
    : settings.secondaryModel.model
  if (preferredModel === null) return null
  return settings.secondaryModelOptions.find((model) => model.id === preferredModel) ?? null
})
const secondaryModelStatusLabel = computed(() => {
  const settings = snapshot.value
  const capability = settings?.capabilities.secondaryModel
  if (capability === undefined || !capability.supported) return '当前 Runtime 不支持'
  if (settings?.secondaryModelControl.requiresRestart === true) return '等待重启生效'
  if (settings?.secondaryModelControl.appliedPreference?.mode === 'disabled') return '已禁用'
  if (capability.enabled === true) return '实验开关已启用'
  if (capability.enabled === null) return '实验开关状态未知'
  return '实验开关未启用'
})
const secondaryModelSourceLabel = computed(() => {
  const source = snapshot.value?.secondaryModelControl.appliedSource
  if (source === 'moon-code-environment') return 'Moon Code 启动覆盖'
  if (source === 'inherited-environment') return '外部环境变量覆盖'
  if (source === 'kimi-config') return 'Kimi 原有配置'
  if (source === 'disabled') return 'Moon Code 已禁用'
  return null
})
const secondaryFollowsPrimary = computed(() => {
  const settings = snapshot.value
  if (settings === null) return true
  if (usesSecondaryRuntimePreference.value && settings.secondaryModelControl.preference.mode === 'disabled') return true
  return secondaryModelDescriptor.value === null
})
const secondaryOutcomeTitle = computed(() => {
  if (secondaryFollowsPrimary.value) return '跟随主模型'
  return secondaryModelDescriptor.value?.displayName ?? snapshot.value?.secondaryModel.model ?? '未配置'
})
const secondaryOutcomeMeta = computed(() => {
  const settings = snapshot.value
  if (settings === null || secondaryFollowsPrimary.value) return '新建子 Agent 将使用当前主模型。'
  const preference = settings.secondaryModelControl.preference
  const effort = usesSecondaryRuntimePreference.value && preference.mode === 'configured'
    ? preference.defaultEffort
    : settings.secondaryModel.defaultEffort
  const identity = [secondaryModelDescriptor.value?.providerId, secondaryModelDescriptor.value?.id]
    .filter((part): part is string => Boolean(part))
    .join(' / ')
  return effort === null ? identity : `${identity}  推理强度 ${effort}`
})
const secondaryOutcomeState = computed(() => {
  if (snapshot.value?.secondaryModelControl.requiresRestart === true) return '待重启'
  return secondaryFollowsPrimary.value ? '跟随主模型' : '独立模型已启用'
})
const secondaryModelDraftDescriptor = computed(() =>
  snapshot.value?.secondaryModelOptions.find((model) => model.id === secondaryModelDraft.value.model) ?? null
)
const secondaryProviders = computed(() => [...(snapshot.value?.providers ?? [])].sort((left, right) => {
  const leftManaged = left.id === managedProviderName.value ? 0 : 1
  const rightManaged = right.id === managedProviderName.value ? 0 : 1
  return leftManaged - rightManaged || left.id.localeCompare(right.id)
}))
const selectedSecondaryProvider = computed(() =>
  secondaryProviders.value.find((provider) => provider.id === secondaryProviderId.value) ?? null
)
const secondaryProviderModels = computed(() =>
  snapshot.value?.secondaryModelOptions.filter((model) => model.providerId === secondaryProviderId.value) ?? []
)
const secondaryProviderIdExists = computed(() => {
  const id = secondaryProviderDraft.value.id.trim()
  return id.length > 0 && secondaryProviders.value.some((provider) =>
    provider.id === id && provider.id !== editingProviderId.value
  )
})
const providerEditorIsEditing = computed(() => editingProviderId.value !== null)
const providerEditorTitle = computed(() => providerEditorIsEditing.value ? '编辑模型服务' : '添加模型服务')
const providerEditorSubmitLabel = computed(() => providerEditorIsEditing.value ? '保存模型服务' : '连接并读取模型')
const selectedSecondaryProviderTitle = computed(() => {
  const provider = selectedSecondaryProvider.value
  if (provider === null) return '模型服务'
  return provider.id === managedProviderName.value ? 'Kimi' : provider.id
})
const selectedSecondaryProviderProtocol = computed(() => {
  const type = selectedSecondaryProvider.value?.type
  return secondaryProviderTypes.find((item) => item.value === type)?.label ?? type ?? '未知协议'
})
const currentSecondaryProviderId = computed(() => secondaryModelDescriptor.value?.providerId ?? null)
const accountStatusLabel = computed(() => {
  const status = snapshot.value?.auth.managedProvider?.status
  if (status === 'authenticated') return '已登录'
  if (status === 'expired') return '登录已过期'
  if (status === 'revoked') return '授权已撤销'
  return '未登录'
})
const cliUpdateDescription = computed(() => {
  const state = cliUpdate.value
  if (cliUpdateAction.value === 'check') return '正在向 Kimi 官方服务检查最新版本…'
  if (cliUpdateAction.value === 'download') return `正在下载并安装 ${state?.latestVersion ?? '最新版本'}…`
  if (state === null || state.phase === 'idle') return '尚未检查更新。'
  if (state.phase === 'available') return `发现 ${state.latestVersion}，当前版本为 ${state.currentVersion}。`
  if (state.phase === 'up-to-date') return `当前 ${state.currentVersion} 已是最新版本。`
  if (state.phase === 'installed') return `已安装 ${state.currentVersion}，重启 Moon Code 后生效。`
  if (state.phase === 'error') return state.error ?? '检查更新失败，请稍后重试。'
  return '正在处理 Kimi Code CLI 更新…'
})

async function checkCliUpdate(): Promise<void> {
  const api = window.kimiAgent
  if (api?.checkKimiCliUpdate === undefined || cliUpdateAction.value !== null) return
  cliUpdateAction.value = 'check'
  try {
    cliUpdate.value = await api.checkKimiCliUpdate()
  } catch (reason) {
    cliUpdate.value = cliUpdateError(reason)
  } finally {
    cliUpdateAction.value = null
  }
}

async function downloadCliUpdate(): Promise<void> {
  const api = window.kimiAgent
  if (api?.downloadKimiCliUpdate === undefined || cliUpdateAction.value !== null) return
  cliUpdateAction.value = 'download'
  try {
    cliUpdate.value = await api.downloadKimiCliUpdate()
  } catch (reason) {
    cliUpdate.value = cliUpdateError(reason)
  } finally {
    cliUpdateAction.value = null
  }
}

async function loadSettings(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || !props.runtimeRunning) return
  pending.value = true
  error.value = null
  try {
    const next = await api.getKimiSettings()
    snapshot.value = next
    syncSecondaryModelDraft(next)
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    pending.value = false
  }
}

function syncSecondaryModelDraft(settings: KimiSettingsSnapshot): void {
  const preference = settings.secondaryModelControl.preference
  const usePreference = settings.secondaryModelControl.configurationMode === 'runtime-env'
  const model = (usePreference && preference.mode === 'configured' ? preference.model : settings.secondaryModel.model) ??
    settings.secondaryModelOptions[0]?.id ?? ''
  secondaryModelDraft.value = {
    model,
    defaultEffort: (usePreference && preference.mode === 'configured' ? preference.defaultEffort : settings.secondaryModel.defaultEffort) ?? '',
    maxOutputSize: settings.secondaryModel.maxOutputSize?.toString() ?? ''
  }
  secondaryProviderId.value = settings.secondaryModelOptions.find((item) => item.id === model)?.providerId ??
    settings.providers.find((provider) => provider.models.includes(model))?.id ??
    settings.providers.find((provider) => provider.id === settings.preferences.defaultProvider)?.id ??
    settings.providers[0]?.id ?? ''
}

function onSecondaryModelDraftChange(): void {
  const descriptor = secondaryModelDraftDescriptor.value
  if (descriptor === null || descriptor.supportEfforts.length < 1) return
  if (!descriptor.supportEfforts.includes(secondaryModelDraft.value.defaultEffort)) {
    secondaryModelDraft.value.defaultEffort = descriptor.defaultEffort ?? ''
  }
}

function selectSecondaryProvider(providerId: string): void {
  secondaryProviderId.value = providerId
  const options = snapshot.value?.secondaryModelOptions.filter((model) => model.providerId === providerId) ?? []
  if (!options.some((model) => model.id === secondaryModelDraft.value.model)) {
    secondaryModelDraft.value.model = options[0]?.id ?? ''
    secondaryModelDraft.value.defaultEffort = ''
  }
  onSecondaryModelDraftChange()
}

function resetSecondaryProviderDraft(): void {
  secondaryProviderDraft.value = {
    id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: '', defaultModelContextSize: ''
  }
  editingProviderId.value = null
}

function beginAddSecondaryProvider(): void {
  resetSecondaryProviderDraft()
  showSecondaryProviderForm.value = true
}

function beginEditSecondaryProvider(): void {
  const provider = selectedSecondaryProvider.value
  const settings = snapshot.value
  if (
    provider === null ||
    settings === null ||
    !settings.capabilities.canEditProvider ||
    provider.id === managedProviderName.value
  ) return
  editingProviderId.value = provider.id
  secondaryProviderDraft.value = {
    id: provider.id,
    type: provider.type as KimiProviderType,
    baseUrl: provider.baseUrl ?? '',
    apiKey: '',
    defaultModel: stripProviderPrefix(provider.defaultModel, provider.id),
    defaultModelContextSize: ''
  }
  showSecondaryProviderForm.value = true
}

function cancelProviderEditor(): void {
  showSecondaryProviderForm.value = false
  resetSecondaryProviderDraft()
}

function providerTitle(providerId: string): string {
  return providerId === managedProviderName.value ? 'Kimi' : providerId
}

function stripProviderPrefix(value: string | null, providerId: string): string {
  if (value === null) return ''
  const prefix = `${providerId}/`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

function providerStatusLabel(status: KimiSettingsSnapshot['providers'][number]['status']): string {
  if (status === 'connected') return '已连接'
  if (status === 'error') return '连接失败'
  return '待配置'
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
    showNotice('任务已恢复到原项目。')
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
    showNotice(`已请求 Kimi 重启 MCP Server ${serverId}${status === undefined ? '' : `；当前状态：${status}`}。`)
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
    showNotice('默认模型已更新；现有 Session 仍保持自己的模型。')
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function setSecondaryModel(): Promise<void> {
  const api = window.kimiAgent
  if (
    api === undefined ||
    snapshot.value === null ||
    !snapshot.value.capabilities.secondaryModel.writable ||
    secondaryModelDraft.value.model.length < 1 ||
    actionPending.value !== null
  ) return
  actionPending.value = 'secondary-model'
  error.value = null
  notice.value = null
  try {
    const maxOutput = String(secondaryModelDraft.value.maxOutputSize).trim()
    const next = await api.setSecondaryModel({
      model: secondaryModelDraft.value.model,
      ...(secondaryModelDraft.value.defaultEffort.length < 1
        ? {}
        : { defaultEffort: secondaryModelDraft.value.defaultEffort }),
      ...(!snapshot.value.capabilities.secondaryModel.maxOutputSizeWritable || maxOutput.length < 1
        ? {}
        : { maxOutputSize: Number(maxOutput) })
    })
    snapshot.value = next
    syncSecondaryModelDraft(next)
    showNotice(next.secondaryModelControl.requiresRestart
      ? '子 Agent 模型已保存；重启 Kimi Runtime 后生效。'
      : '子 Agent 模型已更新；只影响之后新建的 Agent 和 AgentSwarm。')
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function disableSecondaryModel(): Promise<void> {
  const api = window.kimiAgent
  if (
    api === undefined ||
    snapshot.value === null ||
    !snapshot.value.capabilities.secondaryModel.canDisable ||
    actionPending.value !== null
  ) return
  actionPending.value = 'secondary-model:disable'
  error.value = null
  notice.value = null
  try {
    const next = await api.disableSecondaryModel()
    snapshot.value = next
    syncSecondaryModelDraft(next)
    showNotice(next.secondaryModelControl.requiresRestart
      ? '已保存更改；重启 Kimi Runtime 后，子 Agent 将跟随主模型。'
      : '已改为跟随主模型。')
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function inheritSecondaryModel(): Promise<void> {
  const api = window.kimiAgent
  if (
    api === undefined ||
    snapshot.value === null ||
    snapshot.value.secondaryModelControl.configurationMode !== 'runtime-env' ||
    actionPending.value !== null
  ) return
  actionPending.value = 'secondary-model:inherit'
  error.value = null
  notice.value = null
  try {
    const next = await api.inheritSecondaryModel()
    snapshot.value = next
    syncSecondaryModelDraft(next)
    showNotice(next.secondaryModelControl.requiresRestart
      ? '已恢复 Kimi 原有设置；重启 Kimi Runtime 后生效。'
      : '已恢复 Kimi 原有设置。')
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function restartRuntimeForSecondaryModel(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  if (!window.confirm('重启 Kimi Runtime 会中断当前正在执行的任务，并关闭当前 Session 连接。确定继续吗？')) return
  actionPending.value = 'secondary-model:restart'
  error.value = null
  notice.value = null
  try {
    const state = await api.restartRuntime()
    if (state.status !== 'running') throw new Error(state.error ?? 'Kimi Runtime 重启失败')
    await loadSettings()
    showNotice('Kimi Runtime 已重启，子 Agent 模型设置已生效。')
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
    showNotice(result.failed.length > 0
      ? 'Kimi 模型目录刷新失败，请稍后重试。'
      : `模型目录已刷新${changed > 0 ? `，共 ${changed} 项变化` : '，没有变化'}。`)
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function refreshSecondaryProvider(): Promise<void> {
  const api = window.kimiAgent
  const providerId = secondaryProviderId.value
  if (api === undefined || providerId.length < 1 || actionPending.value !== null) return
  actionPending.value = `refresh:provider:${providerId}`
  error.value = null
  notice.value = null
  try {
    const result = await api.refreshKimiProviders({ scope: 'provider', providerId })
    await loadSettings()
    selectSecondaryProvider(providerId)
    const failed = result.failed.find((item) => item.provider === providerId)
    if (failed !== undefined) throw new Error(failed.reason)
    const changed = result.changed.find((item) => item.providerId === providerId)
    showNotice(changed === undefined
      ? `${providerId} 的模型目录已刷新，没有变化。`
      : `${providerId} 的模型目录已刷新，新增 ${changed.added} 个、移除 ${changed.removed} 个模型。`)
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function saveSecondaryProvider(): Promise<void> {
  const api = window.kimiAgent
  const settings = snapshot.value
  const id = secondaryProviderDraft.value.id.trim()
  const oldId = editingProviderId.value
  if (
    api === undefined ||
    settings === null ||
    (oldId === null ? !settings.capabilities.canAddProvider : !settings.capabilities.canEditProvider) ||
    id.length < 1 ||
    secondaryProviderIdExists.value ||
    actionPending.value !== null
  ) return
  actionPending.value = oldId === null ? 'secondary-provider:add' : `secondary-provider:edit:${oldId}`
  error.value = null
  notice.value = null
  try {
    const baseUrl = secondaryProviderDraft.value.baseUrl.trim()
    const apiKey = secondaryProviderDraft.value.apiKey.trim()
    const defaultModel = secondaryProviderDraft.value.defaultModel.trim()
    const defaultModelContextSize = Number(secondaryProviderDraft.value.defaultModelContextSize)
    const hasDefaultModelContextSize = secondaryProviderDraft.value.defaultModelContextSize.trim().length > 0
    const next = oldId === null
      ? await api.addKimiProvider({
        id,
        type: secondaryProviderDraft.value.type,
        ...(baseUrl.length < 1 ? {} : { baseUrl }),
        ...(apiKey.length < 1 ? {} : { apiKey }),
        ...(defaultModel.length < 1 ? {} : { defaultModel }),
        ...(hasDefaultModelContextSize ? { defaultModelContextSize } : {})
      })
      : await api.updateKimiProvider({
        id: oldId,
        ...(id === oldId ? {} : { newId: id }),
        type: secondaryProviderDraft.value.type,
        ...(baseUrl.length < 1 ? {} : { baseUrl }),
        ...(apiKey.length < 1 ? {} : { apiKey }),
        ...(defaultModel.length < 1 ? {} : { defaultModel }),
        ...(hasDefaultModelContextSize ? { defaultModelContextSize } : {})
      })
    snapshot.value = next
    showSecondaryProviderForm.value = false
    resetSecondaryProviderDraft()
    selectSecondaryProvider(id)
    showNotice(oldId === null
      ? (secondaryProviderModels.value.length > 0
        ? `${id} 已连接并读取到 ${secondaryProviderModels.value.length} 个模型。`
        : `${id} 已连接，但暂未获取到模型；可检查凭据或 Base URL 后重试刷新。`)
      : `${id} 的模型服务设置已保存。`)
  } catch (reason) {
    // Credentials must not remain in long-lived Renderer state after a submission.
    secondaryProviderDraft.value.apiKey = ''
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

async function deleteSecondaryProvider(): Promise<void> {
  const api = window.kimiAgent
  const settings = snapshot.value
  const provider = selectedSecondaryProvider.value
  if (
    api === undefined ||
    settings === null ||
    provider === null ||
    provider.id === managedProviderName.value ||
    !settings.capabilities.canDeleteProvider ||
    actionPending.value !== null
  ) return
  const modelWarning = secondaryProviderModels.value.length > 0
    ? `这会同时移除 ${secondaryProviderModels.value.length} 个模型别名，已选择的子 Agent 模型也会失效。`
    : '这会同时移除该服务的模型别名。'
  if (!window.confirm(`确定删除模型服务“${providerTitle(provider.id)}”？${modelWarning}`)) return
  const providerId = provider.id
  actionPending.value = `secondary-provider:delete:${providerId}`
  error.value = null
  notice.value = null
  try {
    const next = await api.deleteKimiProvider(providerId)
    snapshot.value = next
    const fallback = secondaryProviders.value.find((item) => item.id !== providerId)?.id ?? ''
    selectSecondaryProvider(fallback)
    showNotice(`模型服务 ${providerTitle(providerId)} 已删除。`)
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
    showNotice('petEnabled' in patch
      ? '宠物设置已保存在本机。'
      : '用量阈值已保存在本机；不会修改 Kimi 套餐数据。')
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
      showNotice('Kimi 账号已登录。')
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
      showNotice('登录成功，Kimi 已刷新可用模型。')
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
    showNotice('Kimi 账号已退出。')
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

function clearNoticeTimer(): void {
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  noticeTimer = null
}

function showNotice(message: string): void {
  clearNoticeTimer()
  notice.value = message
  noticeTimer = setTimeout(() => {
    notice.value = null
    noticeTimer = null
  }, NOTICE_DURATION_MS)
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
      clearNoticeTimer()
      notice.value = null
      showSecondaryProviderForm.value = false
      resetSecondaryProviderDraft()
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
      if (activeTab.value === 'general' && cliUpdate.value === null) void checkCliUpdate()
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
  clearNoticeTimer()
  resetSecondaryProviderDraft()
  window.removeEventListener('keydown', onWindowKeydown)
})

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function cliUpdateError(reason: unknown): KimiCliUpdateState {
  return {
    phase: 'error',
    currentVersion: cliUpdate.value?.currentVersion ?? null,
    latestVersion: cliUpdate.value?.latestVersion ?? null,
    executable: cliUpdate.value?.executable ?? null,
    checkedAt: new Date().toISOString(),
    error: errorMessage(reason),
    requiresRestart: false
  }
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
            <section v-if="activeTab === 'general'" class="settings-section">
              <div class="settings-title"><div><h2>通用</h2><p>Kimi 配置和仅本机的产品偏好会明确分开保存。</p></div></div>
              <article class="cli-update-card" :class="{ 'is-error': cliUpdate?.phase === 'error' }">
                <div>
                  <strong>Kimi Code CLI 更新</strong>
                  <small>{{ cliUpdateDescription }}</small>
                </div>
                <div class="cli-update-actions">
                  <button class="secondary-button" type="button" :disabled="cliUpdateAction !== null" @click="checkCliUpdate">
                    <PhArrowClockwise :class="{ spin: cliUpdateAction === 'check' }" :size="14" />检查更新
                  </button>
                  <button v-if="cliUpdate?.phase === 'available'" class="primary-button" type="button" :disabled="cliUpdateAction !== null" @click="downloadCliUpdate">
                    <PhDownloadSimple :class="{ spin: cliUpdateAction === 'download' }" :size="14" />下载更新
                  </button>
                </div>
              </article>
              <p class="cli-update-note">仅检测系统安装的 Kimi Code CLI；更新由 Kimi 官方 <code>kimi update</code> 流程完成。</p>
              <label class="preference-row"><span><strong>桌面宠物</strong><small>在桌面显示当前会话状态；默认关闭</small></span>
                <input type="checkbox" :checked="usage.preferences.petEnabled === true" :disabled="actionPending !== null" @change="updateUsagePreference({ petEnabled: ($event.target as HTMLInputElement).checked })" />
              </label>
              <label class="preference-row"><span><strong>界面语言</strong><small>影响系统通知、日期/数字格式与界面语言标记</small></span>
                <select :value="usage.preferences.locale ?? 'zh-CN'" :disabled="actionPending !== null" @change="updateUsagePreference({ locale: ($event.target as HTMLSelectElement).value as 'zh-CN' | 'en-US' })">
                  <option value="zh-CN">简体中文</option><option value="en-US">English</option>
                </select>
              </label>
              <template v-if="snapshot">
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
              </template>
              <p v-else class="compatibility-note">Kimi Runtime 未连接时，Kimi 自身的默认权限、Plan、Skills 与 Telemetry 设置暂不可用。</p>
            </section>

            <div v-else-if="!runtimeRunning" class="settings-empty">
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

              <section v-else-if="activeTab === 'models'" class="settings-section model-settings-page">
                <div class="settings-title model-page-title">
                  <div>
                    <h2>模型设置</h2>
                    <p>选择主 Agent 和子 Agent 使用的模型。</p>
                  </div>
                  <button class="icon-text-button" type="button" :disabled="actionPending !== null" @click="refreshModels">
                    <PhArrowClockwise :class="{ spin: actionPending?.startsWith('refresh:') }" :size="15" />刷新
                  </button>
                </div>

                <div class="model-view-switch" role="tablist" aria-label="模型设置范围">
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="modelSettingsView === 'primary'"
                    :class="{ 'is-active': modelSettingsView === 'primary' }"
                    @click="modelSettingsView = 'primary'"
                  >主模型</button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="modelSettingsView === 'secondary'"
                    :class="{ 'is-active': modelSettingsView === 'secondary' }"
                    @click="modelSettingsView = 'secondary'"
                  >子 Agent 模型</button>
                </div>

                <section v-if="modelSettingsView === 'primary'" class="primary-model-panel" aria-labelledby="primary-model-title">
                  <header>
                    <div>
                      <h3 id="primary-model-title">主模型</h3>
                      <p>创建新 Session 时使用；已打开的 Session 不会被改变。</p>
                    </div>
                    <span class="model-scope-chip">新 Session</span>
                  </header>
                  <div class="primary-model-grid">
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
                      <small>{{ Math.round(model.maxContextSize / 1024) }}k</small>
                    </button>
                  </div>
                </section>

                <section v-else class="secondary-model-workspace" aria-labelledby="secondary-model-title">
                  <div class="secondary-outcome-bar" :class="{ 'is-pending': snapshot.secondaryModelControl.requiresRestart }">
                    <div>
                      <span>新子 Agent 将使用</span>
                      <strong id="secondary-model-title">{{ secondaryOutcomeTitle }}</strong>
                      <small>{{ secondaryOutcomeMeta }}</small>
                    </div>
                    <span class="secondary-outcome-state">{{ secondaryOutcomeState }}</span>
                  </div>

                  <div class="provider-manager">
                    <aside class="provider-catalog" aria-label="模型服务">
                      <header>
                        <strong>模型服务</strong>
                        <span>{{ secondaryProviders.length }} 个</span>
                      </header>
                      <p v-if="snapshot.capabilities.providerManagementUnavailableReason" class="provider-management-note">
                        {{ snapshot.capabilities.providerManagementUnavailableReason }}
                      </p>
                      <div class="provider-catalog-list">
                        <button
                          v-for="provider in secondaryProviders"
                          :key="provider.id"
                          class="provider-catalog-item"
                          :class="{ 'is-selected': !showSecondaryProviderForm && secondaryProviderId === provider.id }"
                          type="button"
                          :disabled="actionPending !== null"
                          @click="cancelProviderEditor(); selectSecondaryProvider(provider.id)"
                        >
                          <span class="provider-catalog-icon" :class="{ 'is-kimi': provider.id === managedProviderName }">
                            <PhCpu v-if="provider.id === managedProviderName" :size="18" />
                            <PhPlugsConnected v-else :size="18" />
                          </span>
                          <span class="provider-catalog-copy">
                            <strong>{{ providerTitle(provider.id) }}</strong>
                            <small>{{ provider.id === managedProviderName ? '内置' : provider.type }} · {{ providerStatusLabel(provider.status) }}</small>
                          </span>
                          <span class="provider-catalog-status" :class="`is-${provider.status}`" :title="providerStatusLabel(provider.status)" />
                        </button>
                      </div>
                      <button
                        v-if="snapshot.capabilities.canAddProvider"
                        class="provider-add-button"
                        :class="{ 'is-active': showSecondaryProviderForm }"
                        type="button"
                        :disabled="actionPending !== null"
                        @click="beginAddSecondaryProvider"
                      ><PhPlus :size="16" />添加模型服务</button>
                    </aside>

                    <div class="provider-detail">
                      <form
                        v-if="showSecondaryProviderForm && (snapshot.capabilities.canAddProvider || (providerEditorIsEditing && snapshot.capabilities.canEditProvider))"
                        class="secondary-provider-form"
                        @submit.prevent="saveSecondaryProvider"
                      >
                        <header class="provider-detail-header">
                          <div>
                            <span class="provider-detail-icon"><PhPlus :size="20" /></span>
                            <div><h3>{{ providerEditorTitle }}</h3><p>{{ providerEditorIsEditing ? '更新连接名称、协议或地址；留空 API Key 将保留已保存凭据。' : '连接 OpenAI、Anthropic、Google 或任何兼容接口，凭据由 Kimi 官方配置保存。' }}</p></div>
                          </div>
                        </header>
                        <div class="provider-form-grid">
                          <label>
                            <span>连接名称</span>
                            <input v-model="secondaryProviderDraft.id" type="text" maxlength="128" placeholder="例如 openai-main" autocomplete="off" :disabled="actionPending !== null" />
                          </label>
                          <label>
                            <span>接口协议</span>
                            <select v-model="secondaryProviderDraft.type" :disabled="actionPending !== null">
                              <option v-for="providerType in secondaryProviderTypes" :key="providerType.value" :value="providerType.value">{{ providerType.label }}</option>
                            </select>
                          </label>
                          <label class="provider-form-wide">
                            <span>API Base URL</span>
                            <input v-model="secondaryProviderDraft.baseUrl" type="url" maxlength="2048" placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                          </label>
                          <label class="provider-form-wide">
                            <span>API Key</span>
                            <input v-model="secondaryProviderDraft.apiKey" type="password" maxlength="8192" :placeholder="providerEditorIsEditing ? '留空以保留当前 API Key' : 'sk-…'" autocomplete="new-password" spellcheck="false" :disabled="actionPending !== null" />
                          </label>
                          <label class="provider-form-wide">
                            <span>首个 / 默认模型别名</span>
                            <input v-model="secondaryProviderDraft.defaultModel" type="text" maxlength="256" placeholder="例如 gpt-5-mini" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                          </label>
                          <label class="provider-form-wide">
                            <span>模型上下文 Token（私有或未知服务时填写）</span>
                            <input v-model="secondaryProviderDraft.defaultModelContextSize" type="number" min="1" max="16777216" placeholder="已知服务会从 Kimi 模型目录自动识别" autocomplete="off" :disabled="actionPending !== null" />
                          </label>
                        </div>
                        <p v-if="secondaryProviderIdExists" class="field-error">这个连接名称已存在。</p>
                        <p class="credential-note">API Key 交给 Kimi 官方配置保存，Moon Code 不会回读或另存。</p>
                        <div class="provider-form-actions">
                          <button class="secondary-button" type="button" :disabled="actionPending !== null" @click="cancelProviderEditor">取消</button>
                          <button class="primary-button" type="submit" :disabled="actionPending !== null || secondaryProviderDraft.id.trim().length < 1 || secondaryProviderIdExists">{{ providerEditorSubmitLabel }}</button>
                        </div>
                      </form>

                      <template v-else-if="selectedSecondaryProvider">
                        <header class="provider-detail-header">
                          <div>
                            <span class="provider-detail-icon" :class="{ 'is-kimi': selectedSecondaryProvider.id === managedProviderName }">
                              <PhCpu v-if="selectedSecondaryProvider.id === managedProviderName" :size="20" />
                              <PhPlugsConnected v-else :size="20" />
                            </span>
                            <div>
                              <h3>{{ selectedSecondaryProviderTitle }}</h3>
                              <p>{{ selectedSecondaryProviderProtocol }}</p>
                            </div>
                          </div>
                          <div class="provider-detail-actions">
                            <span
                              class="provider-enabled-badge"
                              :class="{
                                'is-error': selectedSecondaryProvider.status === 'error',
                                'is-unconfigured': selectedSecondaryProvider.status !== 'connected' && selectedSecondaryProvider.status !== 'error'
                              }"
                            >
                              {{ providerStatusLabel(selectedSecondaryProvider.status) }}
                            </span>
                            <button
                              v-if="snapshot.capabilities.canEditProvider && selectedSecondaryProvider.id !== managedProviderName"
                              class="provider-icon-button"
                              type="button"
                              :disabled="actionPending !== null"
                              :aria-label="`编辑 ${selectedSecondaryProviderTitle}`"
                              title="编辑模型服务"
                              @click="beginEditSecondaryProvider"
                            ><PhPencilSimple :size="15" /></button>
                            <button
                              v-if="snapshot.capabilities.canDeleteProvider && selectedSecondaryProvider.id !== managedProviderName"
                              class="provider-icon-button is-danger"
                              type="button"
                              :disabled="actionPending !== null"
                              :aria-label="`删除 ${selectedSecondaryProviderTitle}`"
                              title="删除模型服务"
                              @click="deleteSecondaryProvider"
                            ><PhTrash :size="15" /></button>
                          </div>
                        </header>

                        <div class="provider-connection-summary">
                          <div>
                            <span>API Key</span>
                            <strong>{{ selectedSecondaryProvider.hasCredential ? '已由 Kimi 安全保存' : '未配置' }}</strong>
                          </div>
                          <div>
                            <span>API Base URL</span>
                            <strong>{{ selectedSecondaryProvider.baseUrl ?? 'Kimi 默认地址' }}</strong>
                          </div>
                        </div>

                        <div class="provider-models-heading">
                          <div><strong>可用模型</strong><span>{{ secondaryProviderModels.length }} 个</span></div>
                          <button class="provider-refresh-link" type="button" :disabled="actionPending !== null" @click="refreshSecondaryProvider">
                            <PhArrowClockwise :class="{ spin: actionPending === `refresh:provider:${secondaryProviderId}` }" :size="15" />获取模型列表
                          </button>
                        </div>

                        <div v-if="secondaryProviderModels.length > 0" class="provider-model-list">
                          <button
                            v-for="model in secondaryProviderModels"
                            :key="model.id"
                            class="provider-model-item"
                            :class="{ 'is-selected': secondaryModelDraft.model === model.id }"
                            type="button"
                            :disabled="actionPending !== null || !snapshot.capabilities.secondaryModel.writable"
                            @click="secondaryModelDraft.model = model.id; onSecondaryModelDraftChange()"
                          >
                            <span class="provider-model-radio"><PhCheck v-if="secondaryModelDraft.model === model.id" :size="12" /></span>
                            <span><strong>{{ model.displayName }}</strong><small>{{ model.id }}</small></span>
                            <span v-if="currentSecondaryProviderId === model.providerId && secondaryModelDescriptor?.id === model.id" class="model-current-badge">当前使用</span>
                            <small v-else>{{ Math.round(model.maxContextSize / 1024) }}k</small>
                          </button>
                        </div>
                        <div v-else class="provider-model-empty">这个服务暂时没有可用模型。</div>

                        <div v-if="snapshot.capabilities.secondaryModel.writable" class="secondary-model-footer">
                          <div class="provider-form secondary-model-form">
                            <label>
                              <span>推理强度</span>
                              <select v-if="(secondaryModelDraftDescriptor?.supportEfforts.length ?? 0) > 0" v-model="secondaryModelDraft.defaultEffort" :disabled="actionPending !== null">
                                <option value="">使用模型默认值</option>
                                <option v-for="effort in secondaryModelDraftDescriptor?.supportEfforts ?? []" :key="effort" :value="effort">{{ effort }}</option>
                              </select>
                              <input v-else v-model="secondaryModelDraft.defaultEffort" type="text" placeholder="使用模型默认值" :disabled="actionPending !== null" />
                            </label>
                            <label v-if="snapshot.capabilities.secondaryModel.maxOutputSizeWritable">
                              <span>最大输出 Token</span>
                              <input v-model="secondaryModelDraft.maxOutputSize" type="number" min="1" max="16777216" placeholder="使用模型默认值" :disabled="actionPending !== null" />
                            </label>
                          </div>
                          <div class="secondary-model-actions">
                            <button v-if="snapshot.capabilities.secondaryModel.canDisable && !secondaryFollowsPrimary" class="secondary-button" type="button" :disabled="actionPending !== null" @click="disableSecondaryModel">跟随主模型</button>
                            <button class="primary-button" type="button" :disabled="actionPending !== null || secondaryModelDraft.model.length < 1" @click="setSecondaryModel">保存设置</button>
                          </div>
                        </div>
                        <p v-else class="secondary-readonly-note">{{ snapshot.capabilities.secondaryModel.unavailableReason ?? '当前 Runtime 只能读取这项设置。' }}</p>
                      </template>
                    </div>
                  </div>

                  <div v-if="snapshot.secondaryModelControl.requiresRestart" class="secondary-restart-notice">
                    <div><strong>重启后应用更改</strong><span>重启会中断正在执行的任务。</span></div>
                    <button class="primary-button" type="button" :disabled="actionPending !== null" @click="restartRuntimeForSecondaryModel">立即重启</button>
                  </div>

                  <details class="secondary-runtime-details">
                    <summary>运行时与兼容性</summary>
                    <dl>
                      <div><dt>功能状态</dt><dd>{{ secondaryModelStatusLabel }}</dd></div>
                      <div v-if="secondaryModelSourceLabel"><dt>配置来源</dt><dd>{{ secondaryModelSourceLabel }}</dd></div>
                      <div><dt>作用范围</dt><dd>仅之后新建的 Agent / AgentSwarm</dd></div>
                    </dl>
                    <p>{{ snapshot.capabilities.secondaryModel.unavailableReason ?? (snapshot.secondaryModelControl.configurationMode === 'runtime-env' ? '模型选择通过 Kimi 官方环境变量应用。' : '配置通过当前 Kimi Runtime 的官方接口保存。') }}</p>
                    <button v-if="snapshot.secondaryModelControl.configurationMode === 'runtime-env' && snapshot.secondaryModelControl.preference.mode !== 'inherit'" class="provider-disclosure-button" type="button" :disabled="actionPending !== null" @click="inheritSecondaryModel">恢复 Kimi 原有设置</button>
                  </details>
                </section>
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

            </template>
          </div>
        </div>
        <Transition name="settings-toast">
          <div v-if="error" class="settings-message is-error" role="alert">{{ error }}</div>
          <div v-else-if="notice" class="settings-message" role="status" aria-live="polite"><PhCheck :size="14" />{{ notice }}</div>
        </Transition>
      </section>
    </div>
  </Teleport>
</template>
