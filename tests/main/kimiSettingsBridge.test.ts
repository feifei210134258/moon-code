import { describe, expect, it, vi } from 'vitest'
import { KimiSettingsBridge } from '../../src/main/kimi/KimiSettingsBridge.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'
import type { ProviderDirectoryItem } from '../../packages/kimi-adapter/src/wire/schemas.js'

const deepseekDirectory: ProviderDirectoryItem = {
  id: 'deepseek', name: 'DeepSeek', wire_type: 'openai', guessed: false,
  needs_base_url: false, rejected: false, reject_reason: null, env_key: 'DEEPSEEK_API_KEY',
  models: [
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', max_context_size: 1_048_576, reasoning: true },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', max_context_size: 1_002_000, reasoning: true }
  ]
}

function createClient() {
  const config = {
    providers: {
      'managed:kimi-code': { type: 'kimi', has_api_key: true }
    },
    default_provider: 'managed:kimi-code',
    default_model: 'kimi-for-coding',
    default_permission_mode: 'manual',
    default_plan_mode: true,
    merge_all_available_skills: true,
    secondary_model: {
      model: 'local-coder',
      defaultEffort: 'low',
      maxOutputSize: 8192
    },
    telemetry: false
  }
  return {
    getAuth: vi.fn(async () => ({
      ready: true,
      providers_count: 1,
      default_model: 'kimi-for-coding',
      managed_provider: { name: 'managed:kimi-code', status: 'authenticated' as const }
    })),
    listModels: vi.fn(async () => [
      {
        provider: 'managed:kimi-code',
        model: 'kimi-for-coding',
        display_name: 'Kimi for Coding',
        max_context_size: 262_144,
        capabilities: ['thinking'],
        support_efforts: ['off', 'high'],
        default_effort: 'high'
      },
      {
        provider: 'local:openai',
        model: 'local-coder',
        display_name: 'Local Coder',
        max_context_size: 131_072,
        capabilities: [],
        support_efforts: [],
        default_effort: null
      }
    ]),
    listProviders: vi.fn(async () => [
      {
        id: 'managed:kimi-code',
        type: 'kimi',
        has_api_key: true,
        status: 'connected' as const,
        models: ['kimi-for-coding']
      },
      {
        id: 'local:openai',
        type: 'openai',
        has_api_key: true,
        status: 'connected' as const,
        models: ['local-coder']
      }
    ]),
    getConfig: vi.fn(async () => config),
    supportsSecondaryModelConfigWrite: vi.fn(async () => false),
    supportsProviderManagement: vi.fn(async () => false),
    setDefaultModel: vi.fn(async () => ({})),
    setConfig: vi.fn(async () => config),
    createProvider: vi.fn(async () => ({
      id: 'third-party:openai', type: 'openai', has_api_key: true, status: 'connected' as const,
      models: ['third-party:openai/local-coder']
    })),
    refreshProvider: vi.fn(async () => ({ changed: [], unchanged: [], failed: [] })),
    replaceProvider: vi.fn(async () => ({
      id: 'local:openai', type: 'openai', has_api_key: true, status: 'connected' as const,
      models: ['local-coder']
    })),
    deleteProvider: vi.fn(async () => undefined),
    getCatalogProvider: vi.fn(async (_catalogId: string): Promise<ProviderDirectoryItem> => {
      throw new Error('catalog entry not found')
    }),
    refreshAllProviders: vi.fn(async () => ({
      changed: [{ provider_id: 'managed:kimi-code', provider_name: 'Kimi Code', added: 1, removed: 0 }],
      unchanged: [], failed: []
    })),
    refreshOAuthProviderModels: vi.fn(async () => ({ changed: [], unchanged: [], failed: [] })),
    startOAuthLogin: vi.fn(async () => ({
      flow_id: 'flow-1',
      provider: 'managed:kimi-code',
      status: 'pending' as const,
      verification_uri: 'https://auth.kimi.com/device',
      verification_uri_complete: 'https://auth.kimi.com/device?code=ABCD',
      user_code: 'ABCD',
      expires_in: 600,
      interval: 5,
      expires_at: '2026-07-23T01:00:00.000Z'
    })),
    pollOAuthLogin: vi.fn(async () => null),
    cancelOAuthLogin: vi.fn(async () => ({ cancelled: true, status: 'cancelled' as const })),
    logoutOAuth: vi.fn(async () => ({ logged_out: true as const, provider: 'managed:kimi-code' }))
  }
}

describe('KimiSettingsBridge', () => {
  it('projects only redacted catalog/config data and uses Kimi for mutations', async () => {
    const client = createClient()
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager
    const bridge = new KimiSettingsBridge(runtime)

    const snapshot = await bridge.getSnapshot()
    expect(snapshot).toEqual(expect.objectContaining({
      auth: expect.objectContaining({ ready: true, providersCount: 1 }),
      models: [expect.objectContaining({ id: 'kimi-for-coding', maxContextSize: 262_144 })],
      providers: [
        expect.objectContaining({ id: 'managed:kimi-code', hasCredential: true }),
        expect.objectContaining({ id: 'local:openai', hasCredential: true })
      ],
      preferences: expect.objectContaining({ defaultPermissionMode: 'manual', telemetry: false }),
      secondaryModel: { model: 'local-coder', defaultEffort: 'low', maxOutputSize: 8192 },
      capabilities: expect.objectContaining({
        canAddProvider: true,
        canDeleteProvider: false,
        secondaryModel: expect.objectContaining({ supported: true, enabled: true, writable: false })
      })
    }))
    expect(JSON.stringify(snapshot)).not.toContain('api_key')
    expect(snapshot.models.map((model) => model.id)).toEqual(['kimi-for-coding'])
    expect(snapshot.secondaryModelOptions.map((model) => model.id)).toEqual([
      'kimi-for-coding',
      'local-coder'
    ])
    expect(snapshot.providers.map((provider) => provider.id)).toEqual(['managed:kimi-code', 'local:openai'])

    await bridge.addProvider({
      id: 'third-party:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'secret-value'
    })
    expect(client.setConfig).toHaveBeenCalledWith({
      providers: {
        'third-party:openai': {
          type: 'openai',
          base_url: 'http://127.0.0.1:11434/v1',
          api_key: 'secret-value'
        }
      }
    })
    expect(client.refreshProvider).toHaveBeenCalledWith('third-party:openai')

    await expect(bridge.addProvider({
      id: 'local:openai',
      type: 'openai'
    })).rejects.toThrow('Kimi provider already exists: local:openai')

    await expect(bridge.refreshProviders({ scope: 'all' })).resolves.toEqual({
      changed: [{ providerId: 'managed:kimi-code', providerName: 'Kimi Code', added: 1, removed: 0 }],
      unchanged: [], failed: []
    })
    await expect(bridge.startOAuthLogin('managed:kimi-code')).resolves.toEqual(expect.objectContaining({
      flowId: 'flow-1',
      status: 'pending',
      userCode: 'ABCD'
    }))
  })

  it('does not claim that a shared Runtime enabled the secondary experiment', async () => {
    const client = createClient()
    const runtime = {
      state: {
        status: 'running', mode: 'shared', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:58627', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    const snapshot = await new KimiSettingsBridge(runtime).getSnapshot()

    expect(snapshot.capabilities.secondaryModel).toEqual(expect.objectContaining({
      supported: true,
      enabled: null,
      writable: false
    }))
  })

  it('edits and deletes custom providers only through the Runtime provider routes', async () => {
    const client = createClient()
    client.supportsProviderManagement.mockResolvedValue(true)
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager
    const bridge = new KimiSettingsBridge(runtime)

    await bridge.updateProvider({
      id: 'local:openai', newId: 'local:openai-work', type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1'
    })
    expect(client.replaceProvider).toHaveBeenCalledWith('local:openai', expect.objectContaining({
      new_id: 'local:openai-work', type: 'openai', base_url: 'http://127.0.0.1:11434/v1',
      models: [expect.objectContaining({ model: 'local-coder', max_context_size: 131_072 })]
    }))

    await bridge.deleteProvider('local:openai')
    expect(client.deleteProvider).toHaveBeenCalledWith('local:openai')
    const snapshot = await bridge.getSnapshot()
    expect(snapshot.capabilities).toEqual(expect.objectContaining({
      canEditProvider: true,
      canDeleteProvider: true,
      providerManagementUnavailableReason: null
    }))
  })

  it('repairs a zero-model provider from the Kimi catalog before renaming it', async () => {
    const client = createClient()
    client.supportsProviderManagement.mockResolvedValue(true)
    client.listModels.mockResolvedValue([{
      provider: 'managed:kimi-code', model: 'kimi-for-coding', display_name: 'Kimi for Coding',
      max_context_size: 262_144, capabilities: ['thinking'], support_efforts: ['off', 'high'], default_effort: 'high'
    }])
    client.getCatalogProvider.mockImplementation(async (catalogId: string) => {
      if (catalogId !== 'deepseek') throw new Error('catalog entry not found')
      return deepseekDirectory
    })
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    await new KimiSettingsBridge(runtime).updateProvider({
      id: 'local:openai', newId: 'deepseek', type: 'openai',
      baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-flash'
    })

    expect(client.getCatalogProvider).toHaveBeenCalledWith('deepseek')
    expect(client.replaceProvider).toHaveBeenCalledWith('local:openai', expect.objectContaining({
      new_id: 'deepseek',
      default_model: 'deepseek-v4-flash',
      models: [
        expect.objectContaining({ model: 'deepseek-v4-flash', max_context_size: 1_048_576 }),
        expect.objectContaining({ model: 'deepseek-v4-pro', max_context_size: 1_002_000 })
      ]
    }))
  })

  it('creates a catalog-backed provider through the official Runtime route', async () => {
    const client = createClient()
    client.supportsProviderManagement.mockResolvedValue(true)
    client.getCatalogProvider.mockImplementation(async (catalogId: string) => {
      if (catalogId !== 'deepseek') throw new Error('catalog entry not found')
      return deepseekDirectory
    })
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    await new KimiSettingsBridge(runtime).addProvider({
      id: 'deepseek', type: 'openai', baseUrl: 'https://api.deepseek.com',
      apiKey: 'test-key', defaultModel: 'deepseek-v4-flash'
    })

    expect(client.createProvider).toHaveBeenCalledWith(expect.objectContaining({
      id: 'deepseek',
      type: 'openai',
      base_url: 'https://api.deepseek.com',
      api_key: 'test-key',
      default_model: 'deepseek-v4-flash',
      models: [
        expect.objectContaining({ model: 'deepseek-v4-flash', max_context_size: 1_048_576 }),
        expect.objectContaining({ model: 'deepseek-v4-pro', max_context_size: 1_002_000 })
      ]
    }))
    expect(client.setConfig).not.toHaveBeenCalled()
  })

  it('uses manual context metadata for an unknown private provider', async () => {
    const client = createClient()
    client.supportsProviderManagement.mockResolvedValue(true)
    client.listModels.mockResolvedValue([{
      provider: 'managed:kimi-code', model: 'kimi-for-coding', display_name: 'Kimi for Coding',
      max_context_size: 262_144, capabilities: ['thinking'], support_efforts: ['off', 'high'], default_effort: 'high'
    }])
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    await new KimiSettingsBridge(runtime).updateProvider({
      id: 'local:openai', newId: 'private-gateway', type: 'openai',
      baseUrl: 'https://llm.example.com/v1', defaultModel: 'private-coder',
      defaultModelContextSize: 65_536
    })

    expect(client.replaceProvider).toHaveBeenCalledWith('local:openai', expect.objectContaining({
      new_id: 'private-gateway',
      default_model: 'private-coder',
      models: [{ model: 'private-coder', max_context_size: 65_536 }]
    }))
  })

  it('strips provider-qualified aliases before replacing a provider', async () => {
    const client = createClient()
    client.supportsProviderManagement.mockResolvedValue(true)
    client.listModels.mockResolvedValue([{
      provider: 'local:openai', model: 'local:openai/local-coder', display_name: 'Local Coder',
      max_context_size: 131_072, capabilities: [], support_efforts: [], default_effort: null
    }])
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    await new KimiSettingsBridge(runtime).updateProvider({
      id: 'local:openai', newId: 'local:renamed', type: 'openai',
      defaultModel: 'local:openai/local-coder'
    })

    expect(client.replaceProvider).toHaveBeenCalledWith('local:openai', expect.objectContaining({
      default_model: 'local-coder',
      models: [expect.objectContaining({ model: 'local-coder' })]
    }))
  })

  it('writes secondary config only when the Runtime contract declares the field', async () => {
    const client = createClient()
    client.supportsSecondaryModelConfigWrite.mockResolvedValue(true)
    client.setConfig.mockImplementation(async () => {
      const updated = {
        ...await client.getConfig(),
        secondary_model: { model: 'local-coder', defaultEffort: 'low', maxOutputSize: 4096 }
      }
      client.getConfig.mockResolvedValue(updated)
      return updated
    })
    const runtime = {
      state: {
        status: 'running', mode: 'managed', version: '0.30.0', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager

    const snapshot = await new KimiSettingsBridge(runtime).setSecondaryModel({
      model: 'local-coder',
      defaultEffort: 'low',
      maxOutputSize: 4096
    })

    expect(client.setConfig).toHaveBeenCalledWith({
      secondary_model: {
        model: 'local-coder',
        default_effort: 'low',
        max_output_size: 4096
      }
    })
    expect(snapshot.secondaryModel).toEqual({
      model: 'local-coder', defaultEffort: 'low', maxOutputSize: 4096
    })
    expect(snapshot.capabilities.secondaryModel.writable).toBe(true)
  })

  it('saves a 0.29.2 secondary model as an official Runtime environment preference', async () => {
    const client = createClient()
    let preference = { mode: 'inherit' as const, model: null, defaultEffort: null }
    const store = {
      load: vi.fn(async () => preference),
      save: vi.fn(async (next) => { preference = next })
    }
    const runtime = {
      state: {
        status: 'running', mode: 'system', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      appliedSecondaryModelPreference: { mode: 'inherit', model: null, defaultEffort: null },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager
    const bridge = new KimiSettingsBridge(runtime, store)

    const snapshot = await bridge.setSecondaryModel({ model: 'local-coder', defaultEffort: 'low' })

    expect(store.save).toHaveBeenCalledWith({
      mode: 'configured', model: 'local-coder', defaultEffort: 'low'
    })
    expect(client.setConfig).not.toHaveBeenCalled()
    expect(snapshot.secondaryModelControl).toEqual(expect.objectContaining({
      preference: { mode: 'configured', model: 'local-coder', defaultEffort: 'low' },
      requiresRestart: true,
      configurationMode: 'runtime-env'
    }))
    expect(snapshot.capabilities.secondaryModel).toEqual(expect.objectContaining({
      writable: true, canDisable: true, maxOutputSizeWritable: false
    }))

    const disabled = await bridge.disableSecondaryModel()
    expect(store.save).toHaveBeenLastCalledWith({ mode: 'disabled', model: null, defaultEffort: null })
    expect(disabled.secondaryModelControl.preference.mode).toBe('disabled')
    expect(disabled.secondaryModelControl.requiresRestart).toBe(true)

    const inherited = await bridge.inheritSecondaryModel()
    expect(store.save).toHaveBeenLastCalledWith({ mode: 'inherit', model: null, defaultEffort: null })
    expect(inherited.secondaryModelControl.preference.mode).toBe('inherit')
    expect(inherited.secondaryModelControl.requiresRestart).toBe(false)
  })

  it('rejects local max-output overrides and cannot alter a shared Runtime environment', async () => {
    const client = createClient()
    const store = {
      load: vi.fn(async () => ({ mode: 'inherit' as const, model: null, defaultEffort: null })),
      save: vi.fn(async () => undefined)
    }
    const ownedRuntime = {
      state: {
        status: 'running', mode: 'managed', version: '0.29.2', serverId: 'server-1',
        origin: 'http://127.0.0.1:1234', error: null
      },
      appliedSecondaryModelPreference: { mode: 'inherit', model: null, defaultEffort: null },
      createRestClient: () => client
    } as unknown as KimiRuntimeManager
    await expect(new KimiSettingsBridge(ownedRuntime, store).setSecondaryModel({
      model: 'local-coder', maxOutputSize: 4096
    })).rejects.toThrow('max_output_size')

    const sharedRuntime = {
      ...ownedRuntime,
      state: { ...ownedRuntime.state, mode: 'shared' }
    } as unknown as KimiRuntimeManager
    const sharedBridge = new KimiSettingsBridge(sharedRuntime, store)
    await expect(sharedBridge.disableSecondaryModel()).rejects.toThrow('不是由 Moon Code 启动')
    await expect(sharedBridge.inheritSecondaryModel()).rejects.toThrow('不是由 Moon Code 启动')
    expect(store.save).not.toHaveBeenCalled()
  })
})
