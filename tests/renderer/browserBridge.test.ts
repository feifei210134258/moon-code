// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBrowserBridge } from '../../src/renderer/src/composables/useBrowserBridge.js'
import type {
  BrowserPickedElement,
  BrowserViewState,
  KimiAgentDesktopApi
} from '../../src/shared/contracts.js'

const state: BrowserViewState = {
  url: 'http://localhost:4173/', title: 'Preview', loading: false,
  canGoBack: false, canGoForward: false, visible: true,
  viewport: { mode: 'auto', width: null, height: null, deviceScaleFactor: 1 },
  consoleEntries: [], networkEntries: [], error: null
}

const pickedElement: BrowserPickedElement = {
  selector: '.hero h1',
  xpath: '//h1',
  tag: 'h1',
  ariaLabel: null,
  textSnippet: 'Moon Code 预览',
  rect: { x: 24, y: 48, width: 320, height: 42 },
  pageUrl: state.url,
  pageTitle: 'Preview'
}

afterEach(() => {
  delete window.kimiAgent
})

describe('useBrowserBridge', () => {
  it('projects typed Browser state and routes HTML through the Main bridge', async () => {
    let listener!: (state: BrowserViewState) => void
    const api = {
      openHtmlPreview: vi.fn(async () => state),
      setBrowserVisible: vi.fn(async (visible: boolean) => ({ ...state, visible })),
      setBrowserWorkspace: vi.fn(async () => ({ ...state, url: '', networkEntries: [] })),
      setBrowserBounds: vi.fn(async () => undefined),
      discoverBrowserLocalServers: vi.fn(async () => ['http://localhost:5173/']),
      onBrowserStateChanged: vi.fn((next: (state: BrowserViewState) => void) => {
        listener = next
        return () => {}
      })
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()

    await bridge.openHtml('session-1', 'dist/index.html')
    expect(api.openHtmlPreview).toHaveBeenCalledWith('session-1', 'dist/index.html')
    expect(bridge.state.value.title).toBe('Preview')
    await bridge.setBounds({ x: 1000, y: 100, width: 400, height: 500 })
    expect(api.setBrowserBounds).toHaveBeenCalledWith({ x: 1000, y: 100, width: 400, height: 500 })
    await bridge.setVisible(true)
    await flushPromises()
    expect(api.discoverBrowserLocalServers).toHaveBeenCalledOnce()
    expect(bridge.localServers.value).toEqual(['http://localhost:5173/'])

    bridge.networkDetails.value = {
      requestId: 'old', requestHeaders: {}, responseHeaders: {}, body: 'old',
      bodyTruncated: false, bodyUnavailableReason: null
    }
    await bridge.setWorkspaceScope('workspace-2')
    expect(api.setBrowserWorkspace).toHaveBeenCalledWith('workspace-2')
    expect(bridge.networkDetails.value).toBeNull()

    listener({ ...state, loading: true })
    expect(bridge.state.value.loading).toBe(true)
    wrapper.unmount()
  })

  it('streams each picked element round to the callback until the session is cancelled', async () => {
    const api = {
      pickBrowserElements: vi.fn()
        .mockResolvedValueOnce({ cancelled: false, elements: [pickedElement] })
        .mockResolvedValueOnce({ cancelled: false, elements: [pickedElement] })
        .mockResolvedValueOnce({ cancelled: true, elements: [] }),
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state

    const onElements = vi.fn()
    await bridge.pickElements(onElements)
    expect(api.pickBrowserElements).toHaveBeenCalledTimes(3)
    expect(onElements).toHaveBeenCalledTimes(2)
    expect(onElements).toHaveBeenNthCalledWith(1, [pickedElement])
    expect(onElements).toHaveBeenNthCalledWith(2, [pickedElement])
    expect(bridge.elementPicking.value).toBe(false)
    expect(bridge.error.value).toBeNull()
    wrapper.unmount()
  })

  it('does not loop on rounds that resolve without elements', async () => {
    const api = {
      pickBrowserElements: vi.fn()
        .mockResolvedValueOnce({ cancelled: false, elements: [] })
        .mockResolvedValueOnce({ cancelled: false, elements: [pickedElement] })
        .mockResolvedValueOnce({ cancelled: true, elements: [] }),
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state

    const onElements = vi.fn()
    await bridge.pickElements(onElements)
    expect(api.pickBrowserElements).toHaveBeenCalledTimes(3)
    expect(onElements).toHaveBeenCalledTimes(1)
    expect(onElements).toHaveBeenNthCalledWith(1, [pickedElement])
    wrapper.unmount()
  })

  it('exits the session when the round resolves as cancelled', async () => {
    const pickBrowserElements = vi.fn().mockResolvedValueOnce({ cancelled: true, elements: [pickedElement] })
    const api = {
      pickBrowserElements,
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state

    const onElements = vi.fn()
    await bridge.pickElements(onElements)
    expect(api.pickBrowserElements).toHaveBeenCalledOnce()
    expect(onElements).not.toHaveBeenCalled()
    expect(bridge.elementPicking.value).toBe(false)
    expect(bridge.error.value).toBeNull()
    wrapper.unmount()
  })

  it('cancels the in-flight round through stopPicking and no longer arms another one', async () => {
    const cancelBrowserElementPick = vi.fn(async () => undefined)
    let resolveRound!: (result: { cancelled: boolean; elements: BrowserPickedElement[] }) => void
    const api = {
      pickBrowserElements: vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveRound = resolve })),
      cancelBrowserElementPick,
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state

    const onElements = vi.fn()
    const session = bridge.pickElements(onElements)
    await flushPromises()
    expect(bridge.elementPicking.value).toBe(true)
    bridge.stopPicking()
    expect(cancelBrowserElementPick).toHaveBeenCalledOnce()
    resolveRound({ cancelled: true, elements: [pickedElement] })
    await session
    expect(onElements).not.toHaveBeenCalled()
    expect(bridge.elementPicking.value).toBe(false)
    expect(api.pickBrowserElements).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('surfaces real picker failures and breaks the loop while dropping cancellation-style errors', async () => {
    const pickBrowserElements = vi.fn()
    const api = {
      pickBrowserElements,
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state
    const onElements = vi.fn()

    pickBrowserElements.mockRejectedValueOnce(new Error('Element selection cancelled'))
    await bridge.pickElements(onElements)
    expect(onElements).not.toHaveBeenCalled()
    expect(bridge.error.value).toBeNull()
    expect(bridge.elementPicking.value).toBe(false)

    pickBrowserElements.mockRejectedValueOnce(new Error('browser crashed'))
    await bridge.pickElements(onElements)
    expect(onElements).not.toHaveBeenCalled()
    expect(bridge.error.value).toBe('browser crashed')
    expect(bridge.elementPicking.value).toBe(false)
    wrapper.unmount()
  })

  it('guards the pick session against duplicates and empty URL', async () => {
    const pickBrowserElements = vi.fn()
    const api = {
      pickBrowserElements,
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    bridge.state.value = state
    const onElements = vi.fn()

    let resolvePick!: (result: { cancelled: boolean; elements: BrowserPickedElement[] }) => void
    pickBrowserElements.mockReturnValueOnce(new Promise((resolve) => { resolvePick = resolve }))
    const first = bridge.pickElements(onElements)
    const second = bridge.pickElements(onElements)
    await flushPromises()
    expect(pickBrowserElements).toHaveBeenCalledOnce()
    resolvePick({ cancelled: true, elements: [] })
    await first
    await second
    expect(onElements).not.toHaveBeenCalled()

    bridge.state.value = { ...state, url: '' }
    await bridge.pickElements(onElements)
    expect(pickBrowserElements).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('loads only the selected bounded Network details', async () => {
    const api = {
      getBrowserNetworkDetails: vi.fn(async (requestId: string) => ({
        requestId, requestHeaders: { authorization: '[redacted]' }, responseHeaders: {},
        body: 'ok', bodyTruncated: false, bodyUnavailableReason: null
      })),
      onBrowserStateChanged: vi.fn(() => () => {})
    } as unknown as KimiAgentDesktopApi
    window.kimiAgent = api
    let bridge!: ReturnType<typeof useBrowserBridge>
    const wrapper = mount(defineComponent({
      setup() {
        bridge = useBrowserBridge()
        return () => null
      }
    }))
    await flushPromises()
    await bridge.loadNetworkDetails('request-1')
    expect(bridge.networkDetails.value).toEqual(expect.objectContaining({
      requestId: 'request-1', requestHeaders: { authorization: '[redacted]' }
    }))
    wrapper.unmount()
  })
})