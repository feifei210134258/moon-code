// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual' as const,
  planMode: false, swarmMode: false, towerMode: false
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
  it('submits a selected Kimi Skill as a structured skills entry with its arguments', async () => {
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
    const token = wrapper.get('.composer-skill-token')
    expect(token.text()).toContain('Review')
    expect(token.find('svg').exists()).toBe(true)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.get('textarea').attributes('placeholder')).toContain('技能参数')
    await wrapper.get('textarea').setValue('--fix src')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toEqual([[
      '/review --fix src', [], controls, false, 'queue', [], [{ name: 'review', args: '--fix src' }]
    ]])
    expect(wrapper.emitted('activateSkill')).toBeUndefined()
  })

  it('submits a selected skill without arguments and removes its token by click or Backspace', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [{
          name: 'product-design', description: 'Product design workflow', source: 'project',
          type: null, userInvocableOnly: false
        }]
      }
    })

    await wrapper.get('.slash-button').trigger('click')
    await wrapper.get('.command-popover button').trigger('click')
    expect(wrapper.get('.composer-skill-token').text()).toContain('Product Design')
    expect(wrapper.get('.send-button:last-child').attributes('disabled')).toBeUndefined()
    await wrapper.get('.composer-skill-token').trigger('click')
    expect(wrapper.find('.composer-skill-token').exists()).toBe(false)

    await wrapper.get('textarea').setValue('/')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('.composer-skill-token').exists()).toBe(true)
    await wrapper.get('textarea').trigger('keydown', { key: 'Backspace' })
    expect(wrapper.find('.composer-skill-token').exists()).toBe(false)

    await wrapper.get('textarea').setValue('/')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/product-design', [], controls, false, 'queue', [], [{ name: 'product-design' }]
    ]])
  })

  it('supports activating multiple skills in one prompt via space + slash', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review current changes', source: 'project', type: null, userInvocableOnly: false },
          { name: 'pdf', description: 'Generate a PDF', source: 'builtin', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/rev')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('.composer-skill-token')).toHaveLength(1)

    /* 空格后输入 / 追加下一个 skill token */
    await wrapper.get('textarea').setValue('--fix src /')
    expect(wrapper.get('.command-popover').text()).toContain('/pdf')
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('.composer-skill-token')).toHaveLength(2)

    await wrapper.get('textarea').setValue('生成PDF')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toEqual([[
      '/review --fix src /pdf 生成PDF', [], controls, false, 'queue', [], [
        { name: 'review', args: '--fix src' },
        { name: 'pdf', args: '生成PDF' }
      ]
    ]])
  })

  it('does not treat a path-like tail as a slash command once skills are selected', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('.slash-button').trigger('click')
    await wrapper.get('.command-popover button').trigger('click')
    await wrapper.get('textarea').setValue('--fix /Users/feili')
    expect(wrapper.find('.command-popover').exists()).toBe(false)
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/review --fix /Users/feili', [], controls, false, 'queue', [], [
        { name: 'review', args: '--fix /Users/feili' }
      ]
    ]])
  })

  it('keeps unknown slash text as a normal Kimi prompt', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    await wrapper.get('textarea').setValue('/unknown continue')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['/unknown continue', [], controls, false, 'queue', [], []]])
  })

  it('restores multi-skill drafts into their own tokens', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false },
          { name: 'pdf', description: 'PDF', source: 'builtin', type: null, userInvocableOnly: false }
        ]
      }
    })
    await wrapper.vm.loadDraft('/review a /pdf b')
    expect(wrapper.findAll('.composer-skill-token')).toHaveLength(2)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('b')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/review a /pdf b', [], controls, false, 'queue', [], [
        { name: 'review', args: 'a' },
        { name: 'pdf', args: 'b' }
      ]
    ]])
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

  it('leaves height to CSS field-sizing (no inline style, no drag handle) and closes composer popovers with Escape', async () => {
    const wrapper = mount(ComposerBar, {
      props: { models, controls, skills: [{ name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false }] }
    })
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    await wrapper.get('textarea').setValue('/rev')
    await wrapper.vm.$nextTick()
    expect(textarea.style.height).toBe('')
    expect(wrapper.find('.composer-resize-handle').exists()).toBe(false)
    expect(wrapper.find('.command-popover').exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.command-popover').exists()).toBe(false)
  })

  it('keeps Stop available and lets follow-ups choose between queue and steer', async () => {
    const wrapper = mount(ComposerBar, {
      props: { skills: [], models, controls, running: true }
    })

    expect(wrapper.get('textarea').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.delivery-trigger').text()).toContain('排队')
    await wrapper.get('textarea').setValue('继续检查测试')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['继续检查测试', [], controls, false, 'queue', [], []]])

    await wrapper.get('.delivery-trigger').trigger('click')
    expect(wrapper.get('.delivery-popover').text()).toContain('引导当前任务')
    expect(wrapper.get('.delivery-popover').text()).toContain('当前任务完成后再发送')
    await wrapper.findAll('.delivery-popover button')[0]!.trigger('click')
    expect(wrapper.get('.delivery-trigger').text()).toContain('引导')
    await wrapper.get('textarea').setValue('先不要收尾，补充检查边界情况')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([
      ['继续检查测试', [], controls, false, 'queue', [], []],
      ['先不要收尾，补充检查边界情况', [], controls, false, 'steer', [], []]
    ])
    await wrapper.get('.stop-button').trigger('click')
    expect(wrapper.emitted('abort')).toEqual([[]])
  })

  it('keeps model controls primary and moves execution controls into the advanced popover', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    await wrapper.get('.model-summary').trigger('click')
    const popover = wrapper.get('#composer-session-controls')
    expect(popover.text()).toContain('Kimi for Coding')
    expect(popover.text()).toContain('模型')
    expect(popover.text()).toContain('思考强度')
    expect(popover.text()).toContain('中途切换影响效果')
    expect(popover.text()).not.toContain('高级执行')
    expect(popover.text()).not.toContain('执行审批')
    expect(popover.get('[aria-label="思考强度"]').attributes('role')).toBe('radiogroup')

    await wrapper.get('.advanced-trigger').trigger('click')
    expect(wrapper.find('#composer-session-controls').exists()).toBe(false)
    const advanced = wrapper.get('#composer-advanced-controls')
    expect(advanced.text()).toContain('高级执行')
    expect(advanced.text()).toContain('执行审批')
    expect(advanced.get('[aria-label="执行审批"]').attributes('role')).toBe('radiogroup')
    expect(advanced.text()).toContain('规划模式')
    expect(advanced.text()).toContain('目标模式')
    expect(advanced.text()).toContain('协作模式')
    const toggles = advanced.findAll('.composer-toggle-row')
    expect(toggles[0]!.attributes('role')).toBe('switch')
    await toggles[0]!.trigger('click')
    await toggles[2]!.trigger('click')
    expect(wrapper.emitted('updateControls')).toEqual([
      [{ ...controls, planMode: true }],
      [{ ...controls, swarmMode: true, towerMode: false }]
    ])
    await toggles[1]!.trigger('click')
    expect(wrapper.emitted('updateGoalMode')).toEqual([[true]])
  })

  it('never presents the Runtime wire value off as a user-facing thinking option', async () => {
    const wrapper = mount(ComposerBar, {
      props: { skills: [], models, controls: { ...controls, thinking: 'off' } }
    })

    expect(wrapper.get('.model-summary').text()).not.toContain('关闭')
    expect(wrapper.get('.model-summary').text()).not.toContain('off')
    await wrapper.get('.model-summary').trigger('click')
    const options = wrapper.findAll('[aria-label="思考强度"] button')
    expect(options.map((option) => option.text())).toEqual(['高'])
    wrapper.unmount()
  })

  it('shows active Plan, Goal, and Swarm modes before the model and closes each from its chip', async () => {
    const activeControls = { ...controls, planMode: true, swarmMode: true, towerMode: false }
    const wrapper = mount(ComposerBar, {
      props: { skills: [], models, controls: activeControls, goalMode: true }
    })

    const settings = wrapper.get('.composer-settings')
    const chips = settings.get('.composer-mode-chips')
    expect(chips.text()).toContain('规划')
    expect(chips.text()).toContain('目标')
    expect(chips.text()).toContain('协作')
    expect(settings.element.firstElementChild).toBe(chips.element)
    expect(chips.element.nextElementSibling?.classList).toContain('advanced-trigger')
    expect(chips.element.nextElementSibling?.nextElementSibling?.classList).toContain('model-summary')

    await wrapper.get('[aria-label="关闭规划模式"]').trigger('click')
    await wrapper.get('[aria-label="关闭目标模式"]').trigger('click')
    await wrapper.get('[aria-label="关闭 Swarm 模式"]').trigger('click')
    expect(wrapper.emitted('updateControls')).toEqual([
      [{ ...activeControls, planMode: false }],
      [{ ...activeControls, swarmMode: false, towerMode: false }]
    ])
    expect(wrapper.emitted('updateGoalMode')).toEqual([[false]])
  })

  it('requires an explicit confirmation before enabling fully automatic approval', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    await wrapper.get('.advanced-trigger').trigger('click')
    await wrapper.get('.composer-permission-row .composer-segments button:last-child').trigger('click')

    expect(wrapper.emitted('updateControls')).toBeUndefined()
    expect(wrapper.get('.composer-permission-warning').text()).toContain('跳过逐次审批')
    await wrapper.get('.composer-permission-warning .is-danger').trigger('click')
    expect(wrapper.emitted('updateControls')).toEqual([[{ ...controls, permissionMode: 'yolo' }]])
  })

  it('supports listbox selection for slash commands and closes popovers outside the composer', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models,
        controls,
        skills: [
          { name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false },
          { name: 'release', description: 'Release', source: 'builtin', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/')
    expect(wrapper.get('textarea').attributes('aria-controls')).toBe('composer-command-listbox')
    expect(wrapper.get('textarea').attributes('aria-activedescendant')).toBe('composer-command-option-0')
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('textarea').attributes('aria-activedescendant')).toBe('composer-command-option-1')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('.composer-skill-token').text()).toContain('Release')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')

    await wrapper.get('.model-summary').trigger('click')
    expect(wrapper.find('.composer-popover').exists()).toBe(true)
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.composer-popover').exists()).toBe(false)
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
    expect(wrapper.emitted('submit')).toEqual([['看看这里', [attachment], controls, false, 'queue', [], []]])
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
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('docs/adr ')

    await wrapper.get('textarea').setValue('docs/adr 检查')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['docs/adr 检查', [], controls, false, 'queue', [], []]])
  })

  it('distinguishes mention-search failure from no results and supports retry', async () => {
    vi.useFakeTimers()
    const mentionSearch = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ path: 'src/App.vue', name: 'App.vue', kind: 'file' as const, score: 1, matchPositions: [] }])
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls, mentionSearch } })

    await wrapper.get('[aria-label="引用文件"]').trigger('click')
    await vi.advanceTimersByTimeAsync(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.command-empty.is-error').text()).toContain('无法读取项目文件')

    await wrapper.get('.command-empty.is-error button').trigger('click')
    await vi.advanceTimersByTimeAsync(200)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.mention-item')).toHaveLength(1)
  })

  it('fuzzy-matches slash commands by pinyin initials and highlights the matched span', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models,
        controls,
        skills: [
          { name: 'cancel', description: '取消当前的执行任务', source: 'builtin', type: null, userInvocableOnly: false },
          { name: 'review', description: 'Review 当前的变更', source: 'project', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/qx')
    const options = wrapper.findAll('.command-popover button')
    expect(options.map((option) => option.text())).toEqual(['/cancel取消当前的执行任务内置'])
    const highlights = options[0]!.findAll('mark.slash-match')
    expect(highlights.map((mark) => mark.text()).join('')).toBe('取消')
  })

  it('matches slash commands by full pinyin and Chinese text', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models,
        controls,
        skills: [
          { name: 'cancel', description: '取消当前的执行任务', source: 'builtin', type: null, userInvocableOnly: false },
          { name: 'export', description: '导出为压缩包', source: 'builtin', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/quxiao')
    expect(wrapper.get('.command-popover button').text()).toContain('/cancel')
    await wrapper.get('textarea').setValue('/导出')
    expect(wrapper.get('.command-popover button').text()).toContain('/export')
  })

  it('highlights the matched English fragment in the command name', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models,
        controls,
        skills: [{ name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false }]
      }
    })

    await wrapper.get('textarea').setValue('/rev')
    expect(wrapper.get('.command-popover mark.slash-match').text()).toBe('rev')
  })
})
