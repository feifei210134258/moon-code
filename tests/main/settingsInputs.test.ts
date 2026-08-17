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
      id: 'local-openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key',
      defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })).toEqual({
      id: 'local-openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'local-key',
      defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })
    expect(validateProviderId('managed:kimi-code')).toBe('managed:kimi-code')
    expect(validateModelId('kimi-for-coding')).toBe('kimi-for-coding')
  })

  it('accepts server-legal provider ids (unicode names and spaces) for new providers', () => {
    expect(validateAddProviderInput({ id: '公司', type: 'openai' })).toEqual({ id: '公司', type: 'openai' })
    expect(validateAddProviderInput({ id: 'My OpenAI 主备', type: 'openai' })).toEqual({
      id: 'My OpenAI 主备',
      type: 'openai'
    })
    expect(validateUpdateProviderInput({ id: '公司', newId: '公司 灾备', type: 'openai' })).toEqual({
      id: '公司',
      newId: '公司 灾备',
      type: 'openai'
    })
  })

  it('rejects new provider ids the Kimi Runtime would reject, and keeps existing ids permissive', () => {
    // 服务端 createProvider/replaceProvider 的 pattern 不允许 "." 或 ":"；
    // 本地提前拒绝，避免提交后才发现创建不成功。
    expect(() => validateAddProviderInput({ id: 'local:openai', type: 'openai' })).toThrow(
      '连接名称只能包含文字、数字、空格以及 - 和 _，且必须以文字或数字开头'
    )
    expect(() => validateAddProviderInput({ id: 'openai.main', type: 'openai' })).toThrow(
      '连接名称只能包含文字、数字、空格以及 - 和 _，且必须以文字或数字开头'
    )
    expect(() => validateAddProviderInput({ id: '-leading-dash', type: 'openai' })).toThrow(
      '连接名称只能包含文字、数字、空格以及 - 和 _，且必须以文字或数字开头'
    )
    expect(() => validateUpdateProviderInput({ id: '公司', newId: 'bad:id', type: 'openai' })).toThrow(
      '连接名称只能包含文字、数字、空格以及 - 和 _，且必须以文字或数字开头'
    )
    // 既有 Provider 的 id 以服务端返回为准（config.toml 可手工写入任意键名）。
    expect(validateProviderId('公司')).toBe('公司')
    expect(validateProviderId('managed:kimi-code')).toBe('managed:kimi-code')
    expect(validateProviderRefreshInput({ scope: 'provider', providerId: '公司' })).toEqual({
      scope: 'provider',
      providerId: '公司'
    })
    expect(() => validateProviderId('')).toThrow('Invalid Kimi provider id')
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
      id: 'local:openai', newId: 'local-openai-work', type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1', defaultModel: 'local-coder',
      defaultModelContextSize: 131_072
    })).toEqual({
      id: 'local:openai', newId: 'local-openai-work', type: 'openai',
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
