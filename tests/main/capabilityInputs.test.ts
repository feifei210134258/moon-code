import { describe, expect, it } from 'vitest'
import {
  validateCapabilityId,
  validateOptionalSessionId,
  validateOptionalSkillArgs
} from '../../src/main/security/capabilityInputs.js'

describe('Kimi capability IPC inputs', () => {
  it('accepts bounded ids and optional skill arguments', () => {
    expect(validateCapabilityId('review-code', 'skill name')).toBe('review-code')
    expect(validateOptionalSessionId(undefined)).toBeUndefined()
    expect(validateOptionalSkillArgs('--fix src')).toBe('--fix src')
  })

  it('rejects control characters, oversized ids and NUL-bearing arguments', () => {
    expect(() => validateCapabilityId('bad\nname', 'skill name')).toThrow(TypeError)
    expect(() => validateCapabilityId('x'.repeat(257), 'MCP server id')).toThrow(TypeError)
    expect(() => validateOptionalSkillArgs('bad\0args')).toThrow(TypeError)
  })
})
