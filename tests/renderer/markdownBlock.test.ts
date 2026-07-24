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
    expect(wrapper.get('code.markdown-file-inline').text()).toBe('src/components/Card.tsx:8')
    await fileLink.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['src/app/index.html']])
  })

  it('does not execute raw HTML from model output', () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '<img src=x onerror="window.pwned=true">' }
    })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img')
    expect((window as unknown as Record<string, unknown>).pwned).toBeUndefined()
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
