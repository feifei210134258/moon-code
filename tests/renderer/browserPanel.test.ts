// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import BrowserPanel from '../../src/renderer/src/components/BrowserPanel.vue'

const state = {
  url: '', title: '', loading: false, canGoBack: false, canGoForward: false, visible: true,
  viewport: { mode: 'auto' as const, width: null, height: null, deviceScaleFactor: 1 },
  consoleEntries: [], networkEntries: [], error: null
}

describe('BrowserPanel', () => {
  it('keeps only viewport, screenshot, and annotation controls without embedding guest content', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' }, pending: false, error: null, capture: null
      }
    })

    await wrapper.get('[aria-label="视口尺寸"]').setValue('mobile')
    expect(wrapper.emitted('viewport')).toEqual([[
      { mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 }
    ]])
    await wrapper.get('[aria-label="窗口截图"]').trigger('click')
    await wrapper.get('[aria-label="框选区域"]').trigger('click')
    expect(wrapper.emitted('capturePage')).toEqual([[false]])
    expect(wrapper.emitted('pickAnnotation')).toEqual([['region']])
    expect(wrapper.find('.browser-diagnostics').exists()).toBe(false)
    expect(wrapper.find('webview').exists()).toBe(false)
  })

  it('shows a screenshot as a compact overlay', () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state, pending: false, error: null,
        capture: { dataUrl: 'data:image/png;base64,AA==', width: 390, height: 844, fullPage: false }
      }
    })
    expect(wrapper.get('.browser-capture-popover img').attributes('src')).toBe('data:image/png;base64,AA==')
    expect(wrapper.get('.browser-capture-popover').text()).toContain('390 × 844')
  })

  it('closes browser overlays with Escape', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state, pending: false, error: null,
        capture: { dataUrl: 'data:image/png;base64,AA==', width: 390, height: 844, fullPage: false }
      }
    })
    expect(wrapper.find('.browser-capture-popover').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.find('.browser-capture-popover').exists()).toBe(false)
  })

  it('previews editable annotations and emits only the reviewed submission options', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' },
        pending: false,
        error: null,
        capture: null,
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
    const host = wrapper.get('.browser-guest-host').element
    Object.defineProperty(host, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 800, height: 600 })
    })
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(wrapper.get('.browser-annotation-popover').text()).toContain('元素批注')
    expect(wrapper.get('.browser-guest-host').classes()).not.toContain('has-overlay')
    expect(wrapper.get('.browser-annotation-popover').attributes('style')).toContain('top:')
    await wrapper.get('.browser-annotation-popover textarea').setValue('把按钮间距加大')
    await wrapper.get('.browser-annotation-popover .is-primary').trigger('click')
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
