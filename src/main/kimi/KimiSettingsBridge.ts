import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  AddKimiProviderInput,
  KimiOAuthCancelResult,
  KimiOAuthFlow,
  KimiPreferencesPatch,
  KimiProviderCatalogItem,
  KimiProviderRefreshResult,
  KimiSettingsPreferences,
  KimiSettingsSnapshot
} from '../../shared/contracts.js'
import type {
  KimiConfigSnapshot,
  ModelCatalogItem,
  OAuthFlowSnapshot,
  OAuthFlowStart,
  ProviderCatalogItem,
  ProviderRefreshResult
} from '../../../packages/kimi-adapter/src/wire/schemas.js'

const PROVIDER_DELETE_UNAVAILABLE =
  'Kimi Code 0.29.0 v2 没有安全的 Provider 删除 REST 接口；客户端不会绕过 Kimi 直接改配置文件。'

export class KimiSettingsBridge {
  constructor(private readonly runtime: KimiRuntimeManager) {}

  async getSnapshot(): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    const [auth, models, providers, config] = await Promise.all([
      client.getAuth(),
      client.listModels(),
      client.listProviders(),
      client.getConfig()
    ])
    const kimiProviders = providers.filter((provider) => (
      provider.type === 'kimi' || provider.id === auth.managed_provider?.name
    ))
    const kimiProviderIds = new Set(kimiProviders.map((provider) => provider.id))
    if (auth.managed_provider !== null) kimiProviderIds.add(auth.managed_provider.name)
    return {
      auth: {
        ready: auth.ready,
        providersCount: auth.providers_count,
        defaultModel: auth.default_model,
        managedProvider: auth.managed_provider === null ? null : {
          name: auth.managed_provider.name,
          status: auth.managed_provider.status
        }
      },
      models: models.filter((model) => kimiProviderIds.has(model.provider)).map(mapModel),
      providers: kimiProviders.map(mapProvider),
      preferences: mapPreferences(config),
      capabilities: {
        canAddProvider: true,
        canDeleteProvider: false,
        providerDeleteUnavailableReason: PROVIDER_DELETE_UNAVAILABLE
      }
    }
  }

  async setDefaultModel(modelId: string): Promise<KimiSettingsSnapshot> {
    await this.runtime.createRestClient().setDefaultModel(modelId)
    return await this.getSnapshot()
  }

  async updatePreferences(patch: KimiPreferencesPatch): Promise<KimiSettingsPreferences> {
    const wirePatch: Record<string, unknown> = {}
    if (patch.telemetry !== undefined) wirePatch.telemetry = patch.telemetry
    if (patch.defaultPermissionMode !== undefined) {
      wirePatch.default_permission_mode = patch.defaultPermissionMode
    }
    if (patch.defaultPlanMode !== undefined) wirePatch.default_plan_mode = patch.defaultPlanMode
    if (patch.mergeAllAvailableSkills !== undefined) {
      wirePatch.merge_all_available_skills = patch.mergeAllAvailableSkills
    }
    const config = await this.runtime.createRestClient().setConfig(wirePatch)
    return mapPreferences(config)
  }

  async addProvider(input: AddKimiProviderInput): Promise<KimiSettingsSnapshot> {
    const provider: Record<string, unknown> = { type: input.type }
    if (input.baseUrl !== undefined) provider.base_url = input.baseUrl
    if (input.apiKey !== undefined) provider.api_key = input.apiKey
    if (input.defaultModel !== undefined) provider.default_model = input.defaultModel
    const client = this.runtime.createRestClient()
    await client.setConfig({ providers: { [input.id]: provider } })
    await client.refreshProvider(input.id)
    return await this.getSnapshot()
  }

  async refreshProviders(input: {
    scope: 'all' | 'oauth' | 'provider'
    providerId?: string
  }): Promise<KimiProviderRefreshResult> {
    const client = this.runtime.createRestClient()
    if (input.scope === 'provider' && input.providerId === undefined) {
      throw new TypeError('Kimi provider id is required for a scoped refresh')
    }
    const result = input.scope === 'all'
      ? await client.refreshAllProviders()
      : input.scope === 'oauth'
        ? await client.refreshOAuthProviderModels()
        : await client.refreshProvider(input.providerId!)
    return mapRefreshResult(result)
  }

  async startOAuthLogin(provider?: string): Promise<KimiOAuthFlow> {
    return mapOAuthFlow(await this.runtime.createRestClient().startOAuthLogin(provider))
  }

  async pollOAuthLogin(provider?: string): Promise<KimiOAuthFlow | null> {
    const flow = await this.runtime.createRestClient().pollOAuthLogin(provider)
    return flow === null ? null : mapOAuthFlow(flow)
  }

  async cancelOAuthLogin(provider?: string): Promise<KimiOAuthCancelResult> {
    const result = await this.runtime.createRestClient().cancelOAuthLogin(provider)
    return { cancelled: result.cancelled, status: result.status }
  }

  async logoutOAuth(provider?: string): Promise<{ loggedOut: true; provider: string }> {
    const result = await this.runtime.createRestClient().logoutOAuth(provider)
    return { loggedOut: true, provider: result.provider }
  }
}

function mapModel(model: ModelCatalogItem): KimiSettingsSnapshot['models'][number] {
  return {
    id: model.model,
    providerId: model.provider,
    displayName: model.display_name ?? model.model,
    maxContextSize: model.max_context_size,
    capabilities: model.capabilities ?? [],
    supportEfforts: model.support_efforts ?? [],
    defaultEffort: model.default_effort ?? null
  }
}

function mapProvider(provider: ProviderCatalogItem): KimiProviderCatalogItem {
  return {
    id: provider.id,
    type: provider.type,
    baseUrl: provider.base_url ?? null,
    defaultModel: provider.default_model ?? null,
    hasCredential: provider.has_api_key,
    status: provider.status,
    models: provider.models ?? []
  }
}

function mapPreferences(config: KimiConfigSnapshot): KimiSettingsPreferences {
  const permissionMode = config.default_permission_mode
  return {
    defaultProvider: config.default_provider ?? null,
    defaultModel: config.default_model ?? null,
    defaultPermissionMode:
      permissionMode === 'manual' || permissionMode === 'auto' || permissionMode === 'yolo'
        ? permissionMode
        : null,
    defaultPlanMode: config.default_plan_mode ?? null,
    mergeAllAvailableSkills: config.merge_all_available_skills ?? null,
    telemetry: config.telemetry ?? null
  }
}

function mapRefreshResult(result: ProviderRefreshResult): KimiProviderRefreshResult {
  return {
    changed: result.changed.map((item) => ({
      providerId: item.provider_id,
      providerName: item.provider_name,
      added: item.added,
      removed: item.removed
    })),
    unchanged: [...result.unchanged],
    failed: result.failed.map((item) => ({ ...item }))
  }
}

function mapOAuthFlow(flow: OAuthFlowStart | OAuthFlowSnapshot): KimiOAuthFlow {
  return {
    flowId: flow.flow_id,
    provider: flow.provider,
    status: flow.status,
    verificationUri: 'verification_uri' in flow ? flow.verification_uri : null,
    verificationUriComplete: 'verification_uri_complete' in flow ? flow.verification_uri_complete : null,
    userCode: 'user_code' in flow ? flow.user_code : null,
    expiresIn: 'expires_in' in flow ? flow.expires_in : null,
    interval: 'interval' in flow ? flow.interval : null,
    expiresAt: 'expires_at' in flow ? timestampString(flow.expires_at) : null,
    resolvedAt: 'resolved_at' in flow ? timestampString(flow.resolved_at) : null,
    errorMessage: 'error_message' in flow ? flow.error_message ?? null : null
  }
}

function timestampString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  return null
}
