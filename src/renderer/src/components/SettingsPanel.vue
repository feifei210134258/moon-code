<script setup lang="ts">
import {
  PhArchive,
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhArrowLeft,
  PhCaretDown,
  PhCheck,
  PhCpu,
  PhChartDonut,
  PhDownloadSimple,
  PhGearSix,
  PhMagicWand,
  PhPencilSimple,
  PhPlus,
  PhPlugsConnected,
  PhTrash,
  PhSignOut,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  KimiCatalogProviderDetail,
  KimiCatalogProviderSummary,
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

type SettingsTab = 'general' | 'models' | 'skills' | 'tools' | 'usage' | 'archives'
type ModelSettingsView = 'providers' | 'agents'
const activeTab = ref<SettingsTab>('general')
const modelSettingsView = ref<ModelSettingsView>('providers')
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
const secondaryMaxOutputInput = ref('')
const showSecondaryProviderForm = ref(false)
const secondaryProviderDraft = ref<{
  id: string
  type: KimiProviderType
  baseUrl: string
  apiKey: string
  defaultModel: string
}>({ id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: '' })
/* 供应商编辑器里的模型行。capabilities/supportEfforts 不可编辑，
   仅用于在整体替换时保留刷新/目录导入带来的模型元数据。
   maxContextSize 在 number 输入框下会被 v-model 自动转成 number。 */
interface ProviderModelRow {
  model: string
  maxContextSize: string | number
  displayName: string
  capabilities?: string[]
  supportEfforts?: string[]
}
const providerModelRows = ref<ProviderModelRow[]>([])
const editingProviderId = ref<string | null>(null)
const providerEditorMode = ref<'catalog' | 'manual'>('catalog')
const catalogSummaries = ref<KimiCatalogProviderSummary[]>([])
const catalogLoading = ref(false)
const catalogError = ref<string | null>(null)
const catalogSearch = ref('')
const selectedCatalogId = ref<string | null>(null)
const catalogDetail = ref<KimiCatalogProviderDetail | null>(null)
const catalogDetailLoading = ref(false)
const providerPickerOpen = ref(false)
const expandedDescriptions = ref(new Set<string>())
const descriptionOverflow = ref(new Set<string>())
const rootRef = ref<HTMLElement | null>(null)
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
  // runtime-env 模式看本地偏好（待应用）；runtime-rest 模式看启动时应用的状态。
  const control = settings.secondaryModelControl
  const statePreference = usesSecondaryRuntimePreference.value ? control.preference : control.appliedPreference
  if (statePreference?.mode === 'disabled') return true
  return secondaryModelDescriptor.value === null
})
const secondaryOutcomeState = computed(() => {
  if (snapshot.value?.secondaryModelControl.requiresRestart === true) return '待重启'
  return secondaryFollowsPrimary.value ? '跟随主模型' : '独立模型已启用'
})
const secondaryProviders = computed(() => [...(snapshot.value?.providers ?? [])].sort((left, right) => {
  const leftManaged = left.id === managedProviderName.value ? 0 : 1
  const rightManaged = right.id === managedProviderName.value ? 0 : 1
  return leftManaged - rightManaged || left.id.localeCompare(right.id)
}))
const secondaryProviderIdExists = computed(() => {
  const id = secondaryProviderDraft.value.id.trim()
  return id.length > 0 && secondaryProviders.value.some((provider) =>
    provider.id === id && provider.id !== editingProviderId.value
  )
})
const providerEditorIsEditing = computed(() => editingProviderId.value !== null)
const providerEditorTitle = computed(() => providerEditorIsEditing.value ? '编辑模型服务' : '添加模型服务')
const providerEditorSubmitLabel = computed(() => {
  if (providerEditorIsEditing.value) return '保存模型服务'
  return providerEditorMode.value === 'catalog' ? '保存模型服务' : '连接并读取模型'
})
const providerEditorIsCatalogMode = computed(() =>
  !providerEditorIsEditing.value && providerEditorMode.value === 'catalog'
)
const catalogSearchResults = computed(() => {
  const query = catalogSearch.value.trim().toLowerCase()
  if (query.length < 1) return catalogSummaries.value
  return catalogSummaries.value.filter((item) =>
    item.id.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
  )
})
const catalogSelectedSummary = computed(() =>
  catalogSummaries.value.find((item) => item.id === selectedCatalogId.value) ?? null
)
const catalogRequiresBaseUrl = computed(() =>
  providerEditorIsCatalogMode.value && catalogDetail.value?.needsBaseUrl === true
)
const catalogApiKeyPlaceholder = computed(() => {
  if (providerEditorIsCatalogMode.value && catalogSelectedSummary.value !== null) {
    const envKey = catalogSelectedSummary.value.envKey
    return envKey === null ? 'sk-…' : `对应 ${envKey} 的 API Key`
  }
  return providerEditorIsEditing.value ? '留空以保留当前 API Key' : 'sk-…'
})
/* 与 KimiSettingsBridge.#findProviderDirectory 的候选逻辑保持一致：
   连接名称或 Base URL 的注册域名能命中 Kimi 供应商目录时，模型元数据会自动补全；
   目录外的自定义服务没有任何模型来源，必须手动填写首个模型别名和上下文 Token，
   否则服务端无法创建（POST /providers 要求至少一个模型）。 */
const manualProviderDirectoryHit = computed(() => {
  const candidates = new Set<string>()
  const normalizedId = secondaryProviderDraft.value.id.trim().toLowerCase()
  if (normalizedId.length > 0) candidates.add(normalizedId)
  const baseUrl = secondaryProviderDraft.value.baseUrl.trim()
  if (baseUrl.length > 0) {
    try {
      const labels = new URL(baseUrl).hostname.toLowerCase().split('.').filter(Boolean)
      const registrableLabel = labels.at(-2)
      if (registrableLabel !== undefined) candidates.add(registrableLabel)
    } catch {
      // URL 合法性由主进程校验；这里只做目录命中的尽力判断。
    }
  }
  if (candidates.size < 1) return false
  return [...candidates].some((candidate) =>
    catalogSummaries.value.some((item) =>
      item.id.toLowerCase() === candidate && !item.rejected && item.modelCount > 0
    )
  )
})
const providerEditorModelFieldsRequired = computed(() =>
  !providerEditorIsEditing.value && !providerEditorIsCatalogMode.value && !manualProviderDirectoryHit.value
)
function providerModelRowIsBlank(row: ProviderModelRow): boolean {
  return row.model.trim().length < 1 &&
    String(row.maxContextSize).trim().length < 1 &&
    row.displayName.trim().length < 1
}
function providerModelRowContextSize(row: ProviderModelRow): number | null {
  const text = String(row.maxContextSize).trim()
  if (text.length < 1) return null
  const size = Number(text)
  return Number.isInteger(size) && size >= 1 && size <= 16_777_216 ? size : null
}
/** 全部字段为空的行会被忽略（目录命中时留给自动补全）；部分填写的行必须补全。 */
const completeProviderModelRows = computed(() => providerModelRows.value.filter((row) =>
  !providerModelRowIsBlank(row) && row.model.trim().length > 0 && providerModelRowContextSize(row) !== null
))
const partialProviderModelRowCount = computed(() => providerModelRows.value.filter((row) =>
  !providerModelRowIsBlank(row) && (row.model.trim().length < 1 || providerModelRowContextSize(row) === null)
).length)
const duplicateProviderModelIds = computed(() => {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const row of completeProviderModelRows.value) {
    const alias = row.model.trim()
    if (seen.has(alias)) duplicates.add(alias)
    seen.add(alias)
  }
  return [...duplicates]
})
/** 目录命中的手动新增允许整表留空（自动补全）；编辑模式整表留空表示保留当前清单。 */
const providerModelsBlockSubmit = computed(() => {
  if (providerEditorIsCatalogMode.value) return false
  if (partialProviderModelRowCount.value > 0 || duplicateProviderModelIds.value.length > 0) return true
  return providerEditorModelFieldsRequired.value && completeProviderModelRows.value.length < 1
})
const providerModelRowsHint = computed(() => {
  if (providerEditorIsCatalogMode.value) return null
  if (duplicateProviderModelIds.value.length > 0) {
    return `模型别名重复：${duplicateProviderModelIds.value.join('、')}`
  }
  if (partialProviderModelRowCount.value > 0) return '有模型行缺少别名或有效的上下文 Token，请补全或清空该行。'
  if (providerEditorModelFieldsRequired.value && completeProviderModelRows.value.length < 1) {
    return '该服务不在 Kimi 供应商目录中，需至少填写一个模型（别名与上下文 Token）才能创建。'
  }
  if (providerEditorIsEditing.value && completeProviderModelRows.value.length < 1) {
    return '整表留空将保留当前模型清单；目录可识别的服务会自动补全。'
  }
  return null
})
const providerModelsEditorTitleSuffix = computed(() => {
  if (providerEditorIsEditing.value) return '（保存时整体替换）'
  if (providerEditorModelFieldsRequired.value) return '（至少一个）'
  return '（留空则从 Kimi 目录自动补全）'
})
const providerPickerLabel = computed(() => {
  if (providerEditorMode.value === 'manual') return '手动配置'
  const selected = catalogSelectedSummary.value
  return selected !== null ? selected.name : '选择供应商…'
})
function providerModelsOf(providerId: string): KimiSettingsSnapshot['secondaryModelOptions'] {
  return snapshot.value?.secondaryModelOptions.filter((model) => model.providerId === providerId) ?? []
}
const primaryModelDescriptor = computed(() => {
  const settings = snapshot.value
  if (settings === null) return null
  return settings.models.find((model) => model.id === settings.preferences.defaultModel) ?? null
})
const primaryThinkingOptions = computed(() =>
  (primaryModelDescriptor.value?.supportEfforts ?? []).filter(isSelectableThinkingEffort)
)
const primaryThinkingSelection = computed(() => {
  const effort = snapshot.value?.preferences.thinkingEffort ?? null
  if (effort === null) return ''
  return primaryThinkingOptions.value.find((option) =>
    option.toLocaleLowerCase() === effort.toLocaleLowerCase()
  ) ?? effort
})
const primaryThinkingSelectOptions = computed(() => {
  const options = [...primaryThinkingOptions.value]
  const selection = primaryThinkingSelection.value
  if (selection.length > 0 && !options.some((option) => option === selection)) options.push(selection)
  return options
})
const primaryThinkingUnsupported = computed(() => {
  const selection = primaryThinkingSelection.value
  return selection.length > 0 && primaryThinkingOptions.value.length > 0 &&
    !primaryThinkingOptions.value.some((option) => option === selection)
})
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
    syncSecondaryInputs(next)
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    pending.value = false
  }
}

function effectiveSecondarySelection(): { model: string; defaultEffort: string } | null {
  const settings = snapshot.value
  const descriptor = secondaryModelDescriptor.value
  if (settings === null || descriptor === null || secondaryFollowsPrimary.value) return null
  const preference = settings.secondaryModelControl.preference
  const effort = usesSecondaryRuntimePreference.value && preference.mode === 'configured'
    ? preference.defaultEffort
    : settings.secondaryModel.defaultEffort
  return { model: descriptor.id, defaultEffort: effort ?? '' }
}

function syncSecondaryInputs(settings: KimiSettingsSnapshot): void {
  secondaryMaxOutputInput.value = settings.secondaryModel.maxOutputSize?.toString() ?? ''
}

function emptyProviderModelRow(): ProviderModelRow {
  return { model: '', maxContextSize: '', displayName: '' }
}

function addProviderModelRow(): void {
  if (providerModelRows.value.length >= 64) return
  providerModelRows.value.push(emptyProviderModelRow())
}

function removeProviderModelRow(index: number): void {
  if (providerModelRows.value.length <= 1) return
  providerModelRows.value.splice(index, 1)
}

function resetSecondaryProviderDraft(): void {
  secondaryProviderDraft.value = {
    id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: ''
  }
  providerModelRows.value = [emptyProviderModelRow()]
  editingProviderId.value = null
}

function resetCatalogState(): void {
  providerEditorMode.value = 'catalog'
  catalogSummaries.value = []
  catalogLoading.value = false
  catalogError.value = null
  catalogSearch.value = ''
  selectedCatalogId.value = null
  catalogDetail.value = null
  catalogDetailLoading.value = false
}

async function loadCatalogSummaries(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || api.listKimiCatalogProviders === undefined) {
    providerEditorMode.value = 'manual'
    return
  }
  catalogLoading.value = true
  catalogError.value = null
  try {
    catalogSummaries.value = await api.listKimiCatalogProviders()
  } catch (reason) {
    catalogError.value = errorMessage(reason)
    providerEditorMode.value = 'manual'
  } finally {
    catalogLoading.value = false
  }
}

function switchProviderEditorMode(mode: 'catalog' | 'manual'): void {
  if (mode === providerEditorMode.value || actionPending.value !== null) return
  providerEditorMode.value = mode
  if (mode === 'catalog' && catalogSummaries.value.length < 1 && catalogError.value === null) {
    void loadCatalogSummaries()
  }
}

function toggleProviderPicker(): void {
  if (actionPending.value !== null) return
  providerPickerOpen.value = !providerPickerOpen.value
  if (providerPickerOpen.value && catalogSummaries.value.length < 1 && catalogError.value === null) {
    void loadCatalogSummaries()
  }
}

function closeProviderPicker(): void {
  providerPickerOpen.value = false
}

function chooseManualProvider(): void {
  if (actionPending.value !== null) return
  providerEditorMode.value = 'manual'
  selectedCatalogId.value = null
  catalogDetail.value = null
  catalogSearch.value = ''
  if (editingProviderId.value === null) {
    secondaryProviderDraft.value = {
      id: '', type: 'openai', baseUrl: '', apiKey: '', defaultModel: ''
    }
    providerModelRows.value = [emptyProviderModelRow()]
  }
  providerPickerOpen.value = false
}

async function chooseCatalogProvider(item: KimiCatalogProviderSummary): Promise<void> {
  providerEditorMode.value = 'catalog'
  await selectCatalogProvider(item)
  providerPickerOpen.value = false
}

async function selectCatalogProvider(item: KimiCatalogProviderSummary): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || item.rejected || item.id === selectedCatalogId.value) return
  selectedCatalogId.value = item.id
  catalogDetail.value = null
  catalogDetailLoading.value = true
  catalogError.value = null
  try {
    const detail = await api.getKimiCatalogProvider(item.id)
    catalogDetail.value = detail
    secondaryProviderDraft.value = {
      id: detail.id,
      type: detail.wireType ?? 'openai',
      baseUrl: '',
      apiKey: '',
      defaultModel: ''
    }
    providerModelRows.value = [emptyProviderModelRow()]
  } catch (reason) {
    catalogError.value = errorMessage(reason)
    selectedCatalogId.value = null
  } finally {
    catalogDetailLoading.value = false
  }
}

function beginAddSecondaryProvider(): void {
  resetSecondaryProviderDraft()
  resetCatalogState()
  showSecondaryProviderForm.value = true
  void loadCatalogSummaries()
}

function beginEditProvider(providerId: string): void {
  const settings = snapshot.value
  const provider = settings?.providers.find((item) => item.id === providerId)
  if (
    provider === undefined ||
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
    defaultModel: stripProviderPrefix(provider.defaultModel, provider.id)
  }
  // 用当前已配置的模型初始化模型表格；保存时整体替换该供应商的模型清单。
  const currentModels = providerModelsOf(providerId)
  providerModelRows.value = currentModels.length > 0
    ? currentModels.map((model) => ({
      model: stripProviderPrefix(model.id, providerId),
      maxContextSize: String(model.maxContextSize),
      displayName: model.displayName === model.id ? '' : model.displayName,
      capabilities: [...model.capabilities],
      supportEfforts: [...model.supportEfforts]
    }))
    : [emptyProviderModelRow()]
  showSecondaryProviderForm.value = true
}

function cancelProviderEditor(): void {
  showSecondaryProviderForm.value = false
  resetSecondaryProviderDraft()
  resetCatalogState()
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

function updatePrimaryThinkingEffort(value: string): void {
  void updatePreference({ thinkingEffort: value.trim().length < 1 ? null : value })
}

function isSelectableThinkingEffort(effort: string): boolean {
  const normalized = effort.trim()
  return normalized.length > 0 && normalized.toLocaleLowerCase() !== 'off'
}

function thinkingEffortLabel(effort: string): string {
  return {
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '超高',
    max: '最高'
  }[effort.trim().toLocaleLowerCase()] ?? effort
}

async function saveSecondaryModelConfig(input: {
  model: string
  defaultEffort?: string
  maxOutputSize?: number
}): Promise<void> {
  const api = window.kimiAgent
  if (
    api === undefined ||
    snapshot.value === null ||
    !snapshot.value.capabilities.secondaryModel.writable ||
    actionPending.value !== null
  ) return
  actionPending.value = 'secondary-model'
  error.value = null
  notice.value = null
  try {
    const next = await api.setSecondaryModel(input)
    snapshot.value = next
    syncSecondaryInputs(next)
    showNotice(next.secondaryModelControl.requiresRestart
      ? '子 Agent 模型已保存；重启 Kimi Runtime 后生效。'
      : '子 Agent 模型已更新；只影响之后新建的 Agent 和 AgentSwarm。')
  } catch (reason) {
    error.value = errorMessage(reason)
  } finally {
    actionPending.value = null
  }
}

/* 点选卡片立即生效：沿用当前强度与最大输出设置；目标模型不支持该强度时回落到模型默认。 */
function selectSecondaryModel(modelId: string): void {
  const settings = snapshot.value
  if (settings === null) return
  if (!secondaryFollowsPrimary.value && secondaryModelDescriptor.value?.id === modelId) return
  const currentEffort = effectiveSecondarySelection()?.defaultEffort ?? ''
  const descriptor = settings.secondaryModelOptions.find((model) => model.id === modelId)
  const preservedEffort = currentEffort.length > 0 && descriptor?.supportEfforts.includes(currentEffort) === true
    ? currentEffort
    : undefined
  const maxOutput = settings.capabilities.secondaryModel.maxOutputSizeWritable
    ? settings.secondaryModel.maxOutputSize ?? undefined
    : undefined
  void saveSecondaryModelConfig({
    model: modelId,
    ...(preservedEffort === undefined ? {} : { defaultEffort: preservedEffort }),
    ...(maxOutput === undefined ? {} : { maxOutputSize: maxOutput })
  })
}

function updateSecondaryEffort(effort: string): void {
  const current = effectiveSecondarySelection()
  if (current === null || current.defaultEffort === effort) return
  const maxOutput = snapshot.value?.capabilities.secondaryModel.maxOutputSizeWritable === true
    ? snapshot.value.secondaryModel.maxOutputSize ?? undefined
    : undefined
  void saveSecondaryModelConfig({
    model: current.model,
    ...(effort.length < 1 ? {} : { defaultEffort: effort }),
    ...(maxOutput === undefined ? {} : { maxOutputSize: maxOutput })
  })
}

function updateSecondaryMaxOutput(): void {
  const current = effectiveSecondarySelection()
  const settings = snapshot.value
  if (current === null || settings === null || !settings.capabilities.secondaryModel.maxOutputSizeWritable) return
  /* type="number" 的 v-model 会把输入转成 number，先统一回字符串再校验。 */
  const raw = String(secondaryMaxOutputInput.value).trim()
  if (raw.length < 1) {
    /* REST merge 语义无法清空已写入的值；留空时回显当前生效值，不做写入。 */
    secondaryMaxOutputInput.value = settings.secondaryModel.maxOutputSize?.toString() ?? ''
    return
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    secondaryMaxOutputInput.value = settings.secondaryModel.maxOutputSize?.toString() ?? ''
    error.value = '最大输出 Token 需为不小于 1 的整数。'
    return
  }
  if (settings.secondaryModel.maxOutputSize === parsed) return
  void saveSecondaryModelConfig({
    model: current.model,
    ...(current.defaultEffort.length < 1 ? {} : { defaultEffort: current.defaultEffort }),
    maxOutputSize: parsed
  })
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
    syncSecondaryInputs(next)
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
    syncSecondaryInputs(next)
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

async function refreshProviderModels(providerId: string): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || providerId.length < 1 || actionPending.value !== null) return
  actionPending.value = `refresh:provider:${providerId}`
  error.value = null
  notice.value = null
  try {
    const result = await api.refreshKimiProviders({ scope: 'provider', providerId })
    await loadSettings()
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
    const modelRows = completeProviderModelRows.value
    const defaultModel = (() => {
      const selected = secondaryProviderDraft.value.defaultModel.trim()
      if (selected.length > 0) return selected
      return modelRows[0]?.model.trim() ?? ''
    })()
    // 目录命中的手动新增允许整表留空：不发送 models，由主进程从 Kimi 目录补全。
    const modelsPayload = modelRows.length < 1 ? undefined : modelRows.map((row) => ({
      model: row.model.trim(),
      maxContextSize: providerModelRowContextSize(row)!,
      ...(row.displayName.trim().length < 1 ? {} : { displayName: row.displayName.trim() }),
      ...(row.capabilities === undefined || row.capabilities.length < 1
        ? {}
        : { capabilities: [...row.capabilities] }),
      ...(row.supportEfforts === undefined || row.supportEfforts.length < 1
        ? {}
        : { supportEfforts: [...row.supportEfforts] })
    }))
    if (oldId !== null && modelsPayload !== undefined) {
      // 编辑保存是整体替换语义：正在被子 Agent 使用的模型被移除时先确认。
      const inUse = secondaryModelDescriptor.value
      const removedInUse = inUse !== null &&
        providerModelsOf(oldId).some((model) => model.id === inUse.id) &&
        !modelRows.some((row) => `${oldId}/${row.model.trim()}` === inUse.id)
      if (
        removedInUse &&
        !window.confirm(`保存后 ${inUse!.id} 将从该服务中移除，当前子 Agent 模型选择将失效。确定继续吗？`)
      ) {
        actionPending.value = null
        return
      }
    }
    const next = oldId === null
      ? await api.addKimiProvider({
        id,
        type: secondaryProviderDraft.value.type,
        ...(baseUrl.length < 1 ? {} : { baseUrl }),
        ...(apiKey.length < 1 ? {} : { apiKey }),
        ...(defaultModel.length < 1 ? {} : { defaultModel }),
        ...(modelsPayload === undefined ? {} : { models: modelsPayload })
      })
      : await api.updateKimiProvider({
        id: oldId,
        ...(id === oldId ? {} : { newId: id }),
        type: secondaryProviderDraft.value.type,
        ...(baseUrl.length < 1 ? {} : { baseUrl }),
        ...(apiKey.length < 1 ? {} : { apiKey }),
        ...(defaultModel.length < 1 ? {} : { defaultModel }),
        ...(modelsPayload === undefined ? {} : { models: modelsPayload })
      })
    snapshot.value = next
    showSecondaryProviderForm.value = false
    resetSecondaryProviderDraft()
    resetCatalogState()
    showNotice(oldId === null
      ? (providerModelsOf(id).length > 0
        ? `${id} 已连接并读取到 ${providerModelsOf(id).length} 个模型。`
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

async function deleteProvider(providerId: string): Promise<void> {
  const api = window.kimiAgent
  const settings = snapshot.value
  const provider = settings?.providers.find((item) => item.id === providerId)
  if (
    api === undefined ||
    settings === null ||
    provider === undefined ||
    provider.id === managedProviderName.value ||
    !settings.capabilities.canDeleteProvider ||
    actionPending.value !== null
  ) return
  const modelWarning = providerModelsOf(providerId).length > 0
    ? `这会同时移除 ${providerModelsOf(providerId).length} 个模型别名，已选择的子 Agent 模型也会失效。`
    : '这会同时移除该服务的模型别名。'
  if (!window.confirm(`确定删除模型服务“${providerTitle(provider.id)}”？${modelWarning}`)) return
  actionPending.value = `secondary-provider:delete:${providerId}`
  error.value = null
  notice.value = null
  try {
    const next = await api.deleteKimiProvider(providerId)
    snapshot.value = next
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
  },
  { immediate: true }
)

watch(
  () => props.configRevision,
  () => {
    if (!props.open || actionPending.value !== null) return
    void loadSettings()
    void loadCapabilityTab()
  }
)

function toggleDescription(key: string): void {
  const next = new Set(expandedDescriptions.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedDescriptions.value = next
}

function measureDescriptionOverflow(): void {
  const root = rootRef.value
  if (root === null) return
  const overflow = new Set(expandedDescriptions.value)
  for (const element of root.querySelectorAll<HTMLElement>('.description-clamp')) {
    const key = element.dataset.key
    if (key === undefined || expandedDescriptions.value.has(key)) continue
    if (element.scrollHeight > element.clientHeight + 1) overflow.add(key)
  }
  descriptionOverflow.value = overflow
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !props.open) return
  event.preventDefault()
  if (showSecondaryProviderForm.value) {
    // Capture-phase: swallow Escape here so the App-level handler does not
    // close the whole settings panel while the provider dialog is open.
    event.stopImmediatePropagation()
    cancelProviderEditor()
    return
  }
  emit('close')
}

function onWindowMousedown(): void {
  if (providerPickerOpen.value) providerPickerOpen.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown, true)
  window.addEventListener('mousedown', onWindowMousedown)
  void nextTick(measureDescriptionOverflow)
})
onBeforeUnmount(() => {
  clearOAuthPoll()
  clearNoticeTimer()
  resetSecondaryProviderDraft()
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('mousedown', onWindowMousedown)
})
watch([skills, tools, mcpServers], () => void nextTick(measureDescriptionOverflow))

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
  <section v-if="open" ref="rootRef" class="settings-page" aria-label="Moon Code 设置">
    <nav class="settings-nav" aria-label="设置分类">
      <button class="settings-back" type="button" @click="emit('close')">
        <PhArrowLeft :size="16" />返回
      </button>
      <div class="settings-nav-divider" />
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'general' }" type="button" @click="activeTab = 'general'">
        <PhGearSix :size="17" />通用
      </button>
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'models' }" type="button" @click="activeTab = 'models'">
        <PhCpu :size="17" />模型
      </button>
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'skills' }" type="button" @click="activeTab = 'skills'">
        <PhMagicWand :size="17" />Skills
      </button>
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'tools' }" type="button" @click="activeTab = 'tools'">
        <PhPlugsConnected :size="17" />MCP 与工具
      </button>
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'usage' }" type="button" @click="activeTab = 'usage'">
        <PhChartDonut :size="17" />用量
      </button>
      <button class="settings-tab" :class="{ 'is-active': activeTab === 'archives' }" type="button" @click="activeTab = 'archives'">
        <PhArchive :size="17" />已归档任务
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
              <section v-if="activeTab === 'models'" class="settings-section model-settings-page">
                <div class="settings-title model-page-title">
                  <div>
                    <h2>模型设置</h2>
                    <p>选择主 Agent 和子 Agent 使用的模型。</p>
                  </div>
                </div>

                <div class="model-view-switch" role="tablist" aria-label="模型设置范围">
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="modelSettingsView === 'providers'"
                    :class="{ 'is-active': modelSettingsView === 'providers' }"
                    @click="modelSettingsView = 'providers'"
                  >供应商</button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="modelSettingsView === 'agents'"
                    :class="{ 'is-active': modelSettingsView === 'agents' }"
                    @click="modelSettingsView = 'agents'"
                  >主/子 Agent</button>
                </div>

                <section v-if="modelSettingsView === 'providers'" class="primary-model-panel provider-settings-panel" aria-labelledby="provider-settings-title">
                  <header>
                    <div>
                      <h3 id="provider-settings-title">供应商</h3>
                      <p>配置模型服务并授权 Kimi 账号；主 Agent 与子 Agent 都从这里选择模型。</p>
                    </div>
                    <button class="icon-text-button" type="button" :disabled="actionPending !== null" @click="refreshModels">
                      <PhArrowClockwise :class="{ spin: actionPending?.startsWith('refresh:') }" :size="15" />刷新
                    </button>
                  </header>
                  <p v-if="snapshot.capabilities.providerManagementUnavailableReason" class="provider-management-note">
                    {{ snapshot.capabilities.providerManagementUnavailableReason }}
                  </p>
                  <div class="provider-card-grid">
                    <article v-for="provider in secondaryProviders" :key="provider.id" class="provider-card">
                      <header class="provider-card-header">
                        <span class="provider-catalog-icon" :class="{ 'is-kimi': provider.id === managedProviderName }">
                          <PhCpu v-if="provider.id === managedProviderName" :size="18" />
                          <PhPlugsConnected v-else :size="18" />
                        </span>
                        <div class="provider-card-copy">
                          <strong>{{ providerTitle(provider.id) }}</strong>
                          <small>{{ provider.id === managedProviderName ? '内置' : provider.type }} · {{ providerStatusLabel(provider.status) }}</small>
                        </div>
                        <span class="provider-catalog-status" :class="`is-${provider.status}`" :title="providerStatusLabel(provider.status)" />
                      </header>
                      <div class="provider-card-meta">
                        <span v-if="provider.id === managedProviderName">{{ accountStatusLabel }}</span>
                        <span v-else>{{ provider.hasCredential ? 'API Key 已保存' : 'API Key 未配置' }}</span>
                        <span>{{ provider.baseUrl ?? 'Kimi 默认地址' }}</span>
                        <span>{{ provider.models.length }} 个模型</span>
                      </div>
                      <div v-if="provider.id === managedProviderName && oauthFlow?.status === 'pending'" class="oauth-device-panel">
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
                      <footer class="provider-card-actions">
                        <button class="provider-refresh-link" type="button" :disabled="actionPending !== null" @click="refreshProviderModels(provider.id)">
                          <PhArrowClockwise :class="{ spin: actionPending === `refresh:provider:${provider.id}` }" :size="15" />获取模型列表
                        </button>
                        <button
                          v-if="provider.id === managedProviderName && snapshot.auth.managedProvider?.status === 'authenticated'"
                          class="provider-oauth-logout secondary-button"
                          type="button"
                          :disabled="actionPending !== null"
                          @click="logoutOAuth"
                        ><PhSignOut :size="14" />退出登录</button>
                        <button
                          v-else-if="provider.id === managedProviderName"
                          class="provider-oauth-login primary-button"
                          type="button"
                          :disabled="actionPending !== null"
                          @click="startOAuthLogin"
                        >登录 Kimi</button>
                        <span class="provider-card-action-spacer" />
                        <button
                          v-if="snapshot.capabilities.canEditProvider && provider.id !== managedProviderName"
                          class="provider-icon-button"
                          type="button"
                          :disabled="actionPending !== null"
                          :aria-label="`编辑 ${providerTitle(provider.id)}`"
                          title="编辑模型服务"
                          @click="beginEditProvider(provider.id)"
                        ><PhPencilSimple :size="15" /></button>
                        <button
                          v-if="snapshot.capabilities.canDeleteProvider && provider.id !== managedProviderName"
                          class="provider-icon-button is-danger"
                          type="button"
                          :disabled="actionPending !== null"
                          :aria-label="`删除 ${providerTitle(provider.id)}`"
                          title="删除模型服务"
                          @click="deleteProvider(provider.id)"
                        ><PhTrash :size="15" /></button>
                      </footer>
                    </article>

                    <button
                      v-if="snapshot.capabilities.canAddProvider"
                      class="provider-add-card"
                      :class="{ 'is-active': showSecondaryProviderForm }"
                      type="button"
                      :disabled="actionPending !== null"
                      @click="beginAddSecondaryProvider"
                    ><PhPlus :size="16" />添加模型服务</button>
                  </div>

                  <Teleport to="body">
                    <div
                      v-if="showSecondaryProviderForm && (snapshot.capabilities.canAddProvider || (providerEditorIsEditing && snapshot.capabilities.canEditProvider))"
                      class="provider-editor-backdrop"
                      @mousedown.self="cancelProviderEditor"
                    >
                      <form
                        v-if="showSecondaryProviderForm && (snapshot.capabilities.canAddProvider || (providerEditorIsEditing && snapshot.capabilities.canEditProvider))"
                        class="secondary-provider-form provider-editor-dialog glass-panel"
                        @submit.prevent="saveSecondaryProvider"
                      >
                        <header class="provider-detail-header">
                          <div>
                            <span class="provider-detail-icon"><PhPlus :size="20" /></span>
                            <div><h3>{{ providerEditorTitle }}</h3><p>{{ providerEditorIsEditing ? '更新连接名称、协议或地址；留空 API Key 将保留已保存凭据。' : '先选择供应商，其余信息会自动带入；也可以手动配置私有或目录外的兼容接口。' }}</p></div>
                          </div>
                          <button class="provider-dialog-close" type="button" :disabled="actionPending !== null" aria-label="关闭" title="关闭" @click="cancelProviderEditor"><PhX :size="16" /></button>
                        </header>
                        <label v-if="!providerEditorIsEditing" class="provider-picker-field">
                          <span>供应商选择</span>
                          <div class="provider-picker">
                            <button type="button" class="provider-picker-trigger" :disabled="actionPending !== null" @mousedown.stop @click="toggleProviderPicker">
                              <span>{{ providerPickerLabel }}</span><PhCaretDown :size="14" />
                            </button>
                            <div v-if="providerPickerOpen" class="provider-picker-popover" @mousedown.stop>
                              <input v-model="catalogSearch" type="search" placeholder="搜索供应商（名称或 ID）…" autocomplete="off" spellcheck="false" />
                              <p v-if="catalogLoading" class="provider-catalog-hint">正在加载 Kimi 供应商目录…</p>
                              <p v-else-if="catalogError" class="field-error">{{ catalogError }}</p>
                              <template v-else>
                                <div class="provider-picker-options">
                                  <button
                                    v-for="item in catalogSearchResults"
                                    :key="item.id"
                                    type="button"
                                    class="provider-picker-option"
                                    :class="{ 'is-selected': item.id === selectedCatalogId, 'is-rejected': item.rejected }"
                                    :disabled="item.rejected"
                                    :title="item.rejected ? (item.rejectReason ?? '该供应商无法导入') : undefined"
                                    @click="chooseCatalogProvider(item)"
                                  >
                                    <span class="provider-catalog-copy">
                                      <strong>{{ item.name }}</strong>
                                      <small>{{ item.id }} · {{ item.modelCount }} 个模型{{ item.needsBaseUrl ? ' · 需填写服务地址' : '' }}</small>
                                    </span>
                                  </button>
                                  <p v-if="catalogSearchResults.length < 1" class="provider-catalog-hint">没有匹配的供应商。</p>
                                </div>
                              </template>
                              <div class="provider-picker-divider" />
                              <button type="button" class="provider-picker-option provider-picker-manual" :class="{ 'is-selected': providerEditorMode === 'manual' }" @click="chooseManualProvider">
                                <span class="provider-catalog-copy"><strong>手动配置</strong><small>自定义协议、地址与模型别名</small></span>
                              </button>
                            </div>
                          </div>
                        </label>
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
                          <label v-if="!providerEditorIsCatalogMode || catalogRequiresBaseUrl" class="provider-form-wide">
                            <span>API Base URL</span>
                            <input v-model="secondaryProviderDraft.baseUrl" type="url" maxlength="2048" placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                          </label>
                          <label class="provider-form-wide">
                            <span>API Key</span>
                            <input v-model="secondaryProviderDraft.apiKey" type="password" maxlength="8192" :placeholder="catalogApiKeyPlaceholder" autocomplete="new-password" spellcheck="false" :disabled="actionPending !== null" />
                          </label>
                          <label v-if="providerEditorIsCatalogMode" class="provider-form-wide">
                            <span>默认模型</span>
                            <select v-model="secondaryProviderDraft.defaultModel" :disabled="actionPending !== null || catalogDetail === null">
                              <option value="" disabled>{{ catalogDetail === null ? '请先在上方选择一个供应商' : '选择默认模型（必选）' }}</option>
                              <option v-for="model in catalogDetail?.models ?? []" :key="model.id" :value="model.id" :title="`${model.maxContextSize.toLocaleString()} tokens`">
                                {{ model.name ?? model.id }}{{ model.maxContextSize > 0 ? ` · ${model.maxContextSize.toLocaleString()} tokens` : '' }}
                              </option>
                            </select>
                          </label>
                          <template v-else>
                            <div class="provider-form-wide provider-models-editor">
                              <span class="provider-models-editor-title">模型清单{{ providerModelsEditorTitleSuffix }}</span>
                              <div class="provider-models-head" aria-hidden="true"><span>模型别名</span><span>上下文 Token</span><span>显示名（可选）</span><span /></div>
                              <div v-for="(row, index) in providerModelRows" :key="index" class="provider-model-row">
                                <input v-model="row.model" type="text" maxlength="256" placeholder="例如 glm-5.3" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                                <input v-model="row.maxContextSize" type="number" min="1" max="16777216" placeholder="例如 131072" autocomplete="off" :disabled="actionPending !== null" />
                                <input v-model="row.displayName" type="text" maxlength="256" placeholder="可选" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                                <button
                                  type="button"
                                  class="provider-icon-button is-danger"
                                  :aria-label="`移除模型 ${row.model || index + 1}`"
                                  title="移除该模型"
                                  :disabled="actionPending !== null || providerModelRows.length <= 1"
                                  @click="removeProviderModelRow(index)"
                                ><PhTrash :size="14" /></button>
                              </div>
                              <button type="button" class="provider-disclosure-button provider-model-add" :disabled="actionPending !== null || providerModelRows.length >= 64" @click="addProviderModelRow"><PhPlus :size="14" />添加模型</button>
                            </div>
                            <label class="provider-form-wide">
                              <span>默认模型</span>
                              <select v-if="completeProviderModelRows.length > 0" v-model="secondaryProviderDraft.defaultModel" :disabled="actionPending !== null">
                                <option value="">使用首个模型</option>
                                <option v-for="row in completeProviderModelRows" :key="row.model.trim()" :value="row.model.trim()">
                                  {{ row.displayName.trim() || row.model.trim() }}
                                </option>
                              </select>
                              <input v-else v-model="secondaryProviderDraft.defaultModel" type="text" maxlength="256" placeholder="留空则自动选择首个模型" autocomplete="off" spellcheck="false" :disabled="actionPending !== null" />
                            </label>
                          </template>
                        </div>
                        <p v-if="providerModelRowsHint !== null" class="provider-catalog-hint">{{ providerModelRowsHint }}</p>
                        <p v-if="secondaryProviderIdExists" class="field-error">这个连接名称已存在。</p>
                        <p class="credential-note">API Key 交给 Kimi 官方配置保存，Moon Code 不会回读或另存。</p>
                        <div class="provider-form-actions">
                          <button class="secondary-button" type="button" :disabled="actionPending !== null" @click="cancelProviderEditor">取消</button>
                          <button class="primary-button" type="submit" :disabled="actionPending !== null || secondaryProviderDraft.id.trim().length < 1 || secondaryProviderIdExists || (providerEditorIsCatalogMode && secondaryProviderDraft.defaultModel.trim().length < 1) || (catalogRequiresBaseUrl && secondaryProviderDraft.baseUrl.trim().length < 1) || providerModelsBlockSubmit">{{ providerEditorSubmitLabel }}</button>
                        </div>
                      </form>
                    </div>
                  </Teleport>
                </section>

                <template v-else-if="modelSettingsView === 'agents'">
                  <div v-if="snapshot.models.length < 1" class="agents-model-panel">
                    <div class="primary-model-empty">
                      <span>还没有可用模型。先在「供应商」页配置模型服务并授权。</span>
                      <button class="secondary-button" type="button" @click="modelSettingsView = 'providers'">前往供应商设置</button>
                    </div>
                  </div>
                  <div v-else class="agents-model-panel">
                  <section class="primary-model-panel" aria-labelledby="primary-model-title">
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
                  <label class="preference-row primary-thinking-row">
                    <span><strong>默认思考强度</strong><small>创建新 Session 时使用；不同模型支持的强度不同</small></span>
                    <select
                      v-if="primaryThinkingSelectOptions.length > 0"
                      :value="primaryThinkingSelection"
                      :disabled="actionPending !== null"
                      @change="updatePrimaryThinkingEffort(($event.target as HTMLSelectElement).value)"
                    >
                      <option value="">跟随模型默认</option>
                      <option v-for="effort in primaryThinkingSelectOptions" :key="effort" :value="effort">{{ thinkingEffortLabel(effort) }}</option>
                    </select>
                    <small v-else class="primary-thinking-fixed">当前模型的思考强度由模型自身决定</small>
                  </label>
                  <p v-if="primaryThinkingUnsupported" class="field-error">当前主模型不支持已配置的强度，Kimi 将回退到模型默认值。</p>
                </section>

                <section class="secondary-model-workspace" aria-labelledby="secondary-model-title">
                  <header class="agents-section-header">
                    <div>
                      <h3 id="secondary-model-title">子 Agent 模型</h3>
                      <p>新建子 Agent / AgentSwarm 时使用。</p>
                    </div>
                    <span class="model-scope-chip">{{ secondaryOutcomeState }}</span>
                  </header>
                  <div class="secondary-follow-line">
                    <template v-if="secondaryFollowsPrimary">
                      <span>当前跟随主模型</span>
                      <strong>{{ primaryModelDescriptor?.displayName ?? snapshot.preferences.defaultModel ?? '未配置' }}</strong>
                      <small v-if="snapshot.capabilities.secondaryModel.writable">点选下方模型可指定独立模型</small>
                    </template>
                    <button v-else-if="snapshot.capabilities.secondaryModel.canDisable" class="secondary-button" type="button" :disabled="actionPending !== null" @click="disableSecondaryModel">跟随主模型</button>
                  </div>

                  <div class="primary-model-grid secondary-model-grid">
                    <button
                      v-for="model in snapshot.secondaryModelOptions"
                      :key="model.id"
                      class="model-row"
                      :class="{ 'is-selected': !secondaryFollowsPrimary && secondaryModelDescriptor?.id === model.id }"
                      type="button"
                      :disabled="actionPending !== null || !snapshot.capabilities.secondaryModel.writable"
                      @click="selectSecondaryModel(model.id)"
                    >
                      <span class="model-check"><PhCheck v-if="!secondaryFollowsPrimary && secondaryModelDescriptor?.id === model.id" :size="13" /></span>
                      <span><strong>{{ model.displayName }}</strong><small>{{ model.id }} · {{ model.providerId }}</small></span>
                      <small>{{ Math.round(model.maxContextSize / 1024) }}k</small>
                    </button>
                  </div>

                  <template v-if="!secondaryFollowsPrimary && snapshot.capabilities.secondaryModel.writable">
                    <label v-if="(secondaryModelDescriptor?.supportEfforts.length ?? 0) > 0" class="preference-row">
                      <span><strong>默认思考强度</strong><small>只影响之后新建的子 Agent</small></span>
                      <select
                        :value="effectiveSecondarySelection()?.defaultEffort ?? ''"
                        :disabled="actionPending !== null"
                        @change="updateSecondaryEffort(($event.target as HTMLSelectElement).value)"
                      >
                        <option value="">使用模型默认值</option>
                        <option v-for="effort in secondaryModelDescriptor?.supportEfforts ?? []" :key="effort" :value="effort">{{ thinkingEffortLabel(effort) }}</option>
                      </select>
                    </label>
                    <label v-if="snapshot.capabilities.secondaryModel.maxOutputSizeWritable" class="preference-row">
                      <span><strong>最大输出 Token</strong><small>留空使用模型默认值；修改即保存</small></span>
                      <input v-model="secondaryMaxOutputInput" type="number" min="1" max="16777216" placeholder="使用模型默认值" :disabled="actionPending !== null" @change="updateSecondaryMaxOutput" />
                    </label>
                  </template>
                  <p v-if="!snapshot.capabilities.secondaryModel.writable" class="secondary-readonly-note">{{ snapshot.capabilities.secondaryModel.unavailableReason ?? '当前 Runtime 只能读取这项设置。' }}</p>

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
                  </div>
                </template>
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
                    <div><strong>/{{ skill.name }}</strong>
                      <span class="description-line">
                        <small class="description-clamp" :class="{ 'is-expanded': expandedDescriptions.has(skill.name) }" :data-key="skill.name">{{ skill.description || '无描述' }}</small>
                        <button v-if="descriptionOverflow.has(skill.name)" type="button" class="description-toggle" @click="toggleDescription(skill.name)">{{ expandedDescriptions.has(skill.name) ? '收起' : '展开' }}</button>
                      </span>
                    </div>
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
                    <div><strong>{{ server.name }}</strong><small>{{ server.transport }} · {{ server.toolCount }} tools</small>
                      <span v-if="server.lastError" class="description-line">
                        <small class="is-error description-clamp" :class="{ 'is-expanded': expandedDescriptions.has(server.id) }" :data-key="server.id">{{ server.lastError }}</small>
                        <button v-if="descriptionOverflow.has(server.id)" type="button" class="description-toggle" @click="toggleDescription(server.id)">{{ expandedDescriptions.has(server.id) ? '收起' : '展开' }}</button>
                      </span>
                    </div>
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
                    <div><strong>{{ tool.name }}</strong>
                      <span class="description-line">
                        <small class="description-clamp" :class="{ 'is-expanded': expandedDescriptions.has(tool.name) }" :data-key="tool.name">{{ tool.description || '无描述' }}</small>
                        <button v-if="descriptionOverflow.has(tool.name)" type="button" class="description-toggle" @click="toggleDescription(tool.name)">{{ expandedDescriptions.has(tool.name) ? '收起' : '展开' }}</button>
                      </span>
                    </div>
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
                      <small>{{ archivedTime(session.archivedAt ?? session.updatedAt) }}</small>
                    </div>
                    <button class="secondary-button" type="button" :disabled="actionPending !== null" @click="restoreSession(session.id)">
                      <PhArrowCounterClockwise :class="{ spin: actionPending === `session:restore:${session.id}` }" :size="14" />恢复
                    </button>
                  </article>
                </div>
              </section>

            </template>
    </div>
    <Transition name="settings-toast">
      <div v-if="error" class="settings-message is-error" role="alert">{{ error }}</div>
      <div v-else-if="notice" class="settings-message" role="status" aria-live="polite"><PhCheck :size="14" />{{ notice }}</div>
    </Transition>
  </section>
</template>
