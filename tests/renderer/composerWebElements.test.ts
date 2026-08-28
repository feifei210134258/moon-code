// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { BrowserPickedElement } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
  planMode: false, swarmMode: false, towerMode: false
}
const models = [{
  id: 'kimi-for-coding', providerId: 'kimi', displayName: 'Kimi for Coding',
  maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
}]

function element(overrides: Partial<BrowserPickedElement> = {}): BrowserPickedElement {
  return {
    selector: '.hero h1',
    xpath: '//h1',
    tag: 'h1',
    ariaLabel: null,
    textSnippet: 'Moon Code 预览',
    rect: { x: 24, y: 48, width: 320, height: 42 },
    pageUrl: 'preview://workspace/index.html',
    pageTitle: 'Preview',
    ...overrides
  }
}

type ComposerVm = { addWebElements: (elements: BrowserPickedElement[]) => void }

function mountComposer() {
  const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
  const addWebElements = (elements: BrowserPickedElement[]): void => {
    (wrapper.vm as unknown as ComposerVm).addWebElements(elements)
  }
  return { wrapper, addWebElements }
}

describe('ComposerBar web elements', () => {
  it('adds picked elements into an aggregate chip, deduped by selector/xpath/pageUrl', async () => {
    const { wrapper, addWebElements } = mountComposer()
    addWebElements([element(), element({ selector: '.footer a', xpath: '//a[1]', textSnippet: '链接' })])
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.composer-web-elements-chip').text()).toContain('2 个网页元素')
    expect(wrapper.find('[aria-label="2 个网页元素"]').exists()).toBe(true)

    // 同一元素重复加入不产生重复条目
    addWebElements([element(), element({ selector: '.footer a', xpath: '//a[1]', textSnippet: '链接' })])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.composer-web-elements-chip').text()).toContain('2 个网页元素')
  })

  it('opens a popup listing each element with title and tag/snippet and removes items individually', async () => {
    const { wrapper, addWebElements } = mountComposer()
    addWebElements([
      element(),
      element({ selector: '.footer a', xpath: '//a[1]', tag: 'a', textSnippet: '了解更多' })
    ])
    await wrapper.vm.$nextTick()

    await wrapper.get('.composer-web-elements-chip').trigger('click')
    const popup = wrapper.get('#composer-web-elements-popup')
    expect(popup.findAll('.composer-web-element-row')).toHaveLength(2)
    expect(popup.text()).toContain('Moon Code 预览')
    expect(popup.text()).toContain('h1 · Moon Code 预览')
    expect(popup.text()).toContain('a · 了解更多')

    await wrapper.get('[aria-label="移除元素 了解更多"]').trigger('click')
    expect(wrapper.get('#composer-web-elements-popup').findAll('.composer-web-element-row')).toHaveLength(1)
    expect(wrapper.get('.composer-web-elements-chip').text()).toContain('1 个网页元素')

    // 移除最后一个元素后弹层自动关闭
    await wrapper.get('[aria-label="移除元素 Moon Code 预览"]').trigger('click')
    expect(wrapper.find('#composer-web-elements-popup').exists()).toBe(false)
    expect(wrapper.find('.composer-web-elements-chip').exists()).toBe(false)
  })

  it('clears everything with the chip ✕ button', async () => {
    const { wrapper, addWebElements } = mountComposer()
    addWebElements([element(), element({ selector: '.footer a', xpath: '//a[1]', textSnippet: '链接' })])
    await wrapper.vm.$nextTick()

    await wrapper.get('[aria-label="移除全部网页元素"]').trigger('click')
    expect(wrapper.find('.composer-web-elements-chip').exists()).toBe(false)
  })

  it('closes the popup on outside click and Escape', async () => {
    const { wrapper, addWebElements } = mountComposer()
    addWebElements([element()])
    await wrapper.vm.$nextTick()

    await wrapper.get('.composer-web-elements-chip').trigger('click')
    expect(wrapper.find('#composer-web-elements-popup').exists()).toBe(true)

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#composer-web-elements-popup').exists()).toBe(false)

    await wrapper.get('.composer-web-elements-chip').trigger('click')
    expect(wrapper.find('#composer-web-elements-popup').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('#composer-web-elements-popup').exists()).toBe(false)
  })

  it('submits picked elements as the sixth argument and clears the chip', async () => {
    const { wrapper, addWebElements } = mountComposer()
    const picked = [element(), element({ selector: '.footer a', xpath: '//a[1]', textSnippet: '链接' })]
    addWebElements(picked)
    await wrapper.vm.$nextTick()

    await wrapper.get('textarea').setValue('看看页面结构')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['看看页面结构', [], controls, false, 'queue', picked, []]])
    expect(wrapper.find('.composer-web-elements-chip').exists()).toBe(false)
  })

  it('allows submitting without text when web elements are attached', async () => {
    const { wrapper, addWebElements } = mountComposer()
    addWebElements([element()])
    await wrapper.vm.$nextTick()

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['', [], controls, false, 'queue', [element()], []]])
  })
})