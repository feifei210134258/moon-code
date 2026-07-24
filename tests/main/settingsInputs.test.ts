import { describe, expect, it } from 'vitest'
import {
  validateAddProviderInput,
  validateModelId,
  validatePreferencesPatch,
  validateProviderId,
  validateProviderRefreshInput
} from '../../src/main/security/settingsInputs.js'

describe('settings IPC input validation', () => {
  it('accepts bounded provider configuration and loopback development endpoints', () => {
    expect(validateAddProviderInput({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key'
    })).toEqual({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key'
    })
    expect(validateProviderId('managed:kimi-code')).toBe('managed:kimi-code')
    expect(validateModelId('kimi-for-coding')).toBe('kimi-for-coding')
  })

  it('rejects credential URLs, insecure remote HTTP and unbounded secrets', () => {
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'openai', baseUrl: 'https://user:pass@example.com/v1'
    })).toThrow('Invalid Kimi provider base URL')
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'openai', baseUrl: 'http://192.168.1.2/v1'
    })).toThrow('Invalid Kimi provider base URL')
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'openai', baseUrl: 'https://api.example.com/v1?token=secret'
    })).toThrow('Invalid Kimi provider base URL')
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'unknown', apiKey: 'x'
    })).toThrow('Invalid Kimi provider type')
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'openai', apiKey: 'x'.repeat(8_193)
    })).toThrow('Invalid Kimi provider API key')
  })

  it('allows only the explicit safe preference and refresh fields', () => {
    expect(validatePreferencesPatch({ telemetry: false, defaultPermissionMode: 'manual' })).toEqual({
      telemetry: false,
      defaultPermissionMode: 'manual'
    })
    expect(validateProviderRefreshInput({ scope: 'provider', providerId: 'managed:kimi-code' })).toEqual({
      scope: 'provider',
      providerId: 'managed:kimi-code'
    })
    expect(() => validatePreferencesPatch({ raw: { providers: {} } })).toThrow('Invalid Kimi preferences patch')
    expect(() => validateProviderRefreshInput({ scope: 'provider' })).toThrow('Invalid Kimi provider id')
  })
})
