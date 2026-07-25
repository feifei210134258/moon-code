import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  ipcErrorMessage,
  toCloneableBrowserAnnotationInput,
  toCloneablePromptControls
} from '../utils/ipcPayloads'
import type {
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput,
  BrowserBounds,
  BrowserCaptureResult,
  BrowserNetworkDetails,
  BrowserViewState,
  BrowserViewport,
  KimiPromptControls
} from '@shared/contracts'

export function useBrowserBridge() {
  const state = ref<BrowserViewState>(emptyBrowserState())
  const pending = ref(false)
  const error = ref<string | null>(null)
  const networkDetails = ref<BrowserNetworkDetails | null>(null)
  const networkDetailsPending = ref(false)
  const capture = ref<BrowserCaptureResult | null>(null)
  const localServers = ref<string[]>([])
  const localServersPending = ref(false)
  const annotationDrafts = ref<BrowserAnnotationDraft[]>([])
  const annotationPicking = ref(false)
  const annotationSubmitting = ref(false)
  const annotationError = ref<string | null>(null)
  let localServersDiscovered = false
  let unsubscribe: (() => void) | undefined
  let detailsGeneration = 0

  const clearPageArtifacts = (): void => {
    detailsGeneration += 1
    networkDetails.value = null
    networkDetailsPending.value = false
    capture.value = null
  }

  const runStateOperation = async (operation: () => Promise<BrowserViewState>): Promise<void> => {
    if (window.kimiAgent === undefined || pending.value) return
    pending.value = true
    error.value = null
    try {
      state.value = await operation()
    } catch (reason) {
      error.value = errorMessage(reason)
    } finally {
      pending.value = false
    }
  }

  const openHtml = (sessionId: string, path: string): Promise<void> => {
    clearPageArtifacts()
    return runStateOperation(async () => await window.kimiAgent!.openHtmlPreview(sessionId, path))
  }

  const navigate = (url: string): Promise<void> => {
    clearPageArtifacts()
    return runStateOperation(async () => await window.kimiAgent!.navigateBrowser(url))
  }

  const back = (): Promise<void> => runStateOperation(async () => await window.kimiAgent!.browserBack())
  const forward = (): Promise<void> => runStateOperation(async () => await window.kimiAgent!.browserForward())
  const reload = (): Promise<void> => runStateOperation(async () => await window.kimiAgent!.browserReload())
  const stop = (): Promise<void> => runStateOperation(async () => await window.kimiAgent!.browserStop())

  const setBounds = async (bounds: BrowserBounds): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      await window.kimiAgent.setBrowserBounds(bounds)
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  /* 弹层（批注编辑/截图预览）打开时让主进程摘下原生 guest 视图，避免 DOM 被遮挡。 */
  const setOverlay = async (open: boolean): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      await window.kimiAgent.setBrowserOverlay(open)
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  const setVisible = async (visible: boolean): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      state.value = await window.kimiAgent.setBrowserVisible(visible)
      if (visible && !localServersDiscovered) void discoverLocalServers()
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  const setWorkspaceScope = async (scope: string | null): Promise<void> => {
    if (window.kimiAgent === undefined) return
    clearPageArtifacts()
    annotationDrafts.value = []
    try {
      state.value = await window.kimiAgent.setBrowserWorkspace(scope)
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  const discoverLocalServers = async (): Promise<void> => {
    if (window.kimiAgent === undefined || localServersPending.value) return
    localServersPending.value = true
    try {
      localServers.value = await window.kimiAgent.discoverBrowserLocalServers()
      localServersDiscovered = true
    } catch (reason) {
      error.value = errorMessage(reason)
    } finally {
      localServersPending.value = false
    }
  }

  const setViewport = (viewport: BrowserViewport): Promise<void> =>
    runStateOperation(async () => await window.kimiAgent!.setBrowserViewport(viewport))

  const clearConsole = (): Promise<void> =>
    runStateOperation(async () => await window.kimiAgent!.clearBrowserConsole())

  const clearNetwork = (): Promise<void> => {
    clearPageArtifacts()
    return runStateOperation(async () => await window.kimiAgent!.clearBrowserNetwork())
  }

  const loadNetworkDetails = async (requestId: string): Promise<void> => {
    if (window.kimiAgent === undefined) return
    const generation = ++detailsGeneration
    networkDetailsPending.value = true
    error.value = null
    try {
      const details = await window.kimiAgent.getBrowserNetworkDetails(requestId)
      if (generation === detailsGeneration) networkDetails.value = details
    } catch (reason) {
      if (generation === detailsGeneration) error.value = errorMessage(reason)
    } finally {
      if (generation === detailsGeneration) networkDetailsPending.value = false
    }
  }

  const capturePage = async (fullPage: boolean): Promise<void> => {
    if (window.kimiAgent === undefined || pending.value) return
    pending.value = true
    error.value = null
    try {
      capture.value = await window.kimiAgent.captureBrowser(fullPage)
    } catch (reason) {
      error.value = errorMessage(reason)
    } finally {
      pending.value = false
    }
  }

  const openExternal = async (): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      await window.kimiAgent.openBrowserExternal()
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  const pickAnnotation = async (mode: BrowserAnnotationMode): Promise<void> => {
    if (window.kimiAgent === undefined || annotationPicking.value || state.value.url.length === 0) return
    annotationPicking.value = true
    annotationError.value = null
    try {
      const draft = await window.kimiAgent.pickBrowserAnnotation(mode)
      annotationDrafts.value = [...annotationDrafts.value, draft]
    } catch (reason) {
      const message = errorMessage(reason)
      if (!message.includes('Annotation selection cancelled')) annotationError.value = message
    } finally {
      annotationPicking.value = false
    }
  }

  const deleteAnnotation = async (draftId: string): Promise<void> => {
    if (window.kimiAgent === undefined) return
    annotationError.value = null
    try {
      await window.kimiAgent.deleteBrowserAnnotation(draftId)
      annotationDrafts.value = annotationDrafts.value.filter((draft) => draft.id !== draftId)
    } catch (reason) {
      annotationError.value = errorMessage(reason)
    }
  }

  const submitAnnotation = async (
    sessionId: string,
    input: BrowserAnnotationSubmitInput,
    controls: KimiPromptControls
  ): Promise<void> => {
    if (window.kimiAgent === undefined || annotationSubmitting.value || sessionId.length === 0) return
    annotationSubmitting.value = true
    annotationError.value = null
    try {
      await window.kimiAgent.submitBrowserAnnotation(
        sessionId,
        toCloneableBrowserAnnotationInput(input),
        toCloneablePromptControls(controls)
      )
      annotationDrafts.value = annotationDrafts.value.filter((draft) => draft.id !== input.draftId)
    } catch (reason) {
      annotationError.value = ipcErrorMessage(reason)
    } finally {
      annotationSubmitting.value = false
    }
  }

  onMounted(() => {
    unsubscribe = window.kimiAgent?.onBrowserStateChanged((next) => {
      if (next.url !== state.value.url) clearPageArtifacts()
      state.value = next
    })
  })
  onBeforeUnmount(() => unsubscribe?.())

  return {
    state,
    pending,
    error,
    networkDetails,
    networkDetailsPending,
    capture,
    localServers,
    localServersPending,
    annotationDrafts,
    annotationPicking,
    annotationSubmitting,
    annotationError,
    openHtml,
    navigate,
    back,
    forward,
    reload,
    stop,
    setBounds,
    setOverlay,
    setVisible,
    setWorkspaceScope,
    setViewport,
    clearConsole,
    clearNetwork,
    loadNetworkDetails,
    capturePage,
    pickAnnotation,
    deleteAnnotation,
    submitAnnotation,
    openExternal,
    discoverLocalServers
  }
}

function emptyBrowserState(): BrowserViewState {
  return {
    url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: false,
    viewport: { mode: 'auto', width: null, height: null, deviceScaleFactor: 1 },
    consoleEntries: [], networkEntries: [], error: null
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
