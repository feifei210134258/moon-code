import { describe, expect, it } from 'vitest'
import {
  validateAddProviderInput,
  validateModelId,
  validatePreferencesPatch,
  validateProviderId,
  validateProviderRefreshInput,
  validateSecondaryModelInput,
  validateUpdateProviderInput
} from '../../src/main/security/settingsInputs.js'

describe('settings IPC input validation', () => {
  it('accepts bounded provider configuration and loopback development endpoints', () => {
    expect(validateAddProviderInput({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key',
      defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })).toEqual({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key',
      defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
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
    expect(() => validateAddProviderInput({
      id: 'bad', type: 'openai', defaultModel: 'coder', defaultModelContextSize: 0
    })).toThrow('Invalid Kimi provider model context size')
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

  it('accepts only bounded secondary model settings', () => {
    expect(validateSecondaryModelInput({
      model: 'local:openai/coder',
      defaultEffort: 'low',
      maxOutputSize: 8192
    })).toEqual({
      model: 'local:openai/coder',
      defaultEffort: 'low',
      maxOutputSize: 8192
    })
    expect(() => validateSecondaryModelInput({ model: ' ' })).toThrow('Invalid Kimi secondary model id')
    expect(() => validateSecondaryModelInput({ model: 'coder', maxOutputSize: 0 })).toThrow(
      'Invalid Kimi secondary max output size'
    )
    expect(() => validateSecondaryModelInput({ model: 'coder', raw: {} })).toThrow(
      'Invalid Kimi secondary model input'
    )
  })

  it('accepts provider edits while keeping credentials optional', () => {
    expect(validateUpdateProviderInput({
      id: 'local:openai', newId: 'local:openai-work', type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1', defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })).toEqual({
      id: 'local:openai', newId: 'local:openai-work', type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1', defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })
    expect(() => validateUpdateProviderInput({
      id: 'local:openai', type: 'openai', defaultModelContextSize: 16_777_217
    })).toThrow('Invalid Kimi provider model context size')
    expect(() => validateUpdateProviderInput({ id: 'local:openai', type: 'openai', raw: {} }))
      .toThrow('Invalid Kimi provider update input')
  })
})
