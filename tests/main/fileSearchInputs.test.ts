import { describe, expect, it } from 'vitest'
import {
  validateFileSearchQuery,
  validateWorkspaceLine,
  validateWorkspaceOpenApp
} from '../../src/main/security/fileSearchInputs.js'

describe('file search and external action IPC inputs', () => {
  it('accepts bounded search and grep queries', () => {
    expect(validateFileSearchQuery('  App.vue ', 'search')).toBe('App.vue')
    expect(validateFileSearchQuery('', 'search')).toBe('')
    expect(validateFileSearchQuery('ready', 'grep')).toBe('ready')
    expect(() => validateFileSearchQuery('', 'grep')).toThrow('Invalid Kimi file grep query')
    expect(() => validateFileSearchQuery(`x${'y'.repeat(512)}`, 'grep')).toThrow('Invalid Kimi file grep query')
  })

  it('only permits Kimi-declared open targets and bounded positive lines', () => {
    expect(validateWorkspaceOpenApp('vscode')).toBe('vscode')
    expect(validateWorkspaceOpenApp('cursor')).toBe('cursor')
    expect(() => validateWorkspaceOpenApp('terminal.app')).toThrow('Invalid Kimi workspace open app')
    expect(validateWorkspaceLine(undefined)).toBeUndefined()
    expect(validateWorkspaceLine(42)).toBe(42)
    expect(() => validateWorkspaceLine(0)).toThrow('Invalid Kimi workspace line')
  })
})
