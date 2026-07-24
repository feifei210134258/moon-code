import { describe, expect, it } from 'vitest'
import {
  validateLifecycleSessionId,
  validateSessionTitle,
  validateWorkspaceId,
  validateWorkspaceName
} from '../../src/main/security/lifecycleInputs.js'

describe('Workspace and Session lifecycle inputs', () => {
  it('accepts bounded Kimi ids and trims display names', () => {
    expect(validateWorkspaceId('wd_project_123')).toBe('wd_project_123')
    expect(validateLifecycleSessionId('session-1')).toBe('session-1')
    expect(validateWorkspaceName('  Kimi Agent  ')).toBe('Kimi Agent')
    expect(validateSessionTitle('  P0 审计  ')).toBe('P0 审计')
  })

  it('rejects empty, oversized and NUL-bearing lifecycle values', () => {
    expect(() => validateWorkspaceId('')).toThrow()
    expect(() => validateLifecycleSessionId('bad\0id')).toThrow()
    expect(() => validateWorkspaceName(' '.repeat(3))).toThrow()
    expect(() => validateSessionTitle('x'.repeat(501))).toThrow()
  })
})
