import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  appendLocalPromptDraft,
  moveLocalPromptDraft,
  prependLocalPromptDraft,
  removeLocalPromptDraft,
  type LocalPromptDraft
} from '../utils/localPromptQueue'
import {
  ipcErrorMessage,
  toCloneableApprovalResponse,
  toCloneablePromptInput,
  toCloneableQuestionAnswers,
  toCloneableSideChatPromptInput
} from '../utils/ipcPayloads'
import type {
  KimiModelCatalogItem,
  KimiAgentTranscript,
  KimiPromptControls,
  KimiPromptInput,
  KimiSideChatPromptInput,
  KimiSessionRuntimeStatus,
  KimiSessionOperationalState,
  KimiSessionWarning,
  KimiUndoDraft,
  QuestionAnswerInput,
  KimiSkill,
  RuntimeDiscovery,
  RuntimePublicState,
  SessionCreateResult,
  SessionExportResult,
  SessionNavigationItem,
  SessionViewState,
  WorkspaceFileDiff,
  WorkspaceFileList,
  WorkspaceFilePreview,
  WorkspaceFileSearchItem,
  WorkspaceFileSearchResult,
  WorkspaceGrepResult,
  WorkspaceGitStatus,
  WorkspaceGitBranches,
  WorkspaceOpenApp,
  WorkspaceNavigationItem
} from '@shared/contracts'

const stoppedState: RuntimePublicState = {
  status: 'stopped',
  mode: null,
  version: null,
  serverId: null,
  origin: null,
  error: null
}

const LAST_THINKING_EFFORT_KEY = 'moon-code:last-thinking-effort:v1'

export function useRuntimeBridge() {
  const runtime = ref<RuntimePublicState>({ ...stoppedState })
  const discovery = ref<RuntimeDiscovery | null>(null)
  const pending = ref(false)
  const workspaceTree = ref<WorkspaceNavigationItem[] | null>(null)
  const workspaceError = ref<string | null>(null)
  const sessionPagePending = ref(false)
  const sessionPageError = ref<string | null>(null)
  const sessionPageHasMore = ref(false)
  const sessionPageBeforeId = ref<string | null>(null)
  const lifecyclePending = ref<string | null>(null)
  const lifecycleError = ref<string | null>(null)
  const sessionView = ref<SessionViewState | null>(null)
  const sessionError = ref<string | null>(null)
  const promptPending = ref(false)
  const promptError = ref<string | null>(null)
  const conversationActionPending = ref<'compact' | 'undo' | null>(null)
  const conversationActionError = ref<string | null>(null)
  const sideChatPending = ref(false)
  const sideChatError = ref<string | null>(null)
  const agentTranscript = ref<KimiAgentTranscript | null>(null)
  const agentTranscriptPending = ref(false)
  const agentTranscriptError = ref<string | null>(null)
  const localPromptDraftsBySession = ref<Record<string, LocalPromptDraft[]>>({})
  const activeQueueSessionId = ref<string | null>(null)
  const sessionRuntimeStatus = ref<KimiSessionRuntimeStatus | null>(null)
  const sessionModels = ref<KimiModelCatalogItem[]>([])
  const promptControls = ref<KimiPromptControls | null>(null)
  const sessionControlsPending = ref(false)
  const sessionControlsError = ref<string | null>(null)
  const goalMode = ref(false)
  const sessionOperational = ref<KimiSessionOperationalState | null>(null)
  const sessionOperationalPending = ref(false)
  const sessionOperationalError = ref<string | null>(null)
  const sessionWarnings = ref<KimiSessionWarning[]>([])
  const sessionWarningsError = ref<string | null>(null)
  const childrenPendingSessionId = ref<string | null>(null)
  const childrenError = ref<string | null>(null)
  const operationalActionPending = ref<string | null>(null)
  const interactionPendingKey = ref<string | null>(null)
  const interactionError = ref<string | null>(null)
  const sessionSkills = ref<KimiSkill[]>([])
  const sessionSkillsPending = ref(false)
  const sessionSkillsError = ref<string | null>(null)
  const skillActivationPending = ref(false)
  const skillActivationError = ref<string | null>(null)
  const fileList = ref<WorkspaceFileList | null>(null)
  const fileListPending = ref(false)
  const fileListError = ref<string | null>(null)
  const filePreview = ref<WorkspaceFilePreview | null>(null)
  const filePreviewPending = ref(false)
  const filePreviewError = ref<string | null>(null)
  const gitStatus = ref<WorkspaceGitStatus | null>(null)
  const gitStatusPending = ref(false)
  const gitStatusError = ref<string | null>(null)
  const gitBranches = ref<WorkspaceGitBranches | null>(null)
  const gitBranchesPending = ref(false)
  const fileDiff = ref<WorkspaceFileDiff | null>(null)
  const fileDiffPending = ref(false)
  const fileDiffError = ref<string | null>(null)
  const fileSearch = ref<WorkspaceFileSearchResult | null>(null)
  const fileSearchPending = ref(false)
  const fileSearchError = ref<string | null>(null)
  const fileGrep = ref<WorkspaceGrepResult | null>(null)
  const fileGrepPending = ref(false)
  const fileGrepError = ref<string | null>(null)
  const fileActionPending = ref<string | null>(null)
  const fileActionError = ref<string | null>(null)
  const fileActionNotice = ref<string | null>(null)
  const globalConfigRevision = ref(0)
  let unsubscribeRuntime: (() => void) | undefined
  let unsubscribeGlobal: (() => void) | undefined
  let unsubscribeSession: (() => void) | undefined
  let interactionGeneration = 0
  let sessionOpenGeneration = 0
  let workspaceTreeGeneration = 0
  let loadedSessionPageCount = 0
  let workspaceGeneration = 0
  let directoryGeneration = 0
  let branchesGeneration = 0
  let previewGeneration = 0
  let diffGeneration = 0
  let fileSearchGeneration = 0
  let fileGrepGeneration = 0
  let fileActionGeneration = 0
  let skillsGeneration = 0
  let controlsGeneration = 0
  let runtimeStatusGeneration = 0
  let operationalGeneration = 0
  let warningsGeneration = 0
  let agentTranscriptGeneration = 0
  let operationalTimer: number | undefined
  let workspaceRefreshTimer: number | undefined
  let requestedSessionId: string | null = null
  let lastThinkingEffort = loadLastThinkingEffort()
  const awaitingPromptCycleAt = new Map<string, number>()
  const localPromptQueue = computed(() => {
    const sessionId = activeQueueSessionId.value
    return sessionId === null ? [] : localPromptDraftsBySession.value[sessionId] ?? []
  })

  const label = computed(() => {
    if (runtime.value.status === 'running') return `Kimi ${runtime.value.version ?? ''}`.trim()
    if (runtime.value.status === 'starting') return 'Kimi 启动中'
    if (runtime.value.status === 'error') return 'Kimi 连接异常'
    return 'Kimi 未连接'
  })

  const load = async (): Promise<void> => {
    if (window.kimiAgent === undefined) return
    const bootstrap = await window.kimiAgent.getBootstrapState()
    runtime.value = bootstrap.runtime
    discovery.value = bootstrap.discovery
    unsubscribeRuntime = window.kimiAgent.onRuntimeStateChanged((state) => {
      runtime.value = state
      if (state.status === 'running') void refreshWorkspaceTree()
      else {
        sessionView.value = null
        requestedSessionId = null
        activeQueueSessionId.value = null
        localPromptDraftsBySession.value = {}
        awaitingPromptCycleAt.clear()
        sessionOpenGeneration += 1
        interactionGeneration += 1
        interactionPendingKey.value = null
        interactionError.value = null
        resetSessionSkills()
        resetSessionControls()
        resetSessionOperational()
        warningsGeneration += 1
        sessionWarnings.value = []
        sessionWarningsError.value = null
        resetWorkspaceContext()
      }
    })
    unsubscribeSession = window.kimiAgent.onSessionStateChanged((state) => {
      if (requestedSessionId !== null && state.sessionId !== requestedSessionId) return
      const previous = sessionView.value
      sessionView.value = state
      sessionError.value = state.error
      if (
        previous?.sessionId === state.sessionId &&
        previous.mainTurnActive &&
        !state.mainTurnActive
      ) {
        awaitingPromptCycleAt.delete(state.sessionId)
        void refreshWorkspaceContext(state.sessionId)
        void flushLocalPromptQueue(state.sessionId)
      }
    })
    if (typeof window.kimiAgent.onKimiGlobalStateChanged === 'function') {
      unsubscribeGlobal = window.kimiAgent.onKimiGlobalStateChanged((event) => {
        if (event.scope === 'navigation') {
          scheduleWorkspaceTreeRefresh()
          return
        }
        globalConfigRevision.value += 1
        const sessionId = requestedSessionId
        if (sessionId !== null) {
          void loadSessionControls(sessionId)
          void loadSessionSkills(sessionId)
        }
      })
    }
    if (runtime.value.status === 'running') await refreshWorkspaceTree()
  }

  const refreshWorkspaceTree = async (): Promise<void> => {
    if (window.kimiAgent === undefined || runtime.value.status !== 'running') return
    const generation = ++workspaceTreeGeneration
    try {
      if (typeof window.kimiAgent.getWorkspaceTreePage === 'function') {
        let snapshot = await window.kimiAgent.getWorkspaceTreePage()
        if (generation !== workspaceTreeGeneration) return
        let workspaces = snapshot.workspaces
        let reloadedPageCount = 1
        const pagesToReload = Math.max(1, loadedSessionPageCount)
        while (
          reloadedPageCount < pagesToReload &&
          snapshot.hasMoreSessions &&
          snapshot.nextBeforeId !== null
        ) {
          snapshot = await window.kimiAgent.getWorkspaceTreePage(snapshot.nextBeforeId)
          if (generation !== workspaceTreeGeneration) return
          workspaces = mergeWorkspacePages(workspaces, snapshot.workspaces)
          reloadedPageCount += 1
        }
        workspaceTree.value = workspaces
        sessionPageHasMore.value = snapshot.hasMoreSessions
        sessionPageBeforeId.value = snapshot.nextBeforeId
        loadedSessionPageCount = reloadedPageCount
      } else {
        const tree = await window.kimiAgent.getWorkspaceTree()
        if (generation !== workspaceTreeGeneration) return
        workspaceTree.value = tree
        sessionPageHasMore.value = false
        sessionPageBeforeId.value = null
        loadedSessionPageCount = 0
      }
      if (generation === workspaceTreeGeneration) workspaceError.value = null
    } catch (error) {
      if (generation === workspaceTreeGeneration) {
        workspaceError.value = error instanceof Error ? error.message : String(error)
      }
    }
  }

  const scheduleWorkspaceTreeRefresh = (): void => {
    if (workspaceRefreshTimer !== undefined || runtime.value.status !== 'running') return
    workspaceRefreshTimer = window.setTimeout(() => {
      workspaceRefreshTimer = undefined
      void refreshWorkspaceTree()
    }, 240)
  }

  const loadMoreSessions = async (): Promise<void> => {
    const api = window.kimiAgent
    const beforeId = sessionPageBeforeId.value
    if (
      api === undefined ||
      typeof api.getWorkspaceTreePage !== 'function' ||
      !sessionPageHasMore.value ||
      beforeId === null ||
      sessionPagePending.value
    ) return
    const treeGeneration = workspaceTreeGeneration
    sessionPagePending.value = true
    sessionPageError.value = null
    try {
      const snapshot = await api.getWorkspaceTreePage(beforeId)
      if (treeGeneration !== workspaceTreeGeneration) return
      workspaceTree.value = mergeWorkspacePages(workspaceTree.value ?? [], snapshot.workspaces)
      sessionPageHasMore.value = snapshot.hasMoreSessions
      sessionPageBeforeId.value = snapshot.nextBeforeId
      loadedSessionPageCount += 1
    } catch (error) {
      if (treeGeneration === workspaceTreeGeneration) sessionPageError.value = errorMessage(error)
    } finally {
      sessionPagePending.value = false
    }
  }

  const loadSessionChildren = async (sessionId: string): Promise<SessionNavigationItem[]> => {
    const api = window.kimiAgent
    if (api === undefined || childrenPendingSessionId.value !== null) return []
    childrenPendingSessionId.value = sessionId
    childrenError.value = null
    try {
      return await api.listChildSessions(sessionId)
    } catch (error) {
      childrenError.value = errorMessage(error)
      return []
    } finally {
      childrenPendingSessionId.value = null
    }
  }

  const runLifecycleAction = async <T>(key: string, action: () => Promise<T>): Promise<T | null> => {
    if (window.kimiAgent === undefined || runtime.value.status !== 'running' || lifecyclePending.value !== null) {
      return null
    }
    lifecyclePending.value = key
    lifecycleError.value = null
    try {
      return await action()
    } catch (error) {
      lifecycleError.value = errorMessage(error)
      return null
    } finally {
      lifecyclePending.value = null
    }
  }

  const addWorkspace = async (): Promise<string | null> => {
    const result = await runLifecycleAction('workspace:add', () => window.kimiAgent!.addWorkspace())
    if (result === null || result.cancelled || result.workspaceId === null) return null
    await refreshWorkspaceTree()
    return result.workspaceId
  }

  const renameWorkspace = async (workspaceId: string, name: string): Promise<boolean> => {
    const result = await runLifecycleAction(`workspace:rename:${workspaceId}`, async () => {
      await window.kimiAgent!.renameWorkspace(workspaceId, name)
      return true
    })
    if (result !== true) return false
    await refreshWorkspaceTree()
    return true
  }

  const deleteWorkspace = async (workspaceId: string): Promise<boolean> => {
    const result = await runLifecycleAction(`workspace:delete:${workspaceId}`, async () => {
      await window.kimiAgent!.deleteWorkspace(workspaceId)
      return true
    })
    if (result !== true) return false
    await refreshWorkspaceTree()
    return true
  }

  const createSession = async (workspaceId: string): Promise<SessionCreateResult | null> => {
    const result = await runLifecycleAction(`session:create:${workspaceId}`, () =>
      window.kimiAgent!.createSession(workspaceId)
    )
    if (result === null) return null
    await refreshWorkspaceTree()
    return result
  }

  const renameSession = async (sessionId: string, title: string): Promise<boolean> => {
    const result = await runLifecycleAction(`session:rename:${sessionId}`, async () => {
      await window.kimiAgent!.renameSession(sessionId, title)
      return true
    })
    if (result !== true) return false
    if (sessionView.value?.sessionId === sessionId) {
      sessionView.value = { ...sessionView.value, title }
    }
    await refreshWorkspaceTree()
    return true
  }

  const archiveSession = async (sessionId: string): Promise<boolean> => {
    const result = await runLifecycleAction(`session:archive:${sessionId}`, async () => {
      await window.kimiAgent!.archiveSession(sessionId)
      return true
    })
    if (result !== true) return false
    if (requestedSessionId === sessionId) clearActiveSession()
    await refreshWorkspaceTree()
    return true
  }

  const forkSession = async (sessionId: string): Promise<SessionCreateResult | null> => {
    const result = await runLifecycleAction(`session:fork:${sessionId}`, () =>
      window.kimiAgent!.forkSession(sessionId)
    )
    if (result === null) return null
    await refreshWorkspaceTree()
    return result
  }

  const exportSession = async (sessionId: string): Promise<SessionExportResult | null> => (
    runLifecycleAction(`session:export:${sessionId}`, () => window.kimiAgent!.exportSession(sessionId))
  )

  const toggle = async (): Promise<void> => {
    if (window.kimiAgent === undefined || pending.value) return
    pending.value = true
    try {
      runtime.value = runtime.value.status === 'running'
        ? await window.kimiAgent.stopRuntime()
        : await window.kimiAgent.startRuntime('system')
      if (runtime.value.status === 'running') await refreshWorkspaceTree()
    } finally {
      pending.value = false
    }
  }

  const connectExternalRuntime = async (origin: string, token: string): Promise<boolean> => {
    if (window.kimiAgent === undefined || pending.value || runtime.value.status === 'running') return false
    pending.value = true
    try {
      runtime.value = await window.kimiAgent.connectExternalRuntime({ origin, token })
      if (runtime.value.status === 'running') {
        await refreshWorkspaceTree()
        return true
      }
      return false
    } finally {
      pending.value = false
    }
  }

  const openSession = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || runtime.value.status !== 'running' || sessionId.length === 0) return
    const generation = ++sessionOpenGeneration
    requestedSessionId = sessionId
    activeQueueSessionId.value = sessionId
    resetWorkspaceContext()
    resetSessionSkills()
    resetSessionControls()
    resetSessionOperational()
    conversationActionError.value = null
    clearAgentTranscript()
    interactionGeneration += 1
    interactionPendingKey.value = null
    interactionError.value = null
    try {
      const state = await window.kimiAgent.openSession(sessionId)
      if (generation !== sessionOpenGeneration) return
      sessionView.value = state
      sessionError.value = state.error
      void refreshWorkspaceContext(sessionId)
      void loadSessionSkills(sessionId)
      void loadSessionControls(sessionId)
      void refreshSessionOperational(sessionId)
      void loadSessionWarnings(sessionId)
      if (!state.mainTurnActive) void flushLocalPromptQueue(sessionId)
    } catch (error) {
      if (generation === sessionOpenGeneration) {
        sessionError.value = error instanceof Error ? error.message : String(error)
      }
    }
  }

  const loadSessionWarnings = async (sessionId: string): Promise<void> => {
    const api = window.kimiAgent
    if (api === undefined) return
    const generation = ++warningsGeneration
    sessionWarnings.value = []
    sessionWarningsError.value = null
    try {
      const warnings = await api.getSessionWarnings(sessionId)
      if (generation === warningsGeneration && sessionId === requestedSessionId) {
        sessionWarnings.value = warnings
      }
    } catch (error) {
      if (generation === warningsGeneration && sessionId === requestedSessionId) {
        sessionWarningsError.value = errorMessage(error)
      }
    }
  }

  const submitPrompt = async (sessionId: string, input: KimiPromptInput): Promise<boolean> => {
    if (window.kimiAgent === undefined) return false
    const cloneableInput = toCloneablePromptInput(input)
    if (input.deliveryMode !== 'steer' && shouldQueueLocally(sessionId)) {
      enqueueLocalPrompt(sessionId, cloneableInput)
      if (!isSessionExecuting(sessionId)) void flushLocalPromptQueue(sessionId)
      return true
    }
    return await sendPromptNow(sessionId, cloneableInput)
  }

  const compactSession = async (sessionId: string, instruction?: string): Promise<boolean> => {
    if (window.kimiAgent === undefined || conversationActionPending.value !== null) return false
    conversationActionPending.value = 'compact'
    conversationActionError.value = null
    try {
      await window.kimiAgent.compactSession(sessionId, instruction)
      void loadSessionControls(sessionId)
      return true
    } catch (error) {
      conversationActionError.value = errorMessage(error)
      return false
    } finally {
      conversationActionPending.value = null
    }
  }

  const undoSession = async (sessionId: string): Promise<KimiUndoDraft | null> => {
    if (window.kimiAgent === undefined || conversationActionPending.value !== null) return null
    conversationActionPending.value = 'undo'
    conversationActionError.value = null
    try {
      const draft = await window.kimiAgent.undoSession(sessionId, 1)
      void refreshSessionOperational(sessionId, true)
      return draft
    } catch (error) {
      conversationActionError.value = errorMessage(error)
      return null
    } finally {
      conversationActionPending.value = null
    }
  }

  const startSideChat = async (sessionId: string): Promise<void> => {
    if (
      window.kimiAgent === undefined || sideChatPending.value || requestedSessionId !== sessionId ||
      sessionView.value?.sideChat !== null
    ) return
    sideChatPending.value = true
    sideChatError.value = null
    try {
      await window.kimiAgent.startSideChat(sessionId)
    } catch (error) {
      if (requestedSessionId === sessionId) sideChatError.value = errorMessage(error)
    } finally {
      sideChatPending.value = false
    }
  }

  const submitSideChatPrompt = async (
    sessionId: string,
    agentId: string,
    input: KimiSideChatPromptInput
  ): Promise<void> => {
    if (
      window.kimiAgent === undefined || sideChatPending.value || requestedSessionId !== sessionId ||
      sessionView.value?.sideChat?.agentId !== agentId
    ) return
    sideChatPending.value = true
    sideChatError.value = null
    try {
      await window.kimiAgent.submitSideChatPrompt(
        sessionId,
        agentId,
        toCloneableSideChatPromptInput(input)
      )
    } catch (error) {
      if (requestedSessionId === sessionId) sideChatError.value = ipcErrorMessage(error)
    } finally {
      sideChatPending.value = false
    }
  }

  const closeSideChat = async (sessionId: string, agentId: string): Promise<void> => {
    if (window.kimiAgent === undefined || requestedSessionId !== sessionId) return
    sideChatError.value = null
    try {
      await window.kimiAgent.closeSideChat(sessionId, agentId)
    } catch (error) {
      if (requestedSessionId === sessionId) sideChatError.value = errorMessage(error)
    }
  }

  const loadAgentTranscript = async (sessionId: string, agentId: string): Promise<void> => {
    if (window.kimiAgent === undefined || requestedSessionId !== sessionId) return
    const generation = ++agentTranscriptGeneration
    agentTranscript.value = null
    agentTranscriptPending.value = true
    agentTranscriptError.value = null
    try {
      const transcript = await window.kimiAgent.getAgentTranscript(sessionId, agentId)
      if (generation === agentTranscriptGeneration && requestedSessionId === sessionId) {
        agentTranscript.value = transcript
      }
    } catch (error) {
      if (generation === agentTranscriptGeneration && requestedSessionId === sessionId) {
        agentTranscript.value = null
        agentTranscriptError.value = errorMessage(error)
      }
    } finally {
      if (generation === agentTranscriptGeneration) agentTranscriptPending.value = false
    }
  }

  const clearAgentTranscript = (): void => {
    agentTranscriptGeneration += 1
    agentTranscript.value = null
    agentTranscriptPending.value = false
    agentTranscriptError.value = null
  }

  const sendPromptNow = async (sessionId: string, input: KimiPromptInput): Promise<boolean> => {
    if (window.kimiAgent === undefined || promptPending.value) return false
    promptPending.value = true
    promptError.value = null
    try {
      // Vue deep refs wrap queued drafts again, so normalize at the IPC boundary as well.
      const cloneableInput = toCloneablePromptInput(input)
      const result = await window.kimiAgent.submitPrompt(sessionId, cloneableInput)
      const accepted = result.status === 'running' || result.status === 'queued'
      if (accepted) {
        awaitingPromptCycleAt.set(sessionId, Date.now())
      }
      if (cloneableInput.goalObjective !== undefined) goalMode.value = false
      return accepted
    } catch (error) {
      promptError.value = ipcErrorMessage(error)
      return false
    } finally {
      promptPending.value = false
      if (sessionId === requestedSessionId) void refreshSessionOperational(sessionId, true)
    }
  }

  const enqueueLocalPrompt = (sessionId: string, input: KimiPromptInput): void => {
    const queue = localPromptDraftsBySession.value[sessionId] ?? []
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localPromptDraftsBySession.value = {
      ...localPromptDraftsBySession.value,
      [sessionId]: appendLocalPromptDraft(queue, {
        id,
        sessionId,
        input: toCloneablePromptInput(input),
        createdAt: new Date().toISOString()
      })
    }
  }

  const flushLocalPromptQueue = async (sessionId: string): Promise<void> => {
    if (sessionId !== requestedSessionId || isSessionExecuting(sessionId)) return
    const queue = localPromptDraftsBySession.value[sessionId] ?? []
    const draft = queue[0]
    if (draft === undefined) return
    localPromptDraftsBySession.value = {
      ...localPromptDraftsBySession.value,
      [sessionId]: queue.slice(1)
    }
    const controls = sessionId === requestedSessionId && promptControls.value !== null
      ? promptControls.value
      : draft.input.controls
    if (await sendPromptNow(sessionId, { ...draft.input, controls })) return
    localPromptDraftsBySession.value = {
      ...localPromptDraftsBySession.value,
      [sessionId]: prependLocalPromptDraft(localPromptDraftsBySession.value[sessionId] ?? [], draft)
    }
  }

  const takeLocalPromptDraft = (sessionId: string, draftId: string): LocalPromptDraft | null => {
    const result = removeLocalPromptDraft(localPromptDraftsBySession.value[sessionId] ?? [], draftId)
    if (result.removed === null) return null
    localPromptDraftsBySession.value = {
      ...localPromptDraftsBySession.value,
      [sessionId]: result.queue
    }
    return result.removed
  }

  const removeLocalPrompt = (sessionId: string, draftId: string): void => {
    const result = removeLocalPromptDraft(localPromptDraftsBySession.value[sessionId] ?? [], draftId)
    if (result.removed === null) return
    localPromptDraftsBySession.value = {
      ...localPromptDraftsBySession.value,
      [sessionId]: result.queue
    }
    for (const attachment of result.removed?.input.attachments ?? []) {
      void window.kimiAgent?.discardAttachment(attachment.fileId).catch(() => {
        // Draft removal is authoritative locally; Kimi file cleanup is best-effort.
      })
    }
  }

  const moveLocalPrompt = (sessionId: string, draftId: string, direction: -1 | 1): void => {
    const queue = localPromptDraftsBySession.value[sessionId] ?? []
    const next = moveLocalPromptDraft(queue, draftId, direction)
    if (next === queue) return
    localPromptDraftsBySession.value = { ...localPromptDraftsBySession.value, [sessionId]: next }
  }

  const shouldQueueLocally = (sessionId: string): boolean => (
    isSessionExecuting(sessionId) || (localPromptDraftsBySession.value[sessionId]?.length ?? 0) > 0
  )

  const isSessionExecuting = (sessionId: string): boolean => {
    if (promptPending.value || awaitingPromptCycleAt.has(sessionId)) return true
    if (sessionView.value?.sessionId === sessionId && sessionView.value.mainTurnActive) return true
    if (sessionId === requestedSessionId && sessionOperational.value !== null) {
      return sessionOperational.value.prompts.active !== null || sessionOperational.value.prompts.queued.length > 0
    }
    return false
  }

  const activateSkill = async (sessionId: string, skillName: string, args?: string): Promise<void> => {
    if (window.kimiAgent === undefined || skillActivationPending.value) return
    skillActivationPending.value = true
    skillActivationError.value = null
    try {
      await window.kimiAgent.activateSkill(sessionId, skillName, args)
    } catch (error) {
      skillActivationError.value = errorMessage(error)
    } finally {
      skillActivationPending.value = false
    }
  }

  const steerPrompts = async (sessionId: string, promptIds: string[]): Promise<void> => {
    if (
      window.kimiAgent === undefined ||
      promptIds.length === 0 ||
      operationalActionPending.value !== null
    ) return
    operationalActionPending.value = `prompt:${promptIds.join(',')}`
    promptError.value = null
    try {
      await window.kimiAgent.steerPrompts(sessionId, promptIds)
      void refreshSessionOperational(sessionId, true)
    } catch (error) {
      promptError.value = error instanceof Error ? error.message : String(error)
    } finally {
      operationalActionPending.value = null
    }
  }

  const abortActivePrompt = async (): Promise<void> => {
    const current = sessionView.value
    if (
      window.kimiAgent === undefined ||
      current === null ||
      !current.mainTurnActive ||
      promptPending.value
    ) return
    promptPending.value = true
    promptError.value = null
    try {
      if (current.activePromptId === null) await window.kimiAgent.abortSession(current.sessionId)
      else await window.kimiAgent.abortPrompt(current.sessionId, current.activePromptId)
    } catch (error) {
      promptError.value = error instanceof Error ? error.message : String(error)
    } finally {
      promptPending.value = false
      void refreshSessionOperational(current.sessionId, true)
    }
  }

  const abortPrompt = async (sessionId: string, promptId: string): Promise<void> => {
    if (window.kimiAgent === undefined || operationalActionPending.value !== null) return
    operationalActionPending.value = `prompt:${promptId}`
    sessionOperationalError.value = null
    try {
      await window.kimiAgent.abortPrompt(sessionId, promptId)
      await refreshSessionOperational(sessionId, true)
    } catch (error) {
      sessionOperationalError.value = errorMessage(error)
    } finally {
      operationalActionPending.value = null
    }
  }

  const respondApproval = async (
    sessionId: string,
    approvalId: string,
    response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session' }
  ): Promise<void> => {
    if (window.kimiAgent === undefined || interactionPendingKey.value !== null) return
    const generation = ++interactionGeneration
    interactionPendingKey.value = `approval:${approvalId}`
    interactionError.value = null
    try {
      await window.kimiAgent.respondApproval(
        sessionId,
        approvalId,
        toCloneableApprovalResponse(response)
      )
    } catch (error) {
      if (generation === interactionGeneration) {
        interactionError.value = ipcErrorMessage(error)
      }
    } finally {
      if (generation === interactionGeneration) interactionPendingKey.value = null
    }
  }

  const respondQuestion = async (
    sessionId: string,
    questionId: string,
    answers: Record<string, QuestionAnswerInput>
  ): Promise<void> => {
    if (window.kimiAgent === undefined || interactionPendingKey.value !== null) return
    const generation = ++interactionGeneration
    interactionPendingKey.value = `question:${questionId}:answer`
    interactionError.value = null
    try {
      await window.kimiAgent.respondQuestion(
        sessionId,
        questionId,
        toCloneableQuestionAnswers(answers)
      )
    } catch (error) {
      if (generation === interactionGeneration) {
        interactionError.value = ipcErrorMessage(error)
      }
    } finally {
      if (generation === interactionGeneration) interactionPendingKey.value = null
    }
  }

  const dismissQuestion = async (sessionId: string, questionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || interactionPendingKey.value !== null) return
    const generation = ++interactionGeneration
    interactionPendingKey.value = `question:${questionId}:dismiss`
    interactionError.value = null
    try {
      await window.kimiAgent.dismissQuestion(sessionId, questionId)
    } catch (error) {
      if (generation === interactionGeneration) {
        interactionError.value = error instanceof Error ? error.message : String(error)
      }
    } finally {
      if (generation === interactionGeneration) interactionPendingKey.value = null
    }
  }

  const loadDirectory = async (path = '.'): Promise<void> => {
    const sessionId = requestedSessionId
    if (sessionId === null) return
    await loadDirectoryForSession(sessionId, path, workspaceGeneration)
  }

  const openFile = async (path: string): Promise<void> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null) return
    const generation = ++previewGeneration
    filePreviewPending.value = true
    filePreview.value = null
    filePreviewError.value = null
    fileActionError.value = null
    fileActionNotice.value = null
    try {
      const preview = await window.kimiAgent.readFile(sessionId, path)
      if (generation !== previewGeneration || sessionId !== requestedSessionId) return
      filePreview.value = preview
    } catch (error) {
      if (generation === previewGeneration && sessionId === requestedSessionId) {
        filePreview.value = null
        filePreviewError.value = errorMessage(error)
      }
    } finally {
      if (generation === previewGeneration) filePreviewPending.value = false
    }
  }

  const closeFilePreview = (): void => {
    previewGeneration += 1
    fileActionGeneration += 1
    filePreview.value = null
    filePreviewPending.value = false
    filePreviewError.value = null
    fileActionPending.value = null
    fileActionError.value = null
    fileActionNotice.value = null
  }

  const searchMentionFiles = async (query: string): Promise<WorkspaceFileSearchItem[]> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null) return []
    try {
      const result = await window.kimiAgent.searchFiles(sessionId, query)
      return sessionId === requestedSessionId ? result.items.slice(0, 20) : []
    } catch {
      return []
    }
  }

  const searchFiles = async (query: string): Promise<void> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null || fileSearchPending.value) return
    const generation = ++fileSearchGeneration
    fileSearchPending.value = true
    fileSearchError.value = null
    try {
      const result = await window.kimiAgent.searchFiles(sessionId, query)
      if (generation !== fileSearchGeneration || sessionId !== requestedSessionId) return
      fileSearch.value = result
    } catch (error) {
      if (generation === fileSearchGeneration && sessionId === requestedSessionId) {
        fileSearch.value = null
        fileSearchError.value = errorMessage(error)
      }
    } finally {
      if (generation === fileSearchGeneration) fileSearchPending.value = false
    }
  }

  const grepFiles = async (pattern: string): Promise<void> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null || fileGrepPending.value) return
    const generation = ++fileGrepGeneration
    fileGrepPending.value = true
    fileGrepError.value = null
    try {
      const result = await window.kimiAgent.grepFiles(sessionId, pattern)
      if (generation !== fileGrepGeneration || sessionId !== requestedSessionId) return
      fileGrep.value = result
    } catch (error) {
      if (generation === fileGrepGeneration && sessionId === requestedSessionId) {
        fileGrep.value = null
        fileGrepError.value = errorMessage(error)
      }
    } finally {
      if (generation === fileGrepGeneration) fileGrepPending.value = false
    }
  }

  const runFileAction = async (
    key: string,
    action: (sessionId: string) => Promise<boolean | void>
  ): Promise<boolean> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null || fileActionPending.value !== null) return false
    const generation = ++fileActionGeneration
    fileActionPending.value = key
    fileActionError.value = null
    fileActionNotice.value = null
    try {
      const completed = await action(sessionId)
      if (generation !== fileActionGeneration || sessionId !== requestedSessionId || completed === false) return false
      if (key.startsWith('download:')) fileActionNotice.value = '文件已保存到所选位置。'
      else if (key.startsWith('reveal:')) fileActionNotice.value = '已在 Finder 中显示文件。'
      else if (key.startsWith('system-open:')) fileActionNotice.value = '已使用系统默认应用打开。'
      else if (key.startsWith('trash:')) fileActionNotice.value = '已移到废纸篓。'
      else fileActionNotice.value = '已交给 Kimi 打开文件。'
      return true
    } catch (error) {
      if (generation === fileActionGeneration && sessionId === requestedSessionId) {
        fileActionError.value = errorMessage(error)
      }
      return false
    } finally {
      if (generation === fileActionGeneration) fileActionPending.value = null
    }
  }

  const downloadWorkspaceFile = async (path: string): Promise<void> => {
    await runFileAction(`download:${path}`, async (sessionId) => {
      const result = await window.kimiAgent!.downloadWorkspaceFile(sessionId, path)
      return result.saved
    })
  }

  const openWorkspaceFile = async (path: string, line?: number): Promise<void> => {
    await runFileAction(`open:${path}`, async (sessionId) => {
      await window.kimiAgent!.openWorkspaceFile(sessionId, path, line)
    })
  }

  const openWorkspaceFileIn = async (appId: WorkspaceOpenApp, path: string, line?: number): Promise<void> => {
    await runFileAction(`open-in:${appId}:${path}`, async (sessionId) => {
      await window.kimiAgent!.openWorkspaceFileIn(sessionId, appId, path, line)
    })
  }

  const openWorkspaceFileSystem = async (path: string): Promise<void> => {
    await runFileAction(`system-open:${path}`, async (sessionId) => {
      await window.kimiAgent!.openWorkspaceFileSystem(sessionId, path)
    })
  }

  const revealWorkspaceFile = async (path: string): Promise<void> => {
    await runFileAction(`reveal:${path}`, async (sessionId) => {
      await window.kimiAgent!.revealWorkspaceFile(sessionId, path)
    })
  }

  const trashWorkspaceEntry = async (path: string): Promise<void> => {
    const sessionId = requestedSessionId
    const trashed = await runFileAction(`trash:${path}`, async (activeSessionId) => {
      await window.kimiAgent!.trashWorkspaceEntry(activeSessionId, path)
    })
    if (!trashed || sessionId === null || sessionId !== requestedSessionId) return
    if (filePreview.value?.path === path || filePreview.value?.path.startsWith(`${path}/`)) closeFilePreview()
    await refreshWorkspaceContext(sessionId)
  }

  const loadFileDiff = async (path: string): Promise<void> => {
    const sessionId = requestedSessionId
    if (window.kimiAgent === undefined || sessionId === null) return
    const generation = ++diffGeneration
    fileDiffPending.value = true
    fileDiffError.value = null
    try {
      const diff = await window.kimiAgent.getFileDiff(sessionId, path)
      if (generation !== diffGeneration || sessionId !== requestedSessionId) return
      fileDiff.value = diff
    } catch (error) {
      if (generation === diffGeneration && sessionId === requestedSessionId) {
        fileDiff.value = null
        fileDiffError.value = errorMessage(error)
      }
    } finally {
      if (generation === diffGeneration) fileDiffPending.value = false
    }
  }

  const refreshWorkspaceContext = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || sessionId !== requestedSessionId) return
    const generation = ++workspaceGeneration
    gitStatusPending.value = true
    gitStatusError.value = null
    const currentPath = fileList.value?.path ?? '.'
    const directoryPromise = loadDirectoryForSession(sessionId, currentPath, generation)
    const gitPromise = window.kimiAgent.getGitStatus(sessionId)
      .then((status) => {
        if (generation === workspaceGeneration && sessionId === requestedSessionId) gitStatus.value = status
      })
      .catch((error: unknown) => {
        if (generation === workspaceGeneration && sessionId === requestedSessionId) {
          gitStatus.value = null
          gitStatusError.value = errorMessage(error)
        }
      })
      .finally(() => {
        if (generation === workspaceGeneration) gitStatusPending.value = false
      })
    /* Diff 面板只在用户主动点击变更文件时打开，不再默认展开首个文件。 */
    await Promise.all([directoryPromise, gitPromise])
  }

  const loadGitBranches = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || sessionId !== requestedSessionId) return
    const generation = ++branchesGeneration
    gitBranchesPending.value = true
    try {
      const result = await window.kimiAgent.listGitBranches(sessionId)
      if (generation === branchesGeneration && sessionId === requestedSessionId) gitBranches.value = result
    } catch {
      if (generation === branchesGeneration && sessionId === requestedSessionId) gitBranches.value = null
    } finally {
      if (generation === branchesGeneration) gitBranchesPending.value = false
    }
  }

  const loadDirectoryForSession = async (
    sessionId: string,
    path: string,
    workspaceAtStart: number
  ): Promise<void> => {
    if (window.kimiAgent === undefined) return
    const generation = ++directoryGeneration
    fileListPending.value = true
    fileListError.value = null
    try {
      const listing = await window.kimiAgent.listFiles(sessionId, path)
      if (
        generation !== directoryGeneration ||
        workspaceAtStart !== workspaceGeneration ||
        sessionId !== requestedSessionId
      ) return
      fileList.value = listing
      filePreview.value = null
      filePreviewError.value = null
    } catch (error) {
      if (
        generation === directoryGeneration &&
        workspaceAtStart === workspaceGeneration &&
        sessionId === requestedSessionId
      ) {
        fileList.value = null
        fileListError.value = errorMessage(error)
      }
    } finally {
      if (generation === directoryGeneration) fileListPending.value = false
    }
  }

  const resetWorkspaceContext = (): void => {
    workspaceGeneration += 1
    directoryGeneration += 1
    previewGeneration += 1
    diffGeneration += 1
    fileSearchGeneration += 1
    fileGrepGeneration += 1
    fileActionGeneration += 1
    fileList.value = null
    fileListPending.value = false
    fileListError.value = null
    filePreview.value = null
    filePreviewPending.value = false
    filePreviewError.value = null
    gitStatus.value = null
    gitStatusPending.value = false
    gitStatusError.value = null
    branchesGeneration += 1
    gitBranches.value = null
    gitBranchesPending.value = false
    fileDiff.value = null
    fileDiffPending.value = false
    fileDiffError.value = null
    fileSearch.value = null
    fileSearchPending.value = false
    fileSearchError.value = null
    fileGrep.value = null
    fileGrepPending.value = false
    fileGrepError.value = null
    fileActionPending.value = null
    fileActionError.value = null
    fileActionNotice.value = null
  }

  const loadSessionSkills = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || sessionId !== requestedSessionId) return
    const generation = ++skillsGeneration
    sessionSkillsPending.value = true
    sessionSkillsError.value = null
    try {
      const skills = await window.kimiAgent.listSessionSkills(sessionId)
      if (generation !== skillsGeneration || sessionId !== requestedSessionId) return
      sessionSkills.value = skills
    } catch (error) {
      if (generation === skillsGeneration && sessionId === requestedSessionId) {
        sessionSkills.value = []
        sessionSkillsError.value = errorMessage(error)
      }
    } finally {
      if (generation === skillsGeneration) sessionSkillsPending.value = false
    }
  }

  const resetSessionSkills = (): void => {
    skillsGeneration += 1
    sessionSkills.value = []
    sessionSkillsPending.value = false
    sessionSkillsError.value = null
    skillActivationPending.value = false
    skillActivationError.value = null
  }

  const loadSessionControls = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || sessionId !== requestedSessionId) return
    const generation = ++controlsGeneration
    const statusGeneration = ++runtimeStatusGeneration
    sessionControlsPending.value = true
    sessionControlsError.value = null
    try {
      const [status, settings] = await Promise.all([
        window.kimiAgent.getSessionRuntimeStatus(sessionId),
        window.kimiAgent.getKimiSettings()
      ])
      if (
        generation !== controlsGeneration ||
        statusGeneration !== runtimeStatusGeneration ||
        sessionId !== requestedSessionId
      ) return
      const model = status.model ?? settings.preferences.defaultModel ?? settings.models[0]?.id ?? null
      if (model === null) throw new Error('Kimi 没有可用模型，请先在设置中配置 Provider 与默认模型')
      const descriptor = settings.models.find((item) => item.id === model)
      const thinking = resolveSessionThinkingEffort(status.thinking, descriptor, lastThinkingEffort)
      sessionRuntimeStatus.value = status
      sessionModels.value = settings.models
      promptControls.value = {
        model,
        thinking,
        permissionMode: status.permissionMode,
        planMode: status.planMode,
        swarmMode: status.swarmMode
      }
    } catch (error) {
      if (generation === controlsGeneration && sessionId === requestedSessionId) {
        sessionRuntimeStatus.value = null
        sessionModels.value = []
        promptControls.value = null
        sessionControlsError.value = errorMessage(error)
      }
    } finally {
      if (generation === controlsGeneration) sessionControlsPending.value = false
    }
  }

  const setPromptControls = (controls: KimiPromptControls): void => {
    promptControls.value = { ...controls }
    const selectedThinking = selectableThinkingEffort(controls.thinking)
    if (selectedThinking !== null) {
      lastThinkingEffort = selectedThinking
      persistLastThinkingEffort(selectedThinking)
    }
  }

  const refreshSessionRuntimeStatus = async (sessionId: string): Promise<void> => {
    if (window.kimiAgent === undefined || sessionId !== requestedSessionId) return
    const generation = ++runtimeStatusGeneration
    try {
      const status = await window.kimiAgent.getSessionRuntimeStatus(sessionId)
      if (generation === runtimeStatusGeneration && sessionId === requestedSessionId) {
        sessionRuntimeStatus.value = status
      }
    } catch {
      // Context telemetry is supplemental. Keep the last confirmed value and
      // avoid disrupting the composer when a transient status request fails.
    }
  }

  const setGoalMode = (enabled: boolean): void => {
    goalMode.value = enabled
  }

  const resetSessionControls = (): void => {
    controlsGeneration += 1
    runtimeStatusGeneration += 1
    sessionRuntimeStatus.value = null
    sessionModels.value = []
    promptControls.value = null
    sessionControlsPending.value = false
    sessionControlsError.value = null
    goalMode.value = false
  }

  const refreshSessionOperational = async (
    sessionId: string | null = requestedSessionId,
    quiet = false
  ): Promise<void> => {
    if (
      window.kimiAgent === undefined ||
      sessionId === null ||
      sessionId !== requestedSessionId ||
      sessionOperationalPending.value
    ) return
    const generation = ++operationalGeneration
    if (!quiet) sessionOperationalPending.value = true
    try {
      const state = await window.kimiAgent.getSessionOperationalState(sessionId)
      if (generation !== operationalGeneration || sessionId !== requestedSessionId) return
      sessionOperational.value = state
      sessionOperationalError.value = null
      if (
        state.prompts.active === null &&
        state.prompts.queued.length === 0 &&
        sessionView.value?.sessionId === sessionId &&
        !sessionView.value.mainTurnActive
      ) {
        const awaitingSince = awaitingPromptCycleAt.get(sessionId)
        if (awaitingSince === undefined || Date.now() - awaitingSince >= 2_000) {
          awaitingPromptCycleAt.delete(sessionId)
          void flushLocalPromptQueue(sessionId)
        }
      }
    } catch (error) {
      if (generation === operationalGeneration && sessionId === requestedSessionId) {
        sessionOperationalError.value = errorMessage(error)
      }
    } finally {
      if (generation === operationalGeneration) sessionOperationalPending.value = false
    }
  }

  const controlGoal = async (
    sessionId: string,
    control: 'pause' | 'resume' | 'cancel'
  ): Promise<void> => {
    if (window.kimiAgent === undefined || operationalActionPending.value !== null) return
    operationalActionPending.value = `goal:${control}`
    sessionOperationalError.value = null
    try {
      const goal = await window.kimiAgent.controlSessionGoal(sessionId, control)
      if (sessionId === requestedSessionId && sessionOperational.value !== null) {
        sessionOperational.value = { ...sessionOperational.value, goal }
      }
      void refreshSessionOperational(sessionId, true)
    } catch (error) {
      sessionOperationalError.value = errorMessage(error)
    } finally {
      operationalActionPending.value = null
    }
  }

  const cancelTask = async (sessionId: string, taskId: string): Promise<void> => {
    if (window.kimiAgent === undefined || operationalActionPending.value !== null) return
    operationalActionPending.value = `task:${taskId}`
    sessionOperationalError.value = null
    try {
      await window.kimiAgent.cancelBackgroundTask(sessionId, taskId)
      await refreshSessionOperational(sessionId, true)
    } catch (error) {
      sessionOperationalError.value = errorMessage(error)
    } finally {
      operationalActionPending.value = null
    }
  }

  const resetSessionOperational = (): void => {
    operationalGeneration += 1
    sessionOperational.value = null
    sessionOperationalPending.value = false
    sessionOperationalError.value = null
    operationalActionPending.value = null
  }

  const clearActiveSession = (): void => {
    requestedSessionId = null
    activeQueueSessionId.value = null
    sessionOpenGeneration += 1
    sessionView.value = null
    sessionError.value = null
    promptError.value = null
    conversationActionPending.value = null
    conversationActionError.value = null
    sideChatPending.value = false
    sideChatError.value = null
    clearAgentTranscript()
    interactionGeneration += 1
    interactionPendingKey.value = null
    interactionError.value = null
    resetSessionSkills()
    resetSessionControls()
    resetSessionOperational()
    warningsGeneration += 1
    sessionWarnings.value = []
    sessionWarningsError.value = null
    resetWorkspaceContext()
  }

  onMounted(() => {
    void load()
    operationalTimer = window.setInterval(() => {
      if (runtime.value.status === 'running' && requestedSessionId !== null) {
        void refreshSessionOperational(requestedSessionId, true)
        void refreshSessionRuntimeStatus(requestedSessionId)
      }
    }, 2_500)
  })
  onBeforeUnmount(() => {
    unsubscribeRuntime?.()
    unsubscribeGlobal?.()
    unsubscribeSession?.()
    if (operationalTimer !== undefined) window.clearInterval(operationalTimer)
    if (workspaceRefreshTimer !== undefined) window.clearTimeout(workspaceRefreshTimer)
  })

  return {
    runtime,
    discovery,
    pending,
    label,
    workspaceTree,
    workspaceError,
    sessionPagePending,
    sessionPageError,
    sessionPageHasMore,
    lifecyclePending,
    lifecycleError,
    sessionView,
    sessionError,
    promptPending,
    promptError,
    conversationActionPending,
    conversationActionError,
    sideChatPending,
    sideChatError,
    agentTranscript,
    agentTranscriptPending,
    agentTranscriptError,
    localPromptQueue,
    sessionRuntimeStatus,
    sessionModels,
    promptControls,
    sessionControlsPending,
    sessionControlsError,
    goalMode,
    sessionOperational,
    sessionOperationalPending,
    sessionOperationalError,
    sessionWarnings,
    sessionWarningsError,
    childrenPendingSessionId,
    childrenError,
    operationalActionPending,
    interactionPendingKey,
    interactionError,
    sessionSkills,
    sessionSkillsPending,
    sessionSkillsError,
    skillActivationPending,
    skillActivationError,
    fileList,
    fileListPending,
    fileListError,
    filePreview,
    filePreviewPending,
    filePreviewError,
    gitStatus,
    gitStatusPending,
    gitStatusError,
    gitBranches,
    gitBranchesPending,
    loadGitBranches,
    fileDiff,
    fileDiffPending,
    fileDiffError,
    fileSearch,
    fileSearchPending,
    fileSearchError,
    fileGrep,
    fileGrepPending,
    fileGrepError,
    fileActionPending,
    fileActionError,
    fileActionNotice,
    globalConfigRevision,
    refreshWorkspaceTree,
    loadMoreSessions,
    loadSessionChildren,
    addWorkspace,
    renameWorkspace,
    deleteWorkspace,
    createSession,
    renameSession,
    archiveSession,
    forkSession,
    exportSession,
    openSession,
    clearActiveSession,
    submitPrompt,
    compactSession,
    undoSession,
    startSideChat,
    submitSideChatPrompt,
    closeSideChat,
    loadAgentTranscript,
    clearAgentTranscript,
    takeLocalPromptDraft,
    removeLocalPrompt,
    moveLocalPrompt,
    setPromptControls,
    setGoalMode,
    refreshSessionOperational,
    controlGoal,
    cancelTask,
    abortPrompt,
    activateSkill,
    steerPrompts,
    abortActivePrompt,
    respondApproval,
    respondQuestion,
    dismissQuestion,
    loadDirectory,
    openFile,
    closeFilePreview,
    searchMentionFiles,
    searchFiles,
    grepFiles,
    downloadWorkspaceFile,
    openWorkspaceFile,
    openWorkspaceFileIn,
    openWorkspaceFileSystem,
    revealWorkspaceFile,
    trashWorkspaceEntry,
    loadFileDiff,
    refreshWorkspaceContext,
    toggle,
    connectExternalRuntime
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveSessionThinkingEffort(
  runtimeEffort: string,
  model: KimiModelCatalogItem | undefined,
  inheritedEffort: string | null
): string {
  const supported = (model?.supportEfforts ?? []).filter((effort) => selectableThinkingEffort(effort) !== null)
  const matchSupported = (candidate: string | null): string | null => {
    if (candidate === null) return null
    if (supported.length < 1) return candidate
    return supported.find((effort) => effort.toLocaleLowerCase() === candidate.toLocaleLowerCase()) ?? null
  }
  const runtime = matchSupported(selectableThinkingEffort(runtimeEffort))
  if (runtime !== null) return runtime
  const inherited = matchSupported(selectableThinkingEffort(inheritedEffort))
  if (inherited !== null) return inherited
  const modelDefault = matchSupported(selectableThinkingEffort(model?.defaultEffort))
  if (modelDefault !== null) return modelDefault
  return supported[0] ?? (runtimeEffort.trim() || 'off')
}

function selectableThinkingEffort(value: string | null | undefined): string | null {
  const effort = value?.trim() ?? ''
  return effort.length < 1 || effort.toLocaleLowerCase() === 'off' ? null : effort
}

function loadLastThinkingEffort(): string | null {
  try {
    return selectableThinkingEffort(window.localStorage.getItem(LAST_THINKING_EFFORT_KEY))
  } catch {
    return null
  }
}

function persistLastThinkingEffort(effort: string): void {
  try {
    window.localStorage.setItem(LAST_THINKING_EFFORT_KEY, effort)
  } catch {
    // A blocked or full local store must not prevent the session control from changing.
  }
}

function mergeWorkspacePages(
  current: WorkspaceNavigationItem[],
  incoming: WorkspaceNavigationItem[]
): WorkspaceNavigationItem[] {
  const currentById = new Map(current.map((workspace) => [workspace.id, workspace]))
  return incoming.map((workspace) => {
    const existing = currentById.get(workspace.id)
    if (existing === undefined) return workspace
    const sessions = [...existing.sessions]
    const seen = new Set(sessions.map((session) => session.id))
    for (const session of workspace.sessions) {
      if (!seen.has(session.id)) sessions.push(session)
    }
    return { ...workspace, sessions }
  })
}
