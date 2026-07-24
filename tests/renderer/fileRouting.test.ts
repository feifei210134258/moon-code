import { describe, expect, it } from 'vitest'
import { workspaceFileDestination } from '../../src/renderer/src/utils/fileRouting.js'

describe('workspace file routing', () => {
  it.each(['index.html', 'dist/preview.htm', 'APP.HTML'])('opens HTML in the built-in Browser: %s', (path) => {
    expect(workspaceFileDestination(path)).toBe('browser')
  })

  it.each(['src/app.ts', 'README.md', 'index.html.ts'])('keeps other files in project preview: %s', (path) => {
    expect(workspaceFileDestination(path)).toBe('files')
  })
})
