// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import BrowserPanel from '../../src/renderer/src/components/BrowserPanel.vue'

const state = {
  url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: true,
  viewport: { mode: 'auto' as const, width: null, height: null, deviceScaleFactor: 1 },
  consoleEntries: [], networkEntries: [], error: null
}

describe('BrowserPanel', () => {
  it('emits normalized Browser intents without embedding guest content', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state, pending: false, error: null, networkDetails: null,
        networkDetailsPending: false, capture: null, localServers: [], localServersPending: false
      }
    })
    await wrapper.get('.browser-address input').setValue('localhost:4173')
    await wrapper.get('.browser-address').trigger('submit')
    expect(wrapper.emitted('navigate')).toEqual([['localhost:4173']])

    await wrapper.get('[aria-label="视口尺寸"]').setValue('mobile')
    expect(wrapper.emitted('viewport')).toEqual([[
      { mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 }
    ]])
    expect(wrapper.find('webview').exists()).toBe(false)
  })

  it('shows captured output only in the bounded diagnostics area', () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state, pending: false, error: null, networkDetails: null, networkDetailsPending: false,
        capture: { dataUrl: 'data:image/png;base64,AA==', width: 390, height: 844, fullPage: false },
        localServers: [], localServersPending: false
      }
    })
    expect(wrapper.get('.browser-capture-preview img').attributes('src')).toBe('data:image/png;base64,AA==')
    expect(wrapper.get('.browser-capture-preview').text()).toContain('390 × 844')
  })

  it('previews editable annotations and emits only the reviewed submission options', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' },
        pending: false,
        error: null,
        networkDetails: null,
        networkDetailsPending: false,
        capture: null,
        localServers: [],
        localServersPending: false,
        annotationDrafts: [{
          id: 'draft-1',
          annotation: {
            schemaVersion: 1,
            page: {
              url: 'preview://workspace/index.html',
              title: 'Preview',
              viewport: { width: 800, height: 600, dpr: 2 }
            },
            target: {
              kind: 'element',
              tag: 'button',
              selector: 'button[aria-label="Save"]',
              textSnippet: '保存',
              rect: { x: 10, y: 20, width: 96, height: 36 }
            },
            comment: '',
            capturedAt: '2026-07-23T00:00:00.000Z'
          },
          screenshot: {
            dataUrl: 'data:image/png;base64,AA==', width: 208, height: 88, fullPage: false
          }
        }],
        annotationPicking: false,
        annotationSubmitting: false,
        annotationError: null
      }
    })
    expect(wrapper.get('.browser-annotation-card img').attributes('src')).toBe('data:image/png;base64,AA==')
    await wrapper.get('.browser-annotation-card textarea').setValue('把按钮间距加大')
    await wrapper.get('.browser-annotation-card .is-primary').trigger('click')
    expect(wrapper.emitted('submitAnnotation')).toEqual([[
      {
        draftId: 'draft-1',
        comment: '把按钮间距加大',
        pageUrl: 'preview://workspace/index.html',
        includeSelector: true,
        includeText: true,
        includeScreenshot: true
      }
    ]])
  })
})
