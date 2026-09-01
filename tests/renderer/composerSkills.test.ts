// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'
import ComposerBar from '../../src/renderer/src/components/ComposerBar.vue'
import { findInlineSkillTokens, parseInlineSkillTokens } from '../../src/renderer/src/utils/inlineSkills.js'

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

describe('inlineSkills parsing', () => {
  const catalog = [{ name: 'review' }, { name: 'pdf' }]

  it('parses interspersed tokens with args running up to the next token', () => {
    expect(parseInlineSkillTokens('前文 /review --fix 中段 /pdf 尾', catalog)).toEqual([
      { name: 'review', args: '--fix 中段' },
      { name: 'pdf', args: '尾' }
    ])
  })

  it('matches skill names case-insensitively and submits the canonical name', () => {
    expect(parseInlineSkillTokens('/Review 看看', catalog)).toEqual([{ name: 'review', args: '看看' }])
  })

  it('omits args when the token has no trailing text', () => {
    expect(parseInlineSkillTokens('/pdf', catalog)).toEqual([{ name: 'pdf' }])
  })

  it('ignores unknown slash words and path-like text', () => {
    expect(parseInlineSkillTokens('/missing 和 /Users/feili 都是普通文本', catalog)).toEqual([])
  })

  it('finds tokens only at line starts or after whitespace', () => {
    expect(findInlineSkillTokens('看/review 这里', catalog)).toEqual([])
    const tokens = findInlineSkillTokens('换行\n/review', catalog)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.raw).toBe('/review')
  })
})

describe('ComposerBar Skills menu', () => {
  it('inserts a chosen skill as an inline token and submits the raw input text', async () => {
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
    /* 内联模型：选中技能 = 在光标处插入 `/规范名 `，不再有顶部 chip 行 */
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/review ')
    expect(wrapper.find('.composer-skill-token').exists()).toBe(false)
    expect(wrapper.get('.composer-mirror .composer-skill-inline').text()).toBe('/review')

    await wrapper.get('textarea').setValue('/review --fix src')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toEqual([[
      '/review --fix src', [], controls, false, 'queue', [], [{ name: 'review', args: '--fix src' }]
    ]])
    expect(wrapper.emitted('activateSkill')).toBeUndefined()
  })

  it('submits a chosen skill without arguments', async () => {
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
    expect(wrapper.get('.composer-mirror .composer-skill-inline').text()).toBe('/product-design')
    expect(wrapper.get('.send-button:last-child').attributes('disabled')).toBeUndefined()
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/product-design', [], controls, false, 'queue', [], [{ name: 'product-design' }]
    ]])
  })

  it('opens the skill menu for a / typed mid-text after a space', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review current changes', source: 'project', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('检查 /rev')
    expect(wrapper.get('.command-popover').text()).toContain('/review')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('检查 /review ')

    await wrapper.get('textarea').setValue('检查 /review 边界')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '检查 /review 边界', [], controls, false, 'queue', [], [{ name: 'review', args: '边界' }]
    ]])
  })

  it('supports multiple skills interspersed in one prompt via space + slash', async () => {
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
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/review ')

    /* 空格后输入 / 触发下一个 skill 的选择面板 */
    await wrapper.get('textarea').setValue('/review --fix src /')
    expect(wrapper.get('.command-popover').text()).toContain('/pdf')
    await wrapper.get('textarea').trigger('keydown', { key: 'ArrowDown' })
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/review --fix src /pdf ')
    expect(
      wrapper.findAll('.composer-mirror .composer-skill-inline').map((node) => node.text())
    ).toEqual(['/review', '/pdf'])

    await wrapper.get('textarea').setValue('/review --fix src /pdf 生成PDF')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('submit')).toEqual([[
      '/review --fix src /pdf 生成PDF', [], controls, false, 'queue', [], [
        { name: 'review', args: '--fix src' },
        { name: 'pdf', args: '生成PDF' }
      ]
    ]])
  })

  it('does not treat a path-like tail as a slash command', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/review --fix /Users/feili')
    expect(wrapper.find('.command-popover').exists()).toBe(false)
    /* 路径段不是 token，只有 /review 高亮 */
    expect(wrapper.findAll('.composer-mirror .composer-skill-inline')).toHaveLength(1)
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
    expect(wrapper.find('.composer-skill-inline').exists()).toBe(false)
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([['/unknown continue', [], controls, false, 'queue', [], []]])
  })

  it('treats a manually typed skill name the same as a palette choice', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [
          { name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false }
        ]
      }
    })

    await wrapper.get('textarea').setValue('/review 手动参数')
    /* 尾部没有 / 触发词元，面板保持关闭 */
    expect(wrapper.find('.command-popover').exists()).toBe(false)
    expect(wrapper.get('.composer-mirror .composer-skill-inline').text()).toBe('/review')
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/review 手动参数', [], controls, false, 'queue', [], [{ name: 'review', args: '手动参数' }]
    ]])
  })

  it('restores multi-skill drafts as inline tokens', async () => {
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
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/review a /pdf b')
    expect(
      wrapper.findAll('.composer-mirror .composer-skill-inline').map((node) => node.text())
    ).toEqual(['/review', '/pdf'])
    await wrapper.get('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('submit')).toEqual([[
      '/review a /pdf b', [], controls, false, 'queue', [], [
        { name: 'review', args: 'a' },
        { name: 'pdf', args: 'b' }
      ]
    ]])
  })

  it('treats skill tokens as plain text: no chip row and no caret-0 Backspace shortcut', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [{
          name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false
        }]
      }
    })

    await wrapper.get('.slash-button').trigger('click')
    await wrapper.get('.command-popover button').trigger('click')
    const textarea = wrapper.get('textarea')
    ;(textarea.element as HTMLTextAreaElement).setSelectionRange(0, 0)
    await textarea.trigger('keydown', { key: 'Backspace' })
    /* caret-0 Backspace 不再有特殊删除：token 文本与高亮都原样保留 */
    expect((textarea.element as HTMLTextAreaElement).value).toBe('/review ')
    expect(wrapper.get('.composer-mirror .composer-skill-inline').text()).toBe('/review')

    /* 普通文本删除即移除高亮 */
    await textarea.setValue('')
    expect(wrapper.find('.composer-skill-inline').exists()).toBe(false)
  })

  it('does not open the menu or select a skill during IME composition', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [{
          name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false
        }]
      }
    })
    const textarea = wrapper.get('textarea')

    await textarea.trigger('compositionstart')
    expect(wrapper.get('.composer-input-area').classes()).toContain('is-composing')
    /* 组合中的 input（v-model 被 Vue 按住 + isComposing 守卫）不触发面板。
       注意不能用 setValue：它会补发 change 事件，被 Vue 当作 compositionend。 */
    ;(textarea.element as HTMLTextAreaElement).value = '/rev'
    await textarea.trigger('input', { isComposing: true })
    expect(wrapper.find('.command-popover').exists()).toBe(false)
    await textarea.trigger('compositionend')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.composer-input-area').classes()).not.toContain('is-composing')
    expect(wrapper.find('.command-popover').exists()).toBe(true)

    /* 组合中的 Enter 不误选技能、不提交 */
    await textarea.trigger('keydown', { key: 'Enter', isComposing: true })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('/rev')
    expect(wrapper.find('.command-popover').exists()).toBe(true)
    expect(wrapper.emitted('submit')).toBeUndefined()

    await textarea.trigger('keydown', { key: 'Enter' })
    expect((textarea.element as HTMLTextAreaElement).value).toBe('/review ')
  })

  it('renders the mirror escaped and pads a trailing newline for alignment', async () => {
    const wrapper = mount(ComposerBar, {
      props: {
        models, controls,
        skills: [{
          name: 'review', description: 'Review', source: 'project', type: null, userInvocableOnly: false
        }]
      }
    })

    await wrapper.get('textarea').setValue('a <b>bold</b> /review 尾部')
    const mirror = wrapper.get('.composer-mirror')
    expect(mirror.attributes('aria-hidden')).toBe('true')
    expect(mirror.find('b').exists()).toBe(false)
    expect(mirror.text()).toContain('a <b>bold</b> /review 尾部')
    expect(mirror.findAll('.composer-skill-inline')).toHaveLength(1)

    await wrapper.get('textarea').setValue('换行\n')
    expect(wrapper.get('.composer-mirror').element.textContent?.endsWith('\u200B')).toBe(true)
  })

  it('syncs the mirror scroll position with the textarea', async () => {
    const wrapper = mount(ComposerBar, { props: { skills: [], models, controls } })
    const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
    const mirror = wrapper.get('.composer-mirror').element as HTMLElement
    textarea.scrollTop = 24
    await wrapper.get('textarea').trigger('scroll')
    expect(mirror.scrollTop).toBe(24)
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
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('/release ')
    expect(wrapper.get('.composer-mirror .composer-skill-inline').text()).toBe('/release')

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
