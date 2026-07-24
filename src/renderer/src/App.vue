<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TopBar from './components/TopBar.vue'
import ProjectSidebar from './components/ProjectSidebar.vue'
import ConversationPane from './components/ConversationPane.vue'
import ExtensionsPanel from './components/ExtensionsPanel.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import { useRuntimeBridge } from './composables/useRuntimeBridge'
import { useBrowserBridge } from './composables/useBrowserBridge'
import { useUsageBridge } from './composables/useUsageBridge'
import { activityFixtureTurns, approvalFixture, questionFixture, sessionWarningFixture } from './dev/interactionFixtures'
import { useWorkbenchStore } from './stores/workbench'
import { workspaceFileDestination } from './utils/fileRouting'
import type {
  BrowserAnnotationSubmitInput,
  KimiSessionOperationalState,
  KimiPromptControls,
  KimiUploadedFile,
  PetOpenSessionIntent,
  QuestionAnswerInput,
  SessionUsageSummary,
  WorkspaceFileEntry
} from '@shared/contracts'
import type { LocalPromptDraft } from './utils/localPromptQueue'

const store = useWorkbenchStore()
const showSettingsFixture = import.meta.env.DEV && new URLSearchParams(window.location.search).has('settings-fixture')
const {
  projects,
  activeWorkspaceId,
  activeSessionId,
  activeExtension,
  rightPanelOpen,
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
const usageOpen = ref(showUsageFixture)
const usageSessionFixture = ref<SessionUsageSummary | null>(null)
const operationalStateFixture = ref<KimiSessionOperationalState | null>(null)
const localPromptQueueFixtureState = ref<LocalPromptDraft[] | null>(null)
const conversationPane = ref<InstanceType<typeof ConversationPane> | null>(null)
const pendingPetIntent = ref<PetOpenSessionIntent | null>(null)
let stopPetOpenListener: (() => void) | null = null
const activeSessionView = computed(() => (
  runtimeBridge.sessionView.value?.sessionId === activeSessionId.value
    ? runtimeBridge.sessionView.value
    : null
))
const visibleApprovals = computed(() => activeSessionView.value?.pendingApprovals ?? (
  showInteractionFixture ? [approvalFixture] : []
))
const visibleQuestions = computed(() => activeSessionView.value?.pendingQuestions ?? (
  showInteractionFixture ? [questionFixture] : []
))
const visibleTurns = computed(() => showActivityFixture ? activityFixtureTurns : turns.value)
const visibleWarnings = computed(() => showActivityFixture ? sessionWarningFixture : runtimeBridge.sessionWarnings.value)
const composerEnabled = computed(() => showOperationalFixture || (
  runtimeBridge.runtime.value.status === 'running' &&
  activeSessionId.value.length > 0 &&
  transcriptPhase.value === 'ready' &&
  !runtimeBridge.promptPending.value
))
const activeWorkspaceName = computed(() => projects.value.find((project) =>
  project.id === activeWorkspaceId.value
)?.name ?? '项目文件')
const visibleOperational = computed(() => operationalStateFixture.value ?? runtimeBridge.sessionOperational.value)
const visibleLocalPromptQueue = computed(() => localPromptQueueFixtureState.value ?? runtimeBridge.localPromptQueue.value)

function submitPrompt(text: string, attachments: KimiUploadedFile[], controls: KimiPromptControls, goalMode: boolean): void {
  if (activeSessionId.value.length === 0) return
  void runtimeBridge.submitPrompt(activeSessionId.value, {
    text,
    ...(attachments.length === 0 ? {} : { attachments }),
    controls,
    ...(goalMode ? { goalObjective: text.trim() } : {})
  })
}

function submitBrowserAnnotation(input: BrowserAnnotationSubmitInput): void {
  const controls = runtimeBridge.promptControls.value
  if (activeSessionId.value.length === 0 || controls === null) return
  void browserBridge.submitAnnotation(activeSessionId.value, input, controls)
}

function openSettings(): void {
  usageOpen.value = false
  settingsOpen.value = true
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

function openWorkspaceFile(path: string): void {
  if (workspaceFileDestination(path) === 'browser') {
    if (activeSessionId.value.length === 0) return
    store.setExtension('browser')
    void browserBridge.openHtml(activeSessionId.value, path)
    return
  }
  store.setExtension('files')
  void runtimeBridge.openFile(path)
}

function selectChangedFile(path: string): void {
  store.setExtension('changes')
  void runtimeBridge.loadFileDiff(path)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && usageOpen.value) {
    event.preventDefault()
    usageOpen.value = false
    return
  }
  if (event.metaKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'j') {
    event.preventDefault()
    store.toggleTerminal()
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

function startResize(event: PointerEvent): void {
  const startX = event.clientX
  const startWidth = rightPanelWidth.value
  const onMove = (moveEvent: PointerEvent): void => {
    store.setRightPanelWidth(startWidth + startX - moveEvent.clientX)
  }
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    stopResize = undefined
  }
  stopResize = onUp
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

onBeforeUnmount(() => {
  stopResize?.()
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
      :session-usage="usageSessionFixture ?? activeSessionView?.usage ?? null"
      :usage-open="usageOpen"
      @toggle-runtime="runtimeBridge.toggle"
      @open-settings="openSettings"
      @toggle-usage="usageOpen = !usageOpen"
      @refresh-usage="usageBridge.refresh"
    />

    <main class="workbench">
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
        @add-workspace="addWorkspace"
        @rename-workspace="runtimeBridge.renameWorkspace"
        @delete-workspace="runtimeBridge.deleteWorkspace"
        @rename-session="runtimeBridge.renameSession"
        @archive-session="runtimeBridge.archiveSession"
        @fork-session="forkSession"
        @export-session="runtimeBridge.exportSession"
        @load-more-sessions="runtimeBridge.loadMoreSessions"
        @load-session-children="loadSessionChildren"
        @open-settings="openSettings"
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
        :terminal-enabled="activeSessionView !== null && transcriptPhase === 'ready'"
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
        @submit="submitPrompt"
        @abort="runtimeBridge.abortActivePrompt"
        @respond-approval="respondApproval"
        @respond-question="respondQuestion"
        @dismiss-question="dismissQuestion"
        @open-file="openWorkspaceFile"
        @close-terminal="store.toggleTerminal(false)"
        @toggle-terminal="store.toggleTerminal()"
        @activate-skill="activateSkill"
        @update-prompt-controls="runtimeBridge.setPromptControls"
        @control-goal="controlGoal"
        @steer-prompt="steerPrompt"
        @abort-prompt="abortPrompt"
        @update-goal-mode="runtimeBridge.setGoalMode"
        @edit-local-prompt="editLocalPrompt"
        @remove-local-prompt="removeLocalPrompt"
        @move-local-prompt="moveLocalPrompt"
        @compact="compactSession"
        @undo="undoSession"
      />

      <template v-if="rightPanelOpen">
        <div
          class="panel-splitter"
          role="separator"
          aria-label="调整扩展栏宽度"
          aria-orientation="vertical"
          @pointerdown="startResize"
        />
        <ExtensionsPanel
          :width="rightPanelWidth"
          :active-tab="activeExtension"
          :workspace-name="activeWorkspaceName"
          :file-list="runtimeBridge.fileList.value"
          :file-list-pending="runtimeBridge.fileListPending.value"
          :file-list-error="runtimeBridge.fileListError.value"
          :file-preview="runtimeBridge.filePreview.value"
          :file-preview-pending="runtimeBridge.filePreviewPending.value"
          :file-preview-error="runtimeBridge.filePreviewError.value"
          :git-status="runtimeBridge.gitStatus.value"
          :git-status-pending="runtimeBridge.gitStatusPending.value"
          :git-status-error="runtimeBridge.gitStatusError.value"
          :file-diff="runtimeBridge.fileDiff.value"
          :file-diff-pending="runtimeBridge.fileDiffPending.value"
          :file-diff-error="runtimeBridge.fileDiffError.value"
          :file-search="runtimeBridge.fileSearch.value"
          :file-search-pending="runtimeBridge.fileSearchPending.value"
          :file-search-error="runtimeBridge.fileSearchError.value"
          :file-grep="runtimeBridge.fileGrep.value"
          :file-grep-pending="runtimeBridge.fileGrepPending.value"
          :file-grep-error="runtimeBridge.fileGrepError.value"
          :file-action-pending="runtimeBridge.fileActionPending.value"
          :file-action-error="runtimeBridge.fileActionError.value"
          :file-action-notice="runtimeBridge.fileActionNotice.value"
          :browser-state="browserBridge.state.value"
          :browser-pending="browserBridge.pending.value"
          :browser-error="browserBridge.error.value"
          :browser-network-details="browserBridge.networkDetails.value"
          :browser-network-details-pending="browserBridge.networkDetailsPending.value"
          :browser-capture="browserBridge.capture.value"
          :browser-local-servers="browserBridge.localServers.value"
          :browser-local-servers-pending="browserBridge.localServersPending.value"
          :browser-annotation-drafts="browserBridge.annotationDrafts.value"
          :browser-annotation-picking="browserBridge.annotationPicking.value"
          :browser-annotation-submitting="browserBridge.annotationSubmitting.value"
          :browser-annotation-error="browserBridge.annotationError.value"
          :todos="activeSessionView?.todos ?? []"
          :tasks="visibleOperational?.tasks ?? []"
          :tasks-pending="runtimeBridge.sessionOperationalPending.value"
          :tasks-error="runtimeBridge.sessionOperationalError.value"
          :operational-action-pending="runtimeBridge.operationalActionPending.value"
          @select-tab="store.setExtension"
          @open-entry="openWorkspaceEntry"
          @open-file="openWorkspaceFile"
          @open-directory="runtimeBridge.loadDirectory"
          @search-files="runtimeBridge.searchFiles"
          @grep-files="runtimeBridge.grepFiles"
          @download-file="runtimeBridge.downloadWorkspaceFile"
          @open-external-file="runtimeBridge.openWorkspaceFile"
          @open-file-in="runtimeBridge.openWorkspaceFileIn"
          @reveal-file="runtimeBridge.revealWorkspaceFile"
          @select-diff="selectChangedFile"
          @refresh="runtimeBridge.refreshWorkspaceContext(activeSessionId)"
          @browser-bounds="browserBridge.setBounds"
          @browser-navigate="browserBridge.navigate"
          @browser-back="browserBridge.back"
          @browser-forward="browserBridge.forward"
          @browser-reload="browserBridge.reload"
          @browser-stop="browserBridge.stop"
          @browser-viewport="browserBridge.setViewport"
          @browser-clear-console="browserBridge.clearConsole"
          @browser-clear-network="browserBridge.clearNetwork"
          @browser-network-details="browserBridge.loadNetworkDetails"
          @browser-capture-page="browserBridge.capturePage"
          @browser-pick-annotation="browserBridge.pickAnnotation"
          @browser-delete-annotation="browserBridge.deleteAnnotation"
          @browser-submit-annotation="submitBrowserAnnotation"
          @browser-open-external="browserBridge.openExternal"
          @cancel-task="cancelTask"
          @collapse="store.rightPanelOpen = false"
        />
      </template>
      <button
        v-else
        class="panel-restore control-button"
        type="button"
        aria-label="展开扩展栏"
        @click="store.rightPanelOpen = true"
      >
        扩展
      </button>
    </main>
    <SettingsPanel
      :open="settingsOpen"
      :runtime-running="runtimeBridge.runtime.value.status === 'running'"
      :active-session-id="activeSessionId"
      :active-workspace-id="activeWorkspaceId"
      :usage="usageBridge.state.value"
      @close="settingsOpen = false"
      @session-restored="selectRestoredSession"
    />
  </div>
</template>
