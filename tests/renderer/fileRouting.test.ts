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
})
