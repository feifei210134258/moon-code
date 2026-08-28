import { describe, expect, it } from 'vitest'
import {
  normalizeWorkspaceFileReference,
  workspaceFileDestination,
  workspaceFilePathFromHref
} from '../../src/renderer/src/utils/fileRouting.js'

describe('workspace file routing', () => {
  it.each(['index.html', 'dist/preview.htm', 'APP.HTML'])('opens HTML in the built-in Browser: %s', (path) => {
    expect(workspaceFileDestination(path)).toBe('browser')
  })

  it.each(['src/app.ts', 'README.md', 'index.html.ts'])('keeps other files in project preview: %s', (path) => {
    expect(workspaceFileDestination(path)).toBe('files')
  })

  it('keeps HTML routing when a conversation includes a line and column suffix', () => {
    expect(normalizeWorkspaceFileReference('src/pages/index.html:18:4')).toEqual({ path: 'src/pages/index.html', line: 18 })
    expect(workspaceFileDestination('src/pages/index.html:18:4')).toBe('browser')
  })

  it('accepts local Markdown hrefs while rejecting external and escaping paths', () => {
    expect(workspaceFilePathFromHref('./src/pages/index.html#intro')).toBe('./src/pages/index.html')
    expect(workspaceFilePathFromHref('https://example.com/index.html')).toBeNull()
    expect(workspaceFilePathFromHref('../secret.txt')).toBeNull()
  })

  it('routes absolute in-conversation paths to the same open destinations', () => {
    /* kimi 0.39 助手文本/href 引用文件用绝对路径 */
    expect(normalizeWorkspaceFileReference('/Users/feili/repo/dist/校看板.html')).toEqual({
      path: '/Users/feili/repo/dist/校看板.html'
    })
    expect(normalizeWorkspaceFileReference('/Users/feili/repo/src/app.ts:42')).toEqual({
      path: '/Users/feili/repo/src/app.ts', line: 42
    })
    expect(workspaceFileDestination('/Users/feili/repo/dist/校看板.html')).toBe('browser')
    expect(workspaceFileDestination('/Users/feili/repo/src/app.ts')).toBe('files')
    expect(workspaceFilePathFromHref('/Users/feili/repo/dist/index.html#top')).toBe('/Users/feili/repo/dist/index.html')
    /* 协议 href 仍走外部浏览器，跳出工作区的相对 href 仍拒绝 */
    expect(workspaceFilePathFromHref('file:///etc/passwd')).toBeNull()
    expect(workspaceFilePathFromHref('../../etc/passwd')).toBeNull()
  })
})
