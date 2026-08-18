import { onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  BrowserBounds,
  BrowserNetworkDetails,
  BrowserPickedElement,
  BrowserViewState,
  BrowserViewport
} from '@shared/contracts'

export function useBrowserBridge() {
  const state = ref<BrowserViewState>(emptyBrowserState())
  const pending = ref(false)
  const error = ref<string | null>(null)
  const networkDetails = ref<BrowserNetworkDetails | null>(null)
  const networkDetailsPending = ref(false)
  const elementPicking = ref(false)
  const localServers = ref<string[]>([])
  const localServersPending = ref(false)
  let localServersDiscovered = false
  let unsubscribe: (() => void) | undefined
  let detailsGeneration = 0
  let pickArmed = false

  const clearPageArtifacts = (): void => {
    detailsGeneration += 1
    networkDetails.value = null
    networkDetailsPending.value = false
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

  const openExternal = async (): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      await window.kimiAgent.openBrowserExternal()
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  /* 页内点选元素：保持会话循环，每次点击注入的选择器在页内直接返回一个元素并立即回调，
     直到 Esc / 工具栏切换 / 导航等原因取消；真实错误上抛到 error 并结束会话。 */
  const pickElements = async (onElements: (elements: BrowserPickedElement[]) => void): Promise<void> => {
    if (window.kimiAgent === undefined || elementPicking.value || state.value.url.length === 0) return
    elementPicking.value = true
    error.value = null
    pickArmed = true
    try {
      while (pickArmed) {
        const result = await window.kimiAgent.pickBrowserElements()
        if (result.cancelled) break
        if (result.elements.length > 0) onElements(result.elements)
      }
    } catch (reason) {
      const message = errorMessage(reason)
      if (!message.includes('cancelled')) error.value = message
    } finally {
      elementPicking.value = false
      pickArmed = false
    }
  }

  const stopPicking = (): void => {
    pickArmed = false
    void window.kimiAgent?.cancelBrowserElementPick()
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
    elementPicking,
    localServers,
    localServersPending,
    openHtml,
    navigate,
    back,
    forward,
    reload,
    stop,
    setBounds,
    setVisible,
    setWorkspaceScope,
    setViewport,
    clearConsole,
    clearNetwork,
    loadNetworkDetails,
    pickElements,
    stopPicking,
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