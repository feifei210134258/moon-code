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
import { useRuntimeBridge } from './composables/useRuntimeBridge'
import { useBrowserBridge } from './composables/useBrowserBridge'
import { useUsageBridge } from './composables/useUsageBridge'
import { activityFixtureTurns, approvalFixture, questionFixture, sessionWarningFixture } from './dev/interactionFixtures'
import { useWorkbenchStore } from './stores/workbench'
import { normalizeWorkspaceFileReference, workspaceFileDestination } from './utils/fileRouting'
import { setRendererLocale } from './i18n/rendererLocale'
import type {
  BrowserAnnotationSubmitInput,
  KimiAgentTranscript,
  KimiSessionOperationalState,
  KimiPromptControls,
  KimiSideChatView,
  KimiUploadedFile,
  PetOpenSessionIntent,
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
  activeExtension,
  rightPanelOpen,
  leftPanelWidth,
  rightPanelWidth,
  terminalOpen,
  turns,
  transcriptPhase,
  transcriptError
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
  activeSessionId.value.length > 0 &&
  transcriptPhase.value === 'ready'
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
  swarmIndex: 0, runInBackground: false, createdAt: '2026-07-24T07:30:00.000Z',
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
  deliveryMode: 'queue' | 'steer'
): Promise<void> {
  const sessionId = activeSessionId.value
  if (sessionId.length === 0) return
  const accepted = await runtimeBridge.submitPrompt(sessionId, {
    text,
    ...(attachments.length === 0 ? {} : { attachments }),
    controls,
    ...(goalMode ? { goalObjective: text.trim() } : {}),
    deliveryMode
  })
  if (accepted) store.markConversationActivity(sessionId)
}

function submitBrowserAnnotation(input: BrowserAnnotationSubmitInput): void {
  const controls = runtimeBridge.promptControls.value
  if (activeSessionId.value.length === 0 || controls === null) return
  void browserBridge.submitAnnotation(activeSessionId.value, input, controls)
}

function openSettings(): void {
  usageOpen.value = false
  contextOpen.value = false
  settingsOpen.value = true
}

function toggleContext(): void {
  contextOpen.value = !contextOpen.value
  usageOpen.value = false
}

function toggleUsage(): void {
  usageOpen.value = !usageOpen.value
  contextOpen.value = false
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

async function addWorkspace(): Promise<void> {
  const workspaceId = await runtimeBridge.addWorkspace()
  if (workspaceId !== null) store.selectWorkspace(workspaceId)
}

async function createSession(workspaceId: string): Promise<void> {
  const result = await runtimeBridge.createSession(workspaceId)
  if (result !== null) store.selectSession(result.sessionId)
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

function activateSkill(skillName: string, args?: string): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.activateSkill(activeSessionId.value, skillName, args)
}

function respondApproval(
  approvalId: string,
  response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session' }
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
  if (entry.kind === 'directory') void runtimeBridge.loadDirectory(entry.path)
  else openWorkspaceFile(entry.path)
}

function selectExtension(tab: ExtensionTab): void {
  store.setExtension(tab)
  if (tab === 'files' && activeSessionId.value.length > 0) {
    void runtimeBridge.refreshWorkspaceContext(activeSessionId.value)
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

function openWorkspaceFileSystem(reference: string): void {
  const { path } = normalizeWorkspaceFileReference(reference)
  if (path.length > 0) void runtimeBridge.openWorkspaceFileSystem(path)
}

function trashWorkspaceEntry(reference: string): void {
  const { path } = normalizeWorkspaceFileReference(reference)
  if (path.length > 0) void runtimeBridge.trashWorkspaceEntry(path)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && (usageOpen.value || contextOpen.value || settingsOpen.value)) {
    event.preventDefault()
    usageOpen.value = false
    contextOpen.value = false
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
    void nextTick(() => browserBridge.pickAnnotation('element'))
    return
  }
  if (event.metaKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'u') {
    event.preventDefault()
    usageOpen.value = !usageOpen.value
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
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
    void import('./dev/browserFixture').then(({ browserFixtureState, browserFixtureDetails }) => {
      store.setExtension('browser')
      browserBridge.state.value = browserFixtureState
      browserBridge.networkDetails.value = browserFixtureDetails
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
  [activeSessionId, () => runtimeBridge.runtime.value.status],
  ([sessionId, runtimeStatus]) => {
    closeAgent()
    if (sessionId.length === 0) {
      runtimeBridge.clearActiveSession()
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
      :usage="usageBridge.state.value"
      :session-usage="usageSessionFixture ?? activeSessionUsage"
      :context-open="contextOpen"
      :usage-open="usageOpen"
      :extensions-open="rightPanelOpen"
      :session-ready="transcriptPhase === 'ready'"
      :prompt-running="activeSessionView?.mainTurnActive === true"
      :has-turns="visibleTurns.length > 0"
      :conversation-action-pending="runtimeBridge.conversationActionPending.value"
      @toggle-runtime="toggleRuntime"
      @choose-workspace="addWorkspace"
      @toggle-context="toggleContext"
      @toggle-usage="toggleUsage"
      @toggle-extensions="toggleExtensions"
      @refresh-usage="usageBridge.refresh"
      @compact="compactSession"
      @undo="undoSession"
    />

    <main class="workbench" :style="{ '--sidebar-width': `${leftPanelWidth}px` }">
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
        @toggle-project="store.toggleProject"
        @select-session="store.selectSession"
        @create-session="createSession"
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
        :composer-enabled="composerEnabled"
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
        :mention-search="searchMentionFiles"
        @submit="submitPrompt"
        @abort="runtimeBridge.abortActivePrompt"
        @respond-approval="respondApproval"
        @respond-question="respondQuestion"
        @dismiss-question="dismissQuestion"
        @open-file="openWorkspaceFile"
        @open-system="openWorkspaceFileSystem"
        @trash-entry="trashWorkspaceEntry"
        @close-terminal="store.toggleTerminal(false)"
        @toggle-terminal="toggleTerminal"
        @activate-skill="activateSkill"
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
        @undo="undoSession"
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
          :file-list="runtimeBridge.fileList.value"
          :file-list-pending="runtimeBridge.fileListPending.value"
          :file-list-error="runtimeBridge.fileListError.value"
          :file-preview="runtimeBridge.filePreview.value"
          :file-action-pending="runtimeBridge.fileActionPending.value"
          :file-action-error="runtimeBridge.fileActionError.value"
          :file-action-notice="runtimeBridge.fileActionNotice.value"
          :git-status="runtimeBridge.gitStatus.value"
          :git-status-pending="runtimeBridge.gitStatusPending.value"
          :git-status-error="runtimeBridge.gitStatusError.value"
          :file-search="runtimeBridge.fileSearch.value"
          :file-search-pending="runtimeBridge.fileSearchPending.value"
          :file-search-error="runtimeBridge.fileSearchError.value"
          :file-grep="runtimeBridge.fileGrep.value"
          :file-grep-pending="runtimeBridge.fileGrepPending.value"
          :file-grep-error="runtimeBridge.fileGrepError.value"
          :browser-state="browserBridge.state.value"
          :browser-pending="browserBridge.pending.value"
          :browser-error="browserBridge.error.value"
          :browser-capture="browserBridge.capture.value"
          :browser-annotation-backdrop="browserBridge.annotationBackdrop.value"
          :browser-annotation-drafts="browserBridge.annotationDrafts.value"
          :browser-annotation-picking="browserBridge.annotationPicking.value"
          :browser-annotation-submitting="browserBridge.annotationSubmitting.value"
          :browser-annotation-error="browserBridge.annotationError.value"
          :todos="activeSessionView?.todos ?? []"
          :tasks="visibleOperational?.tasks ?? []"
          :tasks-pending="runtimeBridge.sessionOperationalPending.value"
          :tasks-error="runtimeBridge.sessionOperationalError.value"
          :operational-action-pending="runtimeBridge.operationalActionPending.value"
          @select-tab="selectExtension"
          @open-entry="openWorkspaceEntry"
          @open-file="openWorkspaceFile"
          @open-directory="runtimeBridge.loadDirectory"
          @open-system="openWorkspaceFileSystem"
          @trash-entry="trashWorkspaceEntry"
          @search-files="runtimeBridge.searchFiles"
          @grep-files="runtimeBridge.grepFiles"
          @refresh="runtimeBridge.refreshWorkspaceContext(activeSessionId)"
          @browser-bounds="browserBridge.setBounds"
          @browser-viewport="browserBridge.setViewport"
          @browser-capture-page="browserBridge.capturePage"
          @browser-pick-annotation="browserBridge.pickAnnotation"
          @browser-delete-annotation="browserBridge.deleteAnnotation"
          @browser-submit-annotation="submitBrowserAnnotation"
          @browser-overlay="browserBridge.setOverlay"
          @cancel-task="cancelTask"
        />
      </template>
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
    <SettingsPanel
      :open="settingsOpen"
      :runtime-running="runtimeBridge.runtime.value.status === 'running'"
      :active-session-id="activeSessionId"
      :active-workspace-id="activeWorkspaceId"
      :usage="usageBridge.state.value"
      :config-revision="runtimeBridge.globalConfigRevision.value"
      @close="settingsOpen = false"
      @session-restored="selectRestoredSession"
    />
    <RuntimeConnectDialog
      :open="runtimeBridge.runtime.value.status === 'error'"
      :pending="runtimeBridge.pending.value"
      :error="runtimeBridge.runtime.value.status === 'error' ? runtimeBridge.runtime.value.error : null"
      :missing="runtimeBridge.discovery.value?.system.executable === null"
      @retry="runtimeBridge.toggle"
    />
  </div>
</template>
