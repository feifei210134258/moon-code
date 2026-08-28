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

  it('makes absolute paths from kimi 0.39 replies clickable and openable', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: {
        text: [
          '已更新 /Users/feili/codes/原型稿件/学生评价/运行监控_原型/index.html ，',
          '行内定位 `/Users/feili/repo/src/app.ts:42`，相对引用 dist/校看板.html 不受影响。'
        ].join('\n')
      }
    })

    const links = wrapper.findAll('a.markdown-file-link')
    expect(links.map((link) => link.attributes('data-workspace-path'))).toEqual([
      '/Users/feili/codes/原型稿件/学生评价/运行监控_原型/index.html',
      'dist/校看板.html'
    ])
    const inlineFile = wrapper.get('code.markdown-file-inline')
    expect(inlineFile.attributes('data-workspace-path')).toBe('/Users/feili/repo/src/app.ts:42')
    await links[0]!.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['/Users/feili/codes/原型稿件/学生评价/运行监控_原型/index.html']])
    await inlineFile.trigger('contextmenu', { clientX: 100, clientY: 60 })
    expect(wrapper.emitted('fileContext')?.[0]?.[0]).toBe('/Users/feili/repo/src/app.ts:42')
  })

  it('routes absolute artifact mentions as bright blue against writtenPath artifact sets', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: {
        text: '/Users/feili/repo/dist/index.html 已写入；/Users/feili/repo/docs/plan.md 仅提及。',
        artifactPaths: new Set(['/Users/feili/repo/dist/index.html'])
      }
    })
    await flushPromises()

    const links = wrapper.findAll('a.markdown-file-link')
    expect(links.map((link) => link.attributes('data-workspace-path'))).toEqual([
      '/Users/feili/repo/dist/index.html',
      '/Users/feili/repo/docs/plan.md'
    ])
    expect(links[0]!.classes()).not.toContain('is-mention')
    expect(links[1]!.classes()).toContain('is-mention')
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

  it('keeps tool-written artifact paths bright blue but dims merely mentioned paths', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: {
        text: '已写入 `src/app.ts:12`，样式参考 styles.css，工具函数见 `src/utils/format.ts`。',
        artifactPaths: new Set(['src/app.ts'])
      }
    })
    await flushPromises()

    const mentioned = wrapper.get('a.markdown-file-link.is-mention')
    expect(mentioned.attributes('data-workspace-path')).toBe('styles.css')

    const inlineArtifact = wrapper.get('code.markdown-file-inline')
    expect(inlineArtifact.classes()).not.toContain('is-mention')
    expect(inlineArtifact.attributes('data-workspace-path')).toBe('src/app.ts:12')

    const inlineMention = wrapper.get('code.markdown-file-inline.is-mention')
    expect(inlineMention.text()).toBe('src/utils/format.ts')
    await inlineMention.trigger('click')
    expect(wrapper.emitted('openFile')).toEqual([['src/utils/format.ts']])
  })

  it('matches artifacts with ./ prefix or absolute mention paths', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: {
        text: './src/app.ts 与 /repo/src/app.ts 都已写入。',
        artifactPaths: new Set(['src/app.ts'])
      }
    })
    await flushPromises()

    const links = wrapper.findAll('a.markdown-file-link')
    expect(links.map((link) => link.attributes('data-workspace-path'))).toEqual([
      './src/app.ts',
      '/repo/src/app.ts'
    ])
    for (const link of links) expect(link.classes()).not.toContain('is-mention')
  })

  it('keeps all file paths bright blue when artifactPaths is not provided', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '写入 src/app.ts 完成，样式参考 styles.css 与 `src/utils/format.ts`。' }
    })

    expect(wrapper.findAll('a.markdown-file-link.is-mention')).toHaveLength(0)
    expect(wrapper.findAll('code.markdown-file-inline.is-mention')).toHaveLength(0)
    expect(wrapper.findAll('a.markdown-file-link').length).toBeGreaterThanOrEqual(2)
    expect(wrapper.findAll('code.markdown-file-inline')).toHaveLength(1)
  })

  it('emits openLink on click and openLinkExternal on right-click for http(s) links', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '服务已启动 http://localhost:3000/dashboard ，文档见 [Kimi 文档](https://kimi.com/docs)。' }
    })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)

    await links[0]!.trigger('click')
    expect(wrapper.emitted('openLink')).toEqual([['http://localhost:3000/dashboard']])
    expect(wrapper.emitted('openFile')).toBeUndefined()

    await links[1]!.trigger('contextmenu')
    expect(wrapper.emitted('openLinkExternal')).toEqual([['https://kimi.com/docs']])
  })

  it('does not emit link events for non-http anchors', async () => {
    const wrapper = mount(MarkdownBlock, {
      props: { text: '[相对路径](docs/guide.md) 与 [mailto](mailto:a@b.com)。' }
    })

    const links = wrapper.findAll('a')
    expect(links).toHaveLength(2)
    for (const link of links) {
      await link.trigger('click')
      await link.trigger('contextmenu')
    }
    expect(wrapper.emitted('openLink')).toBeUndefined()
    expect(wrapper.emitted('openLinkExternal')).toBeUndefined()
  })
})
