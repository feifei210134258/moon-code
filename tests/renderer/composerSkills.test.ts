// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
  planMode: false, swarmMode: false
}
const models = [{
  id: 'kimi-for-coding', providerId: 'kimi', displayName: 'Kimi for Coding',
  maxContextSize: 262_144, capabilities: ['thinking'], supportEfforts: ['off', 'high'], defaultEffort: 'high'
}]

afterEach(() => {
  vi.useRealTimers()
  delete window.kimiAgent
})

describe('ComposerBar Skills menu', () => {
  it('inserts a Kimi Skill command and activates it with arguments on submit', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [{
          name: 'review', description: 'Review current changes', source: 'project',
          type: null, userInvocableOnly: false
        }]
      }
    })

    await wrapper.get('.slash-button').trigger('click')
    expect(wrapper.get('.command-popover').text()).toContain('/review')
    await wrapper.get('.command-popover button').trigger('click')
    await wrapper.get('textarea').setValue('/review --fix src')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('activateSkill')).toEqual([['review', '--fix src']])
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('keeps unknown slash text as a normal Kimi prompt', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    await wrapper.get('textarea').setValue('/unknown continue')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['/unknown continue', [], controls, false]])
  })

  it('filters slash commands as the user types and shows a Chinese empty state', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models,
        controls,
        skills: [
          { name: 'review', description: 'Review current changes', source: 'project', type: null, userInvocableOnly: false },
          { name: 'release', description: 'Prepare a release', source: 'builtin', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/rev')
    expect(wrapper.get('.command-popover').text()).toContain('/review')
    expect(wrapper.get('.command-popover').text()).not.toContain('/release')

    await wrapper.get('textarea').setValue('/missing')
    expect(wrapper.get('.command-popover').text()).toContain('没有匹配的技能')
  })

  it('keeps Stop available and allows a follow-up to enter the Kimi prompt queue', async () => {
    const wrapper = mount(ComposerBar, {
      props: { skills: [], models, controls, running: true }
    })

    expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined()
    await wrapper.get('textarea').setValue('继续检查测试')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['继续检查测试', [], controls, false]])
    await wrapper.get('.stop-button').trigger('click')
    expect(wrapper.emitted('abort')).toEqual([[]])
  })

  it('uses the real model catalog and exposes independent Plan and Swarm controls', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    await wrapper.get('.model-summary').trigger('click')
    const popover = wrapper.get('.composer-popover')
    expect(popover.text()).toContain('Kimi for Coding')
    expect(popover.text()).toContain('模型')
    expect(popover.text()).toContain('思考强度')
    expect(popover.text()).toContain('权限模式')
    expect(popover.text()).toContain('规划模式')
    expect(popover.text()).toContain('目标模式')
    expect(popover.text()).toContain('协作模式')
    const toggles = wrapper.findAll('.composer-toggle-row input')
    await toggles[0]!.setValue(true)
    await toggles[2]!.setValue(true)
    expect(wrapper.emitted('updateControls')).toEqual([
      [{ ...controls, planMode: true }],
      [{ ...controls, swarmMode: true }]
    ])
    await toggles[1]!.setValue(true)
    expect(wrapper.emitted('updateGoalMode')).toEqual([[true]])
  })

  it('uploads through Kimi, shows removable chips, and submits attachment descriptors', async () => {
    const attachment = { fileId: 'file-1', name: 'design.png', mediaType: 'image/png', size: 2048 }
    window.kimiAgent = {
      pickAttachments: vi.fn(async () => ({ cancelled: false, files: [attachment] })),
      discardAttachment: vi.fn(async () => {})
    } as unknown as KimiAgentDesktopApi
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })

    await wrapper.get('[aria-label="添加附件"]').trigger('click')
    await Promise.resolve()
    expect(wrapper.get('.composer-attachment-chip').text()).toContain('design.png')
    await wrapper.get('textarea').setValue('看看这里')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['看看这里', [attachment], controls, false]])
  })

  it('matches Kimi Web file mentions with debounced search, keyboard selection, and path insertion', async () => {
    vi.useFakeTimers()
    const mentionSearch = vi.fn(async () => [
      { path: 'src/App.vue', name: 'App.vue', kind: 'file' as const, score: 1, matchPositions: [] },
      { path: 'docs/adr', name: 'adr', kind: 'directory' as const, score: 0.8, matchPositions: [] }
    ])
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls, mentionSearch } })

    await wrapper.get('[aria-label="引用文件"]').trigger('click')
    await vi.advanceTimersByTimeAsync(200)
    await wrapper.vm.$nextTick()
    expect(mentionSearch).toHaveBeenCalledWith('')
    expect(wrapper.findAll('.mention-item')).toHaveLength(2)

    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await wrapper.vm.$nextTick()
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('docs/adr')

    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['docs/adr', [], controls, false]])
  })
})
