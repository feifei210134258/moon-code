import { describe, expect, it } from 'vitest'
import { validateRuntimeExternalConnection } from '../../src/main/security/runtimeInputs.js'

describe('validateRuntimeExternalConnection', () => {
  it('normalizes an HTTP(S) origin while preserving the bearer only for Main', () => {
    expect(validateRuntimeExternalConnection({ origin: 'https://kimi.example.com/', token: 'secret-token' })).toEqual({
      origin: 'https://kimi.example.com', token: 'secret-token'
    })
  })

  it('rejects origins with credentials, paths, or malformed tokens', () => {
    expect(() => validateRuntimeExternalConnection({ origin: 'https://user:pass@kimi.example.com', token: 'x' })).toThrow()
    expect(() => validateRuntimeExternalConnection({ origin: 'https://kimi.example.com/proxy', token: 'x' })).toThrow()
    expect(() => validateRuntimeExternalConnection({ origin: 'file:///tmp/kimi', token: 'x' })).toThrow()
    expect(() => validateRuntimeExternalConnection({ origin: 'https://kimi.example.com', token: 'line\nbreak' })).toThrow()
  })
})
