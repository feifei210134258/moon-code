import { describe, expect, it, vi } from 'vitest'
import { KimiSettingsBridge } from '../../src/main/kimi/KimiSettingsBridge.js'
import type { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

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
    telemetry: false
  }
  return {
    getAuth: vi.fn(async () => ({
      ready: true,
      providers_count: 1,
      default_model: 'kimi-for-coding',
      managed_provider: { name: 'managed:kimi-code', status: 'authenticated' as const }
    })),
    listModels: vi.fn(async () => [{
      provider: 'managed:kimi-code',
      model: 'kimi-for-coding',
      display_name: 'Kimi for Coding',
      max_context_size: 262_144,
      capabilities: ['thinking'],
      support_efforts: ['off', 'high'],
      default_effort: 'high'
    }]),
    listProviders: vi.fn(async () => [{
      id: 'managed:kimi-code',
      type: 'kimi',
      has_api_key: true,
      status: 'connected' as const,
      models: ['kimi-for-coding']
    }]),
    getConfig: vi.fn(async () => config),
    setDefaultModel: vi.fn(async () => ({})),
    setConfig: vi.fn(async () => config),
    refreshProvider: vi.fn(async () => ({ changed: [], unchanged: [], failed: [] })),
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
    const runtime = { createRestClient: () => client } as unknown as KimiRuntimeManager
    const bridge = new KimiSettingsBridge(runtime)

    const snapshot = await bridge.getSnapshot()
    expect(snapshot).toEqual(expect.objectContaining({
      auth: expect.objectContaining({ ready: true, providersCount: 1 }),
      models: [expect.objectContaining({ id: 'kimi-for-coding', maxContextSize: 262_144 })],
      providers: [expect.objectContaining({ id: 'managed:kimi-code', hasCredential: true })],
      preferences: expect.objectContaining({ defaultPermissionMode: 'manual', telemetry: false }),
      capabilities: expect.objectContaining({ canAddProvider: true, canDeleteProvider: false })
    }))
    expect(JSON.stringify(snapshot)).not.toContain('api_key')

    await bridge.addProvider({
      id: 'local:openai',
      type: 'openai',
      baseUrl: 'http://127.0.0.1:11434/v1',
      apiKey: 'secret-value'
    })
    expect(client.setConfig).toHaveBeenCalledWith({
      providers: {
        'local:openai': {
          type: 'openai',
          base_url: 'http://127.0.0.1:11434/v1',
          api_key: 'secret-value'
        }
      }
    })
    expect(client.refreshProvider).toHaveBeenCalledWith('local:openai')

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
})
