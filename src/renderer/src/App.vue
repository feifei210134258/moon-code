<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import ProjectSidebar from './components/ProjectSidebar.vue'
import ConversationPane from './components/ConversationPane.vue'
import ExtensionsPanel from './components/ExtensionsPanel.vue'
import FilePreviewDialog from './components/FilePreviewDialog.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import RuntimeConnectDialog from './components/RuntimeConnectDialog.vue'
import PlanViewerPanel from './components/PlanViewerPanel.vue'
import { useRuntimeBridge } from './composables/useRuntimeBridge'
import { useBrowserBridge } from './composables/useBrowserBridge'
import { useUsageBridge } from './composables/useUsageBridge'
import { activityFixtureTurns, approvalFixture, questionFixture, sessionWarningFixture } from './dev/interactionFixtures'
import { useWorkbenchStore } from './stores/workbench'
import { normalizeWorkspaceFileReference, workspaceFileDestination } from './utils/fileRouting'
import { setRendererLocale } from './i18n/rendererLocale'
import type {
  BrowserElementPickResult,
  BrowserPickedElement,
  KimiAgentTranscript,
  KimiSessionOperationalState,
  KimiPromptControls,
  KimiPromptSkill,
  KimiSideChatView,
  KimiUploadedFile,
  PetOpenSessionIntent,
  PlanReview,
  QuestionAnswerInput,
  SessionAgentView,
  SessionUsageSummary,
  WorkspaceFileEntry,
  WorkspaceFileSearchItem
} from '@shared/contracts'
import type { LocalPromptDraft } from './utils/localPromptQueue'
import type { ExtensionTab } from './types'

const store = useWorkbenchStore()
const showSettingsFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('settings-fixture')
const {
  projects,
  activeWorkspaceId,
  activeSessionId,
  draftActive,
  draftWorkspaceId,
  activeExtension,
  rightPanelOpen,
  leftPanelWidth,
  rightPanelWidth,
  terminalOpen,
  turns,
  transcriptPhase,
  transcriptError,
  sessionArchivedNotice
} = storeToRefs(store)
const runtimeBridge = useRuntimeBridge()
const browserBridge = useBrowserBridge()
const usageBridge = useUsageBridge()
const settingsOpen = ref(showSettingsFixture)
const showInteractionFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('interaction-fixture')
const showActivityFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('activity-fixture')
const showBrowserFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('browser-fixture')
const showUsageFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('usage-fixture')
const showOperationalFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('operational-fixture')
const showSideChatFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('side-chat-fixture')
const showAgentFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('agent-fixture')
const showMentionFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('mention-fixture')
const usageOpen = ref(showUsageFixture)
const contextOpen = ref(false)
const branchesOpen = ref(false)
const usageSessionFixture = ref<SessionUsageSummary | null>(null)
const operationalStateFixture = ref<KimiSessionOperationalState | null>(null)
const localPromptQueueFixtureState = ref<LocalPromptDraft[] | null>(null)
const conversationPane = ref<InstanceType<typeof ConversationPane> | null>(null)
const pendingPetIntent = ref<PetOpenSessionIntent | null>(null)
const selectedAgentId = ref<string | null>(null)
let stopPetOpenListener: (() => void) | null = null
const activeSessionView = computed(() => (
  runtimeBridge.sessionView.value?.sessionId === activeSessionId.value
    ? runtimeBridge.sessionView.value
    : null
))
const activeSessionUsage = computed<SessionUsageSummary | null>(() => {
  const usage = activeSessionView.value?.usage ?? null
  const status = runtimeBridge.sessionRuntimeStatus.value
  if (status === null) return usage
  return {
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    cacheReadTokens: usage?.cacheReadTokens ?? 0,
    cacheCreationTokens: usage?.cacheCreationTokens ?? 0,
    totalCostUsd: usage?.totalCostUsd ?? null,
    contextTokens: status.contextTokens,
    contextLimit: status.maxContextTokens,
    turnCount: usage?.turnCount ?? null
  }
})
const visibleApprovals = computed(() => activeSessionView.value?.pendingApprovals ?? (
  showInteractionFixture ? [approvalFixture] : []
))
const visibleQuestions = computed(() => activeSessionView.value?.pendingQuestions ?? (
  showInteractionFixture ? [questionFixture] : []
))
const visibleTurns = computed(() => showActivityFixture ? activityFixtureTurns : turns.value)
const recallablePromptTurnId = computed<string | null>(() => {
  const session = activeSessionView.value
  if (session === null || session.mainTurnActive || session.phase !== 'ready') return null
  const items = visibleTurns.value
  let userIndex = items.length - 1
  while (userIndex >= 0 && items[userIndex]?.role !== 'user') userIndex -= 1
  const userTurn = items[userIndex]
  if (
    userTurn === undefined ||
    userTurn.queued === true ||
    (userTurn.originKind !== undefined && userTurn.originKind !== 'user')
  ) return null
  const trailingTurns = items.slice(userIndex + 1)
  return trailingTurns.every((turn) => (
    turn.role === 'assistant' && turn.pending !== true && turn.blocks.length === 0
  )) ? userTurn.id : null
})
const visibleWarnings = computed(() => showActivityFixture ? sessionWarningFixture : runtimeBridge.sessionWarnings.value)
watch(
  () => usageBridge.state.value.preferences.locale,
  (locale) => {
    setRendererLocale(locale ?? 'zh-CN')
  },
  { immediate: true }
)
const composerEnabled = computed(() => showOperationalFixture || (
  runtimeBridge.runtime.value.status === 'running' &&
  (draftActive.value || (activeSessionId.value.length > 0 && transcriptPhase.value === 'ready'))
))
const terminalEnabled = computed(() => (
  runtimeBridge.runtime.value.status === 'running' &&
  activeSessionId.value.length > 0 &&
  transcriptPhase.value === 'ready'
))
const activeWorkspaceName = computed(() => projects.value.find((project) =>
  project.id === activeWorkspaceId.value
)?.name ?? '项目文件')
const visibleOperational = computed(() => operationalStateFixture.value ?? runtimeBridge.sessionOperational.value)
const visibleLocalPromptQueue = computed(() => localPromptQueueFixtureState.value ?? runtimeBridge.localPromptQueue.value)
const sideChatFixture: KimiSideChatView = {
  agentId: 'fixture-btw-agent',
  active: true,
  error: null,
  messages: [
    {
      id: 'fixture-btw-user', sessionId: 'fixture-session', role: 'user',
      content: [{ type: 'text', text: '只检查这次改动有没有遗漏，不要影响主任务。' }],
      createdAt: '2026-07-24T07:30:00.000Z', promptId: 'fixture-prompt', status: 'completed'
    },
    {
      id: 'fixture-btw-assistant', sessionId: 'fixture-session', role: 'assistant',
      content: [{ type: 'text', text: '正在核对 Side Chat 的消息隔离、流式状态与关闭行为。' }],
      createdAt: '2026-07-24T07:30:01.000Z', promptId: 'fixture-prompt', status: 'pending'
    }
  ]
}
const visibleSideChat = computed(() => showSideChatFixture ? sideChatFixture : activeSessionView.value?.sideChat ?? null)
const selectedAgent = computed(() => activeSessionView.value?.agents.find((agent) => agent.id === selectedAgentId.value) ?? null)
const agentDetailFixture: SessionAgentView = {
  id: 'fixture-reviewer', role: 'subagent', name: 'Reviewer', description: '检查实现与测试覆盖',
  status: 'completed', subagentType: 'review', parentAgentId: 'main', parentToolCallId: 'fixture-tool',
  swarmIndex: 0, runInBackground: false, model: 'kimi-for-coding', thinkingEffort: 'high',
  towerMode: null,
  createdAt: '2026-07-24T07:30:00.000Z',
  startedAt: '2026-07-24T07:30:01.000Z', completedAt: '2026-07-24T07:30:05.000Z',
  suspendedReason: null, outputPreview: '核心路径已有覆盖。',
  usage: { inputTokens: 1084, outputTokens: 216, cacheReadTokens: 640, cacheCreationTokens: 0, contextTokens: 1940 }
}
const agentTranscriptFixture: KimiAgentTranscript = {
  agentId: agentDetailFixture.id,
  hasMore: false,
  usage: null,
  messages: [
    {
      id: 'fixture-agent-user', sessionId: 'fixture-session', role: 'user',
      content: [{ type: 'text', text: '审查 BTW Side Chat 的隔离边界与窄窗口行为。' }],
      createdAt: '2026-07-24T07:30:01.000Z', promptId: 'fixture-agent-turn', status: 'completed'
    },
    {
      id: 'fixture-agent-assistant', sessionId: 'fixture-session', role: 'assistant',
      content: [{ type: 'text', text: '主 Transcript 与 BTW Agent 流已隔离；窄窗口层级也通过验收。' }],
      createdAt: '2026-07-24T07:30:02.000Z', promptId: 'fixture-agent-turn', status: 'completed'
    }
  ]
}
const visibleAgentDetail = computed(() => showAgentFixture ? agentDetailFixture : selectedAgent.value)
const visibleAgentTranscript = computed(() => showAgentFixture ? agentTranscriptFixture : runtimeBridge.agentTranscript.value)
const mentionFixtureItems: WorkspaceFileSearchItem[] = [
  { path: 'src/renderer/src/App.vue', name: 'App.vue', kind: 'file', score: 1, matchPositions: [] },
  { path: 'src/renderer/src/components/ComposerBar.vue', name: 'ComposerBar.vue', kind: 'file', score: 0.96, matchPositions: [] },
  { path: 'docs/adr', name: 'adr', kind: 'directory', score: 0.8, matchPositions: [] }
]

async function searchMentionFiles(query: string): Promise<WorkspaceFileSearchItem[]> {
  if (!showMentionFixture) return await runtimeBridge.searchMentionFiles(query)
  const normalized = query.trim().toLowerCase()
  return normalized.length === 0
    ? mentionFixtureItems
    : mentionFixtureItems.filter((item) => `${item.name} ${item.path}`.toLowerCase().includes(normalized))
}

async function submitPrompt(
  text: string,
  attachments: KimiUploadedFile[],
  controls: KimiPromptControls,
  goalMode: boolean,
  deliveryMode: 'queue' | 'steer',
  webElements: BrowserPickedElement[],
  skills: KimiPromptSkill[] = []
): Promise<void> {
  let sessionId = activeSessionId.value
  if (sessionId.length === 0) {
    /* 草稿态首条消息：先真正创建并打开会话，成功后才发送；失败则保持草稿态。 */
    if (!draftActive.value) return
    if (draftWorkspaceId.value.length === 0) {
      runtimeBridge.lifecycleError.value = '请先选择项目'
      return
    }
    const result = await runtimeBridge.createSession(draftWorkspaceId.value)
    if (result === null) return
    store.selectSession(result.sessionId)
    /* main 侧要求会话已激活才能接收 Prompt；watcher 的 openSession 不等待，
       这里显式等一次，避免首条消息撞上『Kimi session is not active』。 */
    await runtimeBridge.openSession(result.sessionId)
    sessionId = result.sessionId
  }
  const accepted = await runtimeBridge.submitPrompt(sessionId, {
    text,
    ...(attachments.length === 0 ? {} : { attachments }),
    ...(webElements.length === 0 ? {} : { webElements }),
    ...(skills.length === 0 ? {} : { skills }),
    controls,
    ...(goalMode ? { goalObjective: text.trim() } : {}),
    deliveryMode
  })
  if (accepted) store.markConversationActivity(sessionId)
}

/* 失败卡片的一键恢复：重新发送最近一条用户 prompt（相同文本，使用当前会话
   控制设置）。这与 store 尚无的 resume/continue 语义等价的恢复方式。 */
function resumeFailedTurn(text: string): void {
  const sessionId = activeSessionId.value
  const controls = runtimeBridge.promptControls.value
  if (sessionId.length === 0 || controls === null || text.length === 0) return
  void runtimeBridge.submitPrompt(sessionId, { text, controls })
}

/* 页内点选元素：会话循环里每点一个元素立即加入输入框 chip，随下一条消息一起提交。 */
function pickBrowserElements(): void {
  void browserBridge.pickElements((elements) => conversationPane.value?.addWebElements(elements))
}

function stopBrowserElementPick(): void {
  browserBridge.stopPicking()
}

function openSettings(): void {
  usageOpen.value = false
  contextOpen.value = false
  branchesOpen.value = false
  settingsOpen.value = true
}

/* 侧栏底栏徽标：Runtime 运行中显示 Kimi 版本短号（0.39），其余情况不显示。 */
const runtimeVersionBadge = computed<string | null>(() => {
  const runtime = runtimeBridge.runtime.value
  if (runtime.status !== 'running' || runtime.version === null) return null
  return /^(\d+\.\d+)/.exec(runtime.version)?.[1] ?? runtime.version
})

function toggleBranches(): void {
  branchesOpen.value = !branchesOpen.value
  usageOpen.value = false
  contextOpen.value = false
  if (branchesOpen.value && activeSessionId.value.length > 0) {
    void runtimeBridge.loadGitBranches(activeSessionId.value)
  }
}

function toggleContext(): void {
  contextOpen.value = !contextOpen.value
  usageOpen.value = false
  branchesOpen.value = false
}

function toggleUsage(): void {
  usageOpen.value = !usageOpen.value
  contextOpen.value = false
  branchesOpen.value = false
}

function toggleExtensions(): void {
  store.rightPanelOpen = !store.rightPanelOpen
}

function toggleTerminal(): void {
  if (!terminalEnabled.value) return
  store.toggleTerminal()
}

function toggleRuntime(): void {
  void runtimeBridge.toggle()
}

async function addWorkspace(options?: { forDraft?: boolean }): Promise<void> {
  const workspaceId = await runtimeBridge.addWorkspace()
  if (workspaceId === null) return
  if (options?.forDraft === true && draftActive.value) {
    /* 草稿下拉里的「打开文件夹」：保持草稿态，只把新项目设为草稿项目。 */
    store.setDraftWorkspace(workspaceId)
    return
  }
  store.exitDraft()
  store.selectWorkspace(workspaceId)
  /* 打开项目文件夹后自动新建会话并选中，省去手动点『新建任务』。 */
  const result = await runtimeBridge.createSession(workspaceId)
  if (result !== null) store.selectSession(result.sessionId)
}

function startDraftSession(workspaceId: string): void {
  const hadSession = activeSessionId.value.length > 0
  store.startDraft(workspaceId)
  /* activeSessionId 变化时 watcher 会补载草稿 controls；本就为空时不会触发，这里直接补。 */
  if (!hadSession && runtimeBridge.runtime.value.status === 'running') {
    void runtimeBridge.loadDraftControls()
  }
}

function openDraftWorkspaceFolder(): void {
  void addWorkspace({ forDraft: true })
}

async function forkSession(sessionId: string): Promise<void> {
  const result = await runtimeBridge.forkSession(sessionId)
  if (result !== null) store.selectSession(result.sessionId)
}

async function selectRestoredSession(sessionId: string): Promise<void> {
  await runtimeBridge.refreshWorkspaceTree()
  store.selectSession(sessionId)
}

async function loadSessionChildren(sessionId: string): Promise<void> {
  const children = await runtimeBridge.loadSessionChildren(sessionId)
  store.mergeSessionChildren(sessionId, children)
}

function respondApproval(
  approvalId: string,
  response: {
    decision: 'approved' | 'rejected' | 'cancelled'
    scope?: 'session'
    feedback?: string
    selectedLabel?: string
  }
): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.respondApproval(activeSessionId.value, approvalId, response)
}

function respondQuestion(questionId: string, answers: Record<string, QuestionAnswerInput>): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.respondQuestion(activeSessionId.value, questionId, answers)
}

function dismissQuestion(questionId: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.dismissQuestion(activeSessionId.value, questionId)
}

function compactSession(instruction?: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.compactSession(activeSessionId.value, instruction)
}

async function undoSession(): Promise<void> {
  if (activeSessionId.value.length === 0) return
  const draft = await runtimeBridge.undoSession(activeSessionId.value)
  if (draft !== null) await conversationPane.value?.loadPromptDraft(draft.text, draft.attachments)
}

function startSideChat(): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.startSideChat(activeSessionId.value)
}

function sendSideChat(agentId: string, text: string): void {
  const controls = runtimeBridge.promptControls.value
  if (activeSessionId.value.length === 0 || controls === null) return
  void runtimeBridge.submitSideChatPrompt(activeSessionId.value, agentId, { text, controls })
}

function closeSideChat(agentId: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.closeSideChat(activeSessionId.value, agentId)
}

function openAgent(agent: SessionAgentView): void {
  if (activeSessionId.value.length === 0) return
  selectedAgentId.value = agent.id
  void runtimeBridge.loadAgentTranscript(activeSessionId.value, agent.id)
}

function closeAgent(): void {
  selectedAgentId.value = null
  runtimeBridge.clearAgentTranscript()
}

function openPlanReview(review: PlanReview): void {
  store.openPlanReview(review)
}

/* 计划反馈优先走真实 respondApproval feedback 通道：按 plan 的 tool_call_id 关联
   当前待审批交互（快照/事件维护的 pendingApprovals）。反馈语义为「驳回并修订」，
   即以 rejected + feedback 让模型按意见重出计划；找不到匹配的待审批项（如 auto
   模式无审批）时降级为灌入 Composer 草稿，不伪造任何审批关联。 */
function sendPlanFeedback(text: string): void {
  const plan = store.planReview
  store.closePlanReview()
  if (plan === null || activeSessionId.value.length === 0) return
  const approval = activeSessionView.value?.pendingApprovals.find(
    (item) => item.toolCallId === plan.toolCallId
  )
  if (approval !== undefined) {
    void runtimeBridge.respondApproval(activeSessionId.value, approval.approvalId, {
      decision: 'rejected',
      feedback: text
    })
    return
  }
  /* 无关联的待审批项：保留草稿兜底（Plan 模式下即普通消息修订指示）。 */
  void conversationPane.value?.loadPromptDraft(text)
}

function controlGoal(control: 'pause' | 'resume' | 'cancel'): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.controlGoal(activeSessionId.value, control)
}

function steerPrompt(promptId: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.steerPrompts(activeSessionId.value, [promptId])
}

function abortPrompt(promptId: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.abortPrompt(activeSessionId.value, promptId)
}

function editLocalPrompt(draftId: string): void {
  if (activeSessionId.value.length === 0) return
  const draft = runtimeBridge.takeLocalPromptDraft(activeSessionId.value, draftId)
  if (draft === null) return
  runtimeBridge.setGoalMode(draft.input.goalObjective !== undefined)
  void nextTick(() => conversationPane.value?.loadPromptDraft(draft.input.text, draft.input.attachments ?? []))
}

function removeLocalPrompt(draftId: string): void {
  if (activeSessionId.value.length === 0) return
  runtimeBridge.removeLocalPrompt(activeSessionId.value, draftId)
}

function moveLocalPrompt(draftId: string, direction: -1 | 1): void {
  if (activeSessionId.value.length === 0) return
  runtimeBridge.moveLocalPrompt(activeSessionId.value, draftId, direction)
}

function cancelTask(taskId: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.cancelTask(activeSessionId.value, taskId)
}

function openWorkspaceEntry(entry: WorkspaceFileEntry): void {
  if (entry.kind === 'directory') void runtimeBridge.toggleDirectory(entry.path)
  else openWorkspaceFile(entry.path)
}

function selectExtension(tab: ExtensionTab): void {
  store.setExtension(tab)
  if (tab === 'files') refreshWorkspaceFiles()
}

/* 右栏「项目文件」刷新：会话态走 session 口径，草稿态（新建任务未发首条消息）
   按草稿工作区本地重载。 */
function refreshWorkspaceFiles(): void {
  if (activeSessionId.value.length > 0) {
    void runtimeBridge.refreshWorkspaceContext(activeSessionId.value)
    return
  }
  if (draftActive.value && draftWorkspaceId.value.length > 0) {
    runtimeBridge.openDraftWorkspaceTree(draftWorkspaceId.value)
  }
}

function openWorkspaceFile(reference: string): void {
  const { path } = normalizeWorkspaceFileReference(reference)
  if (path.length === 0) return
  if (workspaceFileDestination(path) === 'browser') {
    if (activeSessionId.value.length === 0) return
    store.setExtension('browser')
    void browserBridge.openHtml(activeSessionId.value, path)
    return
  }
  store.setExtension('files')
  void runtimeBridge.openFile(path)
}

function openLinkInBrowser(url: string): void {
  store.setExtension('browser')
  void browserBridge.navigate(url)
}

function openLinkInSystemBrowser(url: string): void {
  void window.kimiAgent?.openExternalUrl(url)
}

function openWorkspaceFileSystem(reference: string): void {
  const { path } = normalizeWorkspaceFileReference(reference)
  if (path.length > 0) void runtimeBridge.openWorkspaceFileSystem(path)
}

function trashWorkspaceEntry(reference: string): void {
  const { path } = normalizeWorkspaceFileReference(reference)
  if (path.length > 0) void runtimeBridge.trashWorkspaceEntry(path)
}

async function attachFileToSession(entry: WorkspaceFileEntry): Promise<void> {
  if (entry.kind === 'directory') {
    conversationPane.value?.insertFileMention(entry.path)
    return
  }
  const uploaded = await runtimeBridge.attachWorkspaceFile(entry.path)
  if (uploaded !== null) conversationPane.value?.attachFiles([uploaded])
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && (usageOpen.value || contextOpen.value || branchesOpen.value || settingsOpen.value)) {
    event.preventDefault()
    usageOpen.value = false
    contextOpen.value = false
    branchesOpen.value = false
    settingsOpen.value = false
    return
  }
  if (event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'j') {
    if (terminalEnabled.value) {
      event.preventDefault()
      toggleTerminal()
    }
    return
  }
  if (event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    store.setExtension('browser')
    return
  }
  if (event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    store.setExtension('browser')
    void nextTick(() => void pickBrowserElements())
    return
  }
  if (event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'u') {
    event.preventDefault()
    usageOpen.value = !usageOpen.value
  }
}

function onWindowFileDrag(event: DragEvent): void {
  if (event.dataTransfer?.types?.includes('Files') === true) event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  /* 全局兜底：文件拖到输入框以外区域时阻止浏览器默认的打开行为（输入框自身走 ComposerBar 的 drop 上传）。 */
  window.addEventListener('dragover', onWindowFileDrag)
  window.addEventListener('drop', onWindowFileDrag)
  stopPetOpenListener = window.kimiAgent?.onPetOpenSession((intent) => {
    if (
      intent.serverId.length === 0 ||
      runtimeBridge.runtime.value.serverId !== intent.serverId ||
      intent.sessionId.length === 0
    ) return
    pendingPetIntent.value = intent
    store.selectSession(intent.sessionId)
  }) ?? null
  if (showBrowserFixture) {
    void import('./dev/browserFixture').then(({ browserFixtureState, browserFixtureDetails, browserPickElementsResult }) => {
      store.setExtension('browser')
      browserBridge.state.value = browserFixtureState
      browserBridge.networkDetails.value = browserFixtureDetails
      /* 无真实注入通道时（纯前端调试）用 fixture 顶替选择接口：返回一次元素后按取消结束会话，
         避免点选循环空转；同样补上取消接口的 no-op。 */
      const api = window.kimiAgent
      if (api !== undefined && typeof api.pickBrowserElements !== 'function') {
        try {
          let fixtureRounds = 0
          Object.defineProperty(api, 'pickBrowserElements', {
            configurable: true,
            value: async (): Promise<BrowserElementPickResult> => {
              fixtureRounds += 1
              return fixtureRounds === 1
                ? browserPickElementsResult
                : { cancelled: true, elements: [] }
            }
          })
          Object.defineProperty(api, 'cancelBrowserElementPick', {
            configurable: true,
            value: async (): Promise<void> => undefined
          })
        } catch {
          /* contextBridge 暴露的对象可能不可写，忽略即可。 */
        }
      }
    })
  }
  if (showUsageFixture) {
    void import('./dev/usageFixture').then(({ usageFixtureState, sessionUsageFixture }) => {
      usageBridge.state.value = usageFixtureState
      usageSessionFixture.value = sessionUsageFixture
    })
  }
  if (showOperationalFixture) {
    void import('./dev/operationalFixture').then(({
      operationalFixture,
      operationalControlsFixture,
      operationalModelsFixture,
      localPromptQueueFixture
    }) => {
      operationalStateFixture.value = operationalFixture
      runtimeBridge.promptControls.value = operationalControlsFixture
      runtimeBridge.sessionModels.value = operationalModelsFixture
      localPromptQueueFixtureState.value = localPromptQueueFixture
    })
  }
  if (showActivityFixture) {
    const project = projects.value[0]
    if (project !== undefined && !project.sessions.some((session) => session.id === 'fixture-child')) {
      const parentSessionId = project.sessions[0]?.id
      project.sessions.push({
        id: 'fixture-child',
        title: '子任务：验证附件与 Markdown',
        ...(parentSessionId === undefined ? {} : { parentSessionId }),
        relativeTime: 'now',
        tone: 'running'
      })
    }
  }
})

watch(
  () => runtimeBridge.workspaceTree.value,
  (tree) => {
    if (tree !== null) store.hydrateProjects(tree)
  },
  { immediate: true }
)

watch(
  [activeExtension, rightPanelOpen, settingsOpen],
  ([tab, open, settingsVisible]) => {
    void browserBridge.setVisible(open && tab === 'browser' && !settingsVisible)
  },
  { immediate: true }
)

watch(
  activeWorkspaceId,
  (workspaceId) => {
    void browserBridge.setWorkspaceScope(workspaceId.length > 0 ? workspaceId : null)
  },
  { immediate: true }
)

watch(
  () => runtimeBridge.sessionView.value,
  (state) => {
    if (state === null) return
    store.hydrateTranscript(state)
    if (state.phase !== 'ready' || state.sessionId !== activeSessionId.value) return
    void window.kimiAgent?.markPetSessionViewed(state.sessionId)
    const intent = pendingPetIntent.value
    if (intent?.sessionId !== state.sessionId) return
    pendingPetIntent.value = null
    void nextTick(() => conversationPane.value?.focusFromPet(intent.focus))
  }
)

watch(
  [activeSessionId, () => runtimeBridge.runtime.value.status, draftWorkspaceId],
  ([sessionId, runtimeStatus, workspaceId]) => {
    closeAgent()
    branchesOpen.value = false
    if (sessionId.length === 0) {
      runtimeBridge.clearActiveSession()
      /* 草稿态没有真实会话，controls 从 Kimi 设置的新 Session 默认值装载；
         runtime 重启后回到 running 也会走这里补载。 */
      if (draftActive.value && runtimeStatus === 'running') {
        void runtimeBridge.loadDraftControls()
        /* 文件树同样不依赖会话：按草稿工作区本地列举装载。 */
        runtimeBridge.openDraftWorkspaceTree(workspaceId)
      }
      return
    }
    if (runtimeStatus !== 'running') return
    store.markTranscriptLoading(sessionId)
    void runtimeBridge.openSession(sessionId)
  },
  { immediate: true }
)

let stopResize: (() => void) | undefined

function startColumnResize(
  event: PointerEvent,
  startWidth: number,
  direction: 1 | -1,
  update: (width: number) => void
): void {
  event.preventDefault()
  stopResize?.()
  const startX = event.clientX
  const onMove = (moveEvent: PointerEvent): void => {
    update(startWidth + ((moveEvent.clientX - startX) * direction))
  }
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    document.body.classList.remove('is-panel-resizing')
    stopResize = undefined
  }
  document.body.classList.add('is-panel-resizing')
  stopResize = onUp
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function startSidebarResize(event: PointerEvent): void {
  startColumnResize(event, leftPanelWidth.value, 1, (width) => store.setLeftPanelWidth(width))
}

function startRightPanelResize(event: PointerEvent): void {
  startColumnResize(event, rightPanelWidth.value, -1, (width) => store.setRightPanelWidth(width))
}

function resizeSidebarWithKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  store.setLeftPanelWidth(leftPanelWidth.value + (event.key === 'ArrowRight' ? 12 : -12))
}

function resizeRightPanelWithKeyboard(event: KeyboardEvent): void {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  store.setRightPanelWidth(rightPanelWidth.value + (event.key === 'ArrowLeft' ? 12 : -12))
}

onBeforeUnmount(() => {
  stopResize?.()
  document.body.classList.remove('is-panel-resizing')
  stopPetOpenListener?.()
  void browserBridge.setVisible(false)
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('dragover', onWindowFileDrag)
  window.removeEventListener('drop', onWindowFileDrag)
})
</script>

<template>
  <div class="app-shell">
    <TopBar
      :runtime-label="runtimeBridge.label.value"
      :runtime-status="runtimeBridge.runtime.value.status"
      :runtime-pending="runtimeBridge.pending.value"
      :workspace-name="activeWorkspaceName"
      :git-branch="runtimeBridge.gitStatus.value?.branch ?? null"
      :git-available="runtimeBridge.gitStatus.value?.available ?? null"
      :git-branches="runtimeBridge.gitBranches.value"
      :branches-open="branchesOpen"
      :branches-pending="runtimeBridge.gitBranchesPending.value"
      :usage="usageBridge.state.value"
      :session-usage="usageSessionFixture ?? activeSessionUsage"
      :context-open="contextOpen"
      :usage-open="usageOpen"
      :extensions-open="rightPanelOpen"
      :terminal-enabled="terminalEnabled"
      :terminal-open="terminalOpen"
      :session-ready="transcriptPhase === 'ready'"
      :prompt-running="activeSessionView?.mainTurnActive === true"
      :has-turns="visibleTurns.length > 0"
      :conversation-action-pending="runtimeBridge.conversationActionPending.value"
      @toggle-runtime="toggleRuntime"
      @choose-workspace="addWorkspace"
      @toggle-branches="toggleBranches"
      @toggle-context="toggleContext"
      @toggle-usage="toggleUsage"
      @toggle-extensions="toggleExtensions"
      @toggle-terminal="toggleTerminal"
      @refresh-usage="usageBridge.refresh"
      @compact="compactSession"
      @undo="undoSession"
    />

    <main class="workbench" :style="{ '--sidebar-width': `${leftPanelWidth}px` }">
      <div v-show="!settingsOpen" class="workbench-body">
      <ProjectSidebar
        :projects="projects"
        :active-workspace-id="activeWorkspaceId"
        :active-session-id="activeSessionId"
        :lifecycle-pending="runtimeBridge.lifecyclePending.value"
        :lifecycle-error="runtimeBridge.lifecycleError.value"
        :session-page-has-more="runtimeBridge.sessionPageHasMore.value"
        :session-page-pending="runtimeBridge.sessionPagePending.value"
        :session-page-error="runtimeBridge.sessionPageError.value"
        :children-pending-session-id="runtimeBridge.childrenPendingSessionId.value"
        :children-error="runtimeBridge.childrenError.value"
        :archived-notice="sessionArchivedNotice"
        :runtime-version="runtimeVersionBadge"
        @toggle-project="store.toggleProject"
        @select-session="store.selectSession"
        @create-session="startDraftSession"
        @rename-workspace="runtimeBridge.renameWorkspace"
        @delete-workspace="runtimeBridge.deleteWorkspace"
        @rename-session="runtimeBridge.renameSession"
        @archive-session="runtimeBridge.archiveSession"
        @fork-session="forkSession"
        @export-session="runtimeBridge.exportSession"
        @load-more-sessions="runtimeBridge.loadMoreSessions"
        @load-session-children="loadSessionChildren"
        @start-side-chat="startSideChat"
        @open-settings="openSettings"
        @dismiss-archived-notice="store.dismissSessionArchivedNotice"
      />

      <div
        class="column-splitter sidebar-splitter"
        role="separator"
        aria-label="调整项目栏宽度"
        aria-orientation="vertical"
        :aria-valuemin="220"
        :aria-valuemax="420"
        :aria-valuenow="leftPanelWidth"
        tabindex="0"
        @keydown="resizeSidebarWithKeyboard"
        @pointerdown="startSidebarResize"
      />

      <ConversationPane
        ref="conversationPane"
        :turns="visibleTurns"
        :phase="transcriptPhase"
        :error="transcriptError"
        :steered-prompt-ids="runtimeBridge.steeredPromptIds"
        :composer-enabled="composerEnabled"
        :draft-active="draftActive"
        :draft-workspace-id="draftWorkspaceId"
        :projects="projects"
        :prompt-pending="runtimeBridge.promptPending.value"
        :prompt-error="runtimeBridge.promptError.value"
        :prompt-running="activeSessionView?.mainTurnActive === true"
        :session-id="activeSessionId"
        :terminal-enabled="terminalEnabled"
        :terminal-open="terminalOpen"
        :pending-approvals="visibleApprovals"
        :pending-questions="visibleQuestions"
        :interaction-pending-key="runtimeBridge.interactionPendingKey.value"
        :interaction-error="runtimeBridge.interactionError.value"
        :agents="activeSessionView?.agents ?? []"
        :todos="activeSessionView?.todos ?? []"
        :tasks="visibleOperational?.tasks ?? []"
        :tasks-pending="runtimeBridge.sessionOperationalPending.value"
        :tasks-error="runtimeBridge.sessionOperationalError.value"
        :skills="runtimeBridge.sessionSkills.value"
        :skills-pending="runtimeBridge.sessionSkillsPending.value"
        :skills-error="runtimeBridge.sessionSkillsError.value"
        :skill-activation-pending="runtimeBridge.skillActivationPending.value"
        :skill-activation-error="runtimeBridge.skillActivationError.value"
        :models="runtimeBridge.sessionModels.value"
        :prompt-controls="runtimeBridge.promptControls.value"
        :controls-pending="runtimeBridge.sessionControlsPending.value"
        :controls-error="runtimeBridge.sessionControlsError.value"
        :goal="visibleOperational?.goal ?? null"
        :prompt-queue="visibleOperational?.prompts ?? null"
        :operational-action-pending="runtimeBridge.operationalActionPending.value"
        :operational-error="runtimeBridge.sessionOperationalError.value"
        :goal-mode="runtimeBridge.goalMode.value"
        :local-prompt-queue="visibleLocalPromptQueue"
        :warnings="visibleWarnings"
        :warnings-error="runtimeBridge.sessionWarningsError.value"
        :markers="activeSessionView?.markers ?? []"
        :conversation-action-pending="runtimeBridge.conversationActionPending.value"
        :conversation-action-error="runtimeBridge.conversationActionError.value"
        :recallable-turn-id="recallablePromptTurnId"
        :side-chat="visibleSideChat"
        :side-chat-pending="runtimeBridge.sideChatPending.value"
        :side-chat-error="runtimeBridge.sideChatError.value"
        :agent-detail="visibleAgentDetail"
        :agent-transcript="visibleAgentTranscript"
        :agent-transcript-pending="runtimeBridge.agentTranscriptPending.value"
        :agent-transcript-error="runtimeBridge.agentTranscriptError.value"
        :last-turn-reason="store.lastTurnReason"
        :last-turn-error="store.lastTurnError"
        :retry="store.retry"
        :mention-search="searchMentionFiles"
        @submit="submitPrompt"
        @abort="runtimeBridge.abortActivePrompt"
        @select-draft-workspace="store.setDraftWorkspace"
        @open-draft-workspace-folder="openDraftWorkspaceFolder"
        @respond-approval="respondApproval"
        @respond-question="respondQuestion"
        @dismiss-question="dismissQuestion"
        @open-file="openWorkspaceFile"
        @open-link="openLinkInBrowser"
        @open-link-external="openLinkInSystemBrowser"
        @open-system="openWorkspaceFileSystem"
        @trash-entry="trashWorkspaceEntry"
        @close-terminal="store.toggleTerminal(false)"
        @update-prompt-controls="runtimeBridge.setPromptControls"
        @control-goal="controlGoal"
        @steer-prompt="steerPrompt"
        @abort-prompt="abortPrompt"
        @update-goal-mode="runtimeBridge.setGoalMode"
        @edit-local-prompt="editLocalPrompt"
        @remove-local-prompt="removeLocalPrompt"
        @move-local-prompt="moveLocalPrompt"
        @send-side-chat="sendSideChat"
        @close-side-chat="closeSideChat"
        @open-agent="openAgent"
        @close-agent="closeAgent"
        @cancel-agent-task="cancelTask"
        @open-plan="openPlanReview"
        @undo="undoSession"
        @retry-failed-turn="resumeFailedTurn"
      />

      <template v-if="rightPanelOpen">
        <div
          class="column-splitter panel-splitter"
          role="separator"
          aria-label="调整扩展栏宽度"
          aria-orientation="vertical"
          :aria-valuemin="320"
          :aria-valuemax="1040"
          :aria-valuenow="rightPanelWidth"
          tabindex="0"
          @keydown="resizeRightPanelWithKeyboard"
          @pointerdown="startRightPanelResize"
        />
        <ExtensionsPanel
          :width="rightPanelWidth"
          :active-tab="activeExtension"
          :workspace-name="activeWorkspaceName"
          :platform="runtimeBridge.platform.value"
          :file-tree="runtimeBridge.fileTree"
          :file-tree-reveal="runtimeBridge.fileTreeReveal.value"
          :file-preview="runtimeBridge.filePreview.value"
          :file-action-pending="runtimeBridge.fileActionPending.value"
          :file-action-error="runtimeBridge.fileActionError.value"
          :file-action-notice="runtimeBridge.fileActionNotice.value"
          :file-search="runtimeBridge.fileSearch.value"
          :file-search-pending="runtimeBridge.fileSearchPending.value"
          :file-search-error="runtimeBridge.fileSearchError.value"
          :file-grep="runtimeBridge.fileGrep.value"
          :file-grep-pending="runtimeBridge.fileGrepPending.value"
          :file-grep-error="runtimeBridge.fileGrepError.value"
          :browser-state="browserBridge.state.value"
          :browser-pending="browserBridge.pending.value"
          :browser-error="browserBridge.error.value"
          :browser-element-picking="browserBridge.elementPicking.value"
          @select-tab="selectExtension"
          @open-entry="openWorkspaceEntry"
          @open-file="openWorkspaceFile"
          @open-directory="runtimeBridge.revealDirectory"
          @open-system="openWorkspaceFileSystem"
          @trash-entry="trashWorkspaceEntry"
          @attach-to-session="attachFileToSession"
          @search-files="runtimeBridge.searchFiles"
          @grep-files="runtimeBridge.grepFiles"
          @refresh="refreshWorkspaceFiles"
          @browser-bounds="browserBridge.setBounds"
          @browser-viewport="browserBridge.setViewport"
          @browser-pick-elements="pickBrowserElements"
          @browser-stop-picking="stopBrowserElementPick"
          @browser-reload="browserBridge.reload"
          @browser-open-external="browserBridge.openExternal"
        />
      </template>
      </div>
      <SettingsPanel
        v-if="settingsOpen"
        :open="settingsOpen"
        :runtime-running="runtimeBridge.runtime.value.status === 'running'"
        :active-session-id="activeSessionId"
        :active-workspace-id="activeWorkspaceId"
        :usage="usageBridge.state.value"
        :config-revision="runtimeBridge.globalConfigRevision.value"
        @close="settingsOpen = false"
        @session-restored="selectRestoredSession"
      />
    </main>
    <FilePreviewDialog
      :preview="runtimeBridge.filePreview.value"
      :pending="runtimeBridge.filePreviewPending.value"
      :error="runtimeBridge.filePreviewError.value"
      :action-pending="runtimeBridge.fileActionPending.value"
      :action-error="runtimeBridge.fileActionError.value"
      :action-notice="runtimeBridge.fileActionNotice.value"
      @close="runtimeBridge.closeFilePreview"
      @download="runtimeBridge.downloadWorkspaceFile"
      @open-external="openWorkspaceFileSystem"
      @reveal="runtimeBridge.revealWorkspaceFile"
    />
    <RuntimeConnectDialog
      :open="runtimeBridge.runtime.value.status === 'error'"
      :pending="runtimeBridge.pending.value"
      :error="runtimeBridge.runtime.value.status === 'error' ? runtimeBridge.runtime.value.error : null"
      :missing="runtimeBridge.discovery.value?.system.executable === null"
      @retry="runtimeBridge.toggle"
    />
    <PlanViewerPanel
      v-if="store.planReview"
      :plan="store.planReview"
      @close="store.closePlanReview"
      @send-feedback="sendPlanFeedback"
    />
  </div>
</template>
