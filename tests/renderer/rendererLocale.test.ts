// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest'
import { setRendererLocale } from '../../src/renderer/src/i18n/rendererLocale.js'

describe('renderer locale', () => {
  afterEach(() => {
    document.body.replaceChildren()
    setRendererLocale('zh-CN')
  })

  it('translates static UI copy and accessible labels while preserving Markdown output', () => {
    document.body.innerHTML = `
      <button aria-label="添加项目">添加项目</button>
      <input placeholder="搜索任务" />
      <div class="markdown-block">添加项目</div>
    `

    setRendererLocale('en-US')

    expect(document.documentElement.lang).toBe('en')
    expect(document.querySelector('button')?.textContent).toBe('Add project')
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Add project')
    expect(document.querySelector('input')?.getAttribute('placeholder')).toBe('Search tasks')
    expect(document.querySelector('.markdown-block')?.textContent).toBe('添加项目')
  })

  it('localizes later Vue-style updates and restores the source locale', async () => {
    const label = document.createTextNode('运行中')
    document.body.append(label)
    setRendererLocale('en-US')
    expect(label.data).toBe('Running')

    label.data = '已暂停'
    await Promise.resolve()
    expect(label.data).toBe('Paused')

    setRendererLocale('zh-CN')
    expect(label.data).toBe('已暂停')
  })
})
