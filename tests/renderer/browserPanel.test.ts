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
  it('keeps only viewport, reload, element picking, and external-open controls without embedding guest content', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' }, pending: false, error: null
      }
    })

    await wrapper.get('[aria-label="视口尺寸"]').setValue('mobile')
    expect(wrapper.emitted('viewport')).toEqual([[
      { mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 }
    ]])
    await wrapper.get('[aria-label="选择网页元素"]').trigger('click')
    expect(wrapper.find('[aria-label="刷新页面"]').exists()).toBe(true)
    const external = wrapper.get('[aria-label="在默认浏览器中打开"]')
    expect(external.classes()).toContain('browser-open-external')
    expect(external.find('span').text()).toBe('在默认浏览器中打开')
    await external.trigger('click')
    expect(wrapper.emitted('pickElements')).toEqual([[]])
    expect(wrapper.emitted('openExternal')).toEqual([[]])
    expect(wrapper.find('.browser-diagnostics').exists()).toBe(false)
    expect(wrapper.find('webview').exists()).toBe(false)
  })

  it('reloads via an icon-only toolbar button that disables while empty or pending', async () => {
    const wrapper = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' }, pending: false, error: null
      }
    })
    const reload = wrapper.get('[aria-label="刷新页面"]')
    expect(reload.attributes('disabled')).toBeUndefined()
    expect(reload.find('span').exists()).toBe(false)
    await reload.trigger('click')
    expect(wrapper.emitted('reload')).toEqual([[]])

    const empty = mount(BrowserPanel, { props: { state, pending: false, error: null } })
    expect(empty.get('[aria-label="刷新页面"]').attributes('disabled')).toBeDefined()

    const busy = mount(BrowserPanel, {
      props: { state: { ...state, url: 'preview://workspace/index.html' }, pending: true, error: null }
    })
    expect(busy.get('[aria-label="刷新页面"]').attributes('disabled')).toBeDefined()
  })

  it('toggles the pick session: starts it while idle and stops it while picking', async () => {
    const idle = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' }, pending: false, error: null
      }
    })
    const pick = idle.get('[aria-label="选择网页元素"]')
    expect(pick.attributes('disabled')).toBeUndefined()
    expect(pick.text()).not.toContain('选择中…')
    await pick.trigger('click')
    expect(idle.emitted('pickElements')).toEqual([[]])
    expect(idle.emitted('stopPicking')).toBeUndefined()
    idle.unmount()

    const active = mount(BrowserPanel, {
      props: {
        state: { ...state, url: 'preview://workspace/index.html' }, pending: false, error: null,
        elementPicking: true
      }
    })
    const activePick = active.get('[aria-label="选择网页元素"]')
    expect(activePick.attributes('disabled')).toBeUndefined()
    expect(activePick.text()).toContain('选择中…')
    await activePick.trigger('click')
    expect(active.emitted('stopPicking')).toEqual([[]])
    expect(active.emitted('pickElements')).toBeUndefined()
  })

  it('disables element picking and external open while empty or pending', async () => {
    const empty = mount(BrowserPanel, { props: { state, pending: false, error: null } })
    expect(empty.get('[aria-label="选择网页元素"]').attributes('disabled')).toBeDefined()
    expect(empty.get('[aria-label="在默认浏览器中打开"]').attributes('disabled')).toBeDefined()

    const busy = mount(BrowserPanel, {
      props: { state: { ...state, url: 'preview://workspace/index.html' }, pending: true, error: null }
    })
    expect(busy.get('[aria-label="在默认浏览器中打开"]').attributes('disabled')).toBeDefined()
    expect(busy.get('[aria-label="选择网页元素"]').attributes('disabled')).toBeUndefined()
  })
})