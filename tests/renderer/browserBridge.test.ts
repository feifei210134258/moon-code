// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useBrowserBridge } from '../../src/renderer/src/composables/useBrowserBridge.js'
import type { BrowserViewState, KimiAgentDesktopApi, KimiPromptControls } from '../../src/shared/contracts.js'

const controls: KimiPromptControls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: false, swarmMode: false
}

const state: BrowserViewState = {
  url: 'http://localhost:4173/', title: 'Preview', loading: false,
  canGoBack: false, canGoForward: false, visible: true,
  viewport: { mode: 'auto', width: null, height: null, deviceScaleFactor: 1 },
  consoleEntries: [], networkEntries: [], error: null
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
      setBrowserOverlay: vi.fn(async () => undefined),
      discoverBrowserLocalServers: vi.fn(async () => ['http://localhost:5173/']),
      pickBrowserAnnotation: vi.fn(async () => ({
        id: 'draft-1',
        annotation: {
          schemaVersion: 1 as const,
          page: { url: state.url, title: state.title, viewport: { width: 800, height: 600, dpr: 1 } },
          target: { kind: 'region' as const, rect: { x: 10, y: 10, width: 80, height: 40 } },
          comment: '',
          capturedAt: '2026-07-23T00:00:00.000Z'
        },
        screenshot: { dataUrl: 'data:image/png;base64,AA==', width: 96, height: 56, fullPage: false }
      })),
      submitBrowserAnnotation: vi.fn(async () => ({
        promptId: 'prompt-1', userMessageId: 'message-1', status: 'running' as const
      })),
      deleteBrowserAnnotation: vi.fn(async () => undefined),
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
    await bridge.setOverlay(true)
    expect(api.setBrowserOverlay).toHaveBeenCalledWith(true)
    await bridge.setVisible(true)
    await flushPromises()
    expect(api.discoverBrowserLocalServers).toHaveBeenCalledOnce()
    expect(bridge.localServers.value).toEqual(['http://localhost:5173/'])

    await bridge.pickAnnotation('region')
    expect(api.pickBrowserAnnotation).toHaveBeenCalledWith('region')
    expect(bridge.annotationDrafts.value).toHaveLength(1)
    await bridge.submitAnnotation('session-1', {
      draftId: 'draft-1', comment: '调整这个区域', pageUrl: state.url,
      includeSelector: false, includeText: false, includeScreenshot: true
    }, controls)
    expect(api.submitBrowserAnnotation).toHaveBeenCalledWith('session-1', expect.objectContaining({
      draftId: 'draft-1', comment: '调整这个区域'
    }), controls)
    expect(bridge.annotationDrafts.value).toEqual([])

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
