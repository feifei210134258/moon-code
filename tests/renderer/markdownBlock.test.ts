// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownBlock from '../../src/renderer/src/components/MarkdownBlock.vue'
import type { KimiAgentDesktopApi } from '../../src/shared/contracts.js'

afterEach(() => {
  delete window.kimiAgent
})

describe('MarkdownBlock', () => {
  it('renders GFM, highlighted code, KaTeX and safe workspace file links', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: {
        text: [
          '## 结果',
          '',
          '| 项目 | 状态 |',
          '| --- | --- |',
          '| Attachment | 完成 |',
          '',
          '- [x] 已验证',
          '',
          '打开 src/app/index.html:12 查看。',
          '',
          '也可以查看 `src/components/Card.tsx:8`。',
          '',
          '```ts',
          'const ready: boolean = true',
          '```',
          '',
          '$E = mc^2$'
        ].join('\n')
      }
    })
    await flushPromises()

    expect(wrapper.find('table').exists()).toBe(true)
    expect(wrapper.find('.task-list-item input[type="checkbox"]').exists()).toBe(true)
    expect(wrapper.find('code .hljs-keyword').exists()).toBe(true)
    expect(wrapper.find('.katex').exists()).toBe(true)
    const fileLink = wrapper.get('.markdown-file-link')
    expect(fileLink.attributes('data-workspace-path')).toBe('src/app/index.html')
    const inlineFile = wrapper.get('code.markdown-file-inline')
    expect(inlineFile.text()).toBe('src/components/Card.tsx:8')
    expect(inlineFile.attributes('data-workspace-path')).toBe('src/components/Card.tsx:8')
    await fileLink.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['src/app/index.html']])
  })

  it('opens inline-code file paths from assistant replies (Kimi HTML files)', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '落地页已写好，直接打开 `app/index.html` 预览。' }
    })

    const inlineFile = wrapper.get('code.markdown-file-inline')
    expect(inlineFile.attributes('data-workspace-path')).toBe('app/index.html')
    await inlineFile.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['app/index.html']])
  })

  it('recognizes generated HTML files with Chinese names as blue clickable paths', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '交付物：`校看板_大屏原型.html`，可直接预览。' }
    })

    const inlineFile = wrapper.get('code.markdown-file-inline')
    expect(inlineFile.attributes('data-workspace-path')).toBe('校看板_大屏原型.html')
    await inlineFile.trigger('contextmenu', { clientX: 120, clientY: 80 })
    expect(wrapper.emitted('fileContext')?.[0]?.[0]).toBe('校看板_大屏原型.html')
    await inlineFile.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['校看板_大屏原型.html']])
  })

  it('does not execute raw HTML from model output', () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '<img src=x onerror="window.pwned=true">' }
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img')
    expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('opens explicit local Markdown links through the workspace file bridge', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '[打开预览](./app/index.html:24)' }
    })

    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['./app/index.html']])
  })

  it('loads local Markdown images through the bounded Kimi Session FS bridge', async () => {
    const readMarkdownImage = vi.fn(async () => ({
      path: 'assets/preview.png',
      dataUrl: 'data:image/png;base64,AA==',
      mediaType: 'image/png',
      size: 1
    }))
    window.kimiAgent = { readMarkdownImage } as unknown as KimiAgentDesktopApi
    const wrapper = mount(MarkdownBlock, {
      props: { text: '![Preview](./assets/preview.png)', sessionId: 'session-1' }
    })
    await flushPromises()

    expect(readMarkdownImage).toHaveBeenCalledWith('session-1', './assets/preview.png')
    expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,AA==')
    expect(wrapper.get('img').classes()).toContain('is-ready')
  })

  it('does not automatically request remote Markdown images', async () => {
    const readMarkdownImage = vi.fn()
    window.kimiAgent = { readMarkdownImage } as unknown as KimiAgentDesktopApi
    const wrapper = mount(MarkdownBlock, {
      props: { text: '![Remote](https://example.com/tracker.png)', sessionId: 'session-1' }
    })
    await flushPromises()

    expect(readMarkdownImage).not.toHaveBeenCalled()
    expect(wrapper.get('img').classes()).toContain('is-blocked')
    expect(wrapper.get('img').attributes('src')).toMatch(/^data:image\/gif/)
  })
})
