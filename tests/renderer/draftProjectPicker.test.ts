// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DraftProjectPicker from '../../src/renderer/src/components/DraftProjectPicker.vue'

const projects = [
  { id: 'workspace-a', name: 'Kimi Agent', expanded: true, sessions: [] },
  { id: 'workspace-b', name: 'Website', expanded: false, sessions: [] },
  { id: 'workspace-c', name: '学生评价', expanded: false, sessions: [] }
]

function mountPicker(workspaceId = 'workspace-a') {
  return mount(DraftProjectPicker, {
    attachTo: document.body,
    props: { projects, workspaceId }
  })
}

describe('DraftProjectPicker', () => {
  it('shows the active draft project name on the chip', () => {
    const wrapper = mountPicker()
    expect(wrapper.get('.draft-project-chip').text()).toContain('Kimi Agent')
    wrapper.unmount()
  })

  it('falls back to the placeholder when no project is selected', () => {
    const wrapper = mountPicker('')
    expect(wrapper.get('.draft-project-chip').text()).toContain('选择项目')
    wrapper.unmount()

    const stale = mountPicker('workspace-missing')
    expect(stale.get('.draft-project-chip').text()).toContain('选择项目')
    stale.unmount()
  })

  it('opens the dropdown and filters projects by the search query', async () => {
    const wrapper = mountPicker()
    expect(wrapper.find('.draft-project-menu').exists()).toBe(false)

    await wrapper.get('.draft-project-chip').trigger('click')
    expect(wrapper.findAll('.draft-project-option')).toHaveLength(3)

    await wrapper.get('.draft-project-search input').setValue('web')
    const options = wrapper.findAll('.draft-project-option')
    expect(options).toHaveLength(1)
    expect(options[0]?.text()).toContain('Website')
    wrapper.unmount()
  })

  it('shows an empty hint when no workspace matches the query', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.draft-project-chip').trigger('click')
    await wrapper.get('.draft-project-search input').setValue('不存在的项目')

    expect(wrapper.find('.draft-project-option').exists()).toBe(false)
    expect(wrapper.get('.draft-project-empty').text()).toBe('没有匹配的工作区')
    wrapper.unmount()
  })

  it('emits the selected workspace and closes the dropdown', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.draft-project-chip').trigger('click')
    const target = wrapper.findAll('.draft-project-option')[1]
    expect(target).toBeDefined()
    await target!.trigger('click')

    expect(wrapper.emitted('select')).toEqual([['workspace-b']])
    expect(wrapper.find('.draft-project-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('emits openFolder from the footer row and closes the dropdown', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.draft-project-chip').trigger('click')
    await wrapper.get('.draft-project-open').trigger('click')

    expect(wrapper.emitted('openFolder')).toEqual([[]])
    expect(wrapper.find('.draft-project-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes the dropdown on Escape and on outside pointer down', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.draft-project-chip').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.draft-project-menu').exists()).toBe(false)

    await wrapper.get('.draft-project-chip').trigger('click')
    expect(wrapper.find('.draft-project-menu').exists()).toBe(true)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.draft-project-menu').exists()).toBe(false)
    wrapper.unmount()
  })
})
