import { describe, expect, it } from 'vitest'
import { validateWorkspacePath } from '../../src/main/security/workspaceInputs.js'

describe('workspace IPC path validation', () => {
  it('normalizes safe relative paths and allows the explicit list root', () => {
    expect(validateWorkspacePath('./src/app.ts')).toBe('src/app.ts')
    expect(validateWorkspacePath('src\\app.ts')).toBe('src/app.ts')
    expect(validateWorkspacePath('.', { allowRoot: true })).toBe('.')
  })

  it.each([
    '../secret',
    'src/../../secret',
    '/etc/passwd',
    'C:\\Windows\\system.ini',
    '\\\\server\\share',
    '.',
    '',
    `src/${'x'.repeat(4_096)}`,
    'src/\0secret'
  ])('rejects paths outside the active Kimi workspace: %s', (path) => {
    expect(() => validateWorkspacePath(path)).toThrow('Invalid Kimi workspace path')
  })

  it('keeps rejecting absolute paths unless the caller opts in', () => {
    expect(() => validateWorkspacePath('/Users/feili/repo/index.html')).toThrow('Invalid Kimi workspace path')
    expect(validateWorkspacePath('/Users/feili/repo/index.html', { allowAbsolute: true })).toBe('/Users/feili/repo/index.html')
  })

  it('still rejects traversal and null bytes on the absolute opt-in path', () => {
    expect(() => validateWorkspacePath('/repo/../etc/passwd', { allowAbsolute: true })).toThrow('Invalid Kimi workspace path')
    expect(() => validateWorkspacePath('/repo/\0secret', { allowAbsolute: true })).toThrow('Invalid Kimi workspace path')
  })
})
