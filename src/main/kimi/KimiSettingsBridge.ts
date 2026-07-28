import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  AddKimiProviderInput,
  KimiOAuthCancelResult,
  KimiOAuthFlow,
  KimiPreferencesPatch,
  KimiProviderCatalogItem,
  KimiProviderRefreshResult,
  KimiSecondaryModelPreference,
  KimiSecondaryModelUpdateInput,
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
import { isSupportedKimiVersion } from '../runtime/version.js'
import {
  DEFAULT_SECONDARY_MODEL_PREFERENCE,
  type SecondaryModelPreferencesStore
} from '../runtime/SecondaryModelPreferencesStore.js'

const PROVIDER_DELETE_UNAVAILABLE =
  '当前 Kimi Runtime 没有安全的 Provider 删除 REST 接口；客户端不会绕过 Kimi 直接改配置文件。'
const SECONDARY_MODEL_WRITE_UNAVAILABLE =
  '当前 Kimi Runtime 的公开 /config 契约尚未声明 secondary_model 写入；Moon Code 只展示有效配置，不会伪造保存或直接修改 config.toml。'
const SECONDARY_MODEL_EXTERNAL_UNAVAILABLE =
  '当前 Runtime 不是由 Moon Code 启动，Moon Code 无法改变它的进程环境；请在启动该 Runtime 时配置官方 secondary model 环境变量。'
const SECONDARY_MODEL_MAX_OUTPUT_ENV_UNAVAILABLE =
  'Kimi 官方没有提供 secondary max_output_size 环境变量；当前 Runtime 的 /config 契约也不支持写入该字段。'

export class KimiSettingsBridge {
  #secondaryModelWriteCapability: {
    serverId: string
    value: Promise<boolean>
  } | null = null

  constructor(
    private readonly runtime: KimiRuntimeManager,
    private readonly secondaryModelPreferencesStore: Pick<SecondaryModelPreferencesStore, 'load' | 'save'> | null = null
  ) {}

  async getSnapshot(): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    const [auth, models, providers, config, secondaryModelRestWritable, secondaryPreference] = await Promise.all([
      client.getAuth(),
      client.listModels(),
      client.listProviders(),
      client.getConfig(),
      this.#getSecondaryModelWriteCapability(client),
      this.#loadSecondaryModelPreference()
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
      secondaryModelOptions: models.map(mapModel),
      // Default-model choices intentionally stay on Kimi providers, while the
      // secondary model may target any provider supported by Kimi Code.
      providers: providers.map(mapProvider),
      preferences: mapPreferences(config),
      secondaryModel: mapSecondaryModel(config),
      secondaryModelControl: mapSecondaryModelControl(
        this.runtime,
        secondaryPreference,
        this.secondaryModelPreferencesStore !== null,
        secondaryModelRestWritable
      ),
      capabilities: {
        canAddProvider: true,
        canDeleteProvider: false,
        providerDeleteUnavailableReason: PROVIDER_DELETE_UNAVAILABLE,
        secondaryModel: mapSecondaryModelCapability(
          this.runtime,
          this.secondaryModelPreferencesStore !== null,
          secondaryModelRestWritable
        )
      }
    }
  }

  async setDefaultModel(modelId: string): Promise<KimiSettingsSnapshot> {
    await this.runtime.createRestClient().setDefaultModel(modelId)
    return await this.getSnapshot()
  }

  async setSecondaryModel(input: KimiSecondaryModelUpdateInput): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    const restWritable = await this.#getSecondaryModelWriteCapability(client)
    const models = await client.listModels()
    const selected = models.find((model) => model.model === input.model)
    if (selected === undefined) throw new TypeError(`Kimi secondary model is not configured: ${input.model}`)
    if (
      input.defaultEffort !== undefined &&
      selected.support_efforts !== undefined &&
      selected.support_efforts.length > 0 &&
      !selected.support_efforts.includes(input.defaultEffort)
    ) {
      throw new TypeError(`Kimi secondary effort is not supported by ${input.model}`)
    }
    if (this.#canControlOwnedRuntimeEnvironment()) {
      if (input.maxOutputSize !== undefined && !restWritable) {
        throw new Error(SECONDARY_MODEL_MAX_OUTPUT_ENV_UNAVAILABLE)
      }
      if (input.maxOutputSize !== undefined) {
        await client.setConfig({
          secondary_model: {
            model: input.model,
            ...(input.defaultEffort === undefined ? {} : { default_effort: input.defaultEffort }),
            max_output_size: input.maxOutputSize
          }
        })
      }
      await this.secondaryModelPreferencesStore!.save({
        mode: 'configured',
        model: input.model,
        defaultEffort: input.defaultEffort ?? null
      })
      return await this.getSnapshot()
    }
    if (!restWritable) throw new Error(this.#secondaryModelUnavailableReason())
    const updated = await client.setConfig({
      secondary_model: {
        model: input.model,
        ...(input.defaultEffort === undefined ? {} : { default_effort: input.defaultEffort }),
        ...(input.maxOutputSize === undefined ? {} : { max_output_size: input.maxOutputSize })
      }
    })
    const effective = mapSecondaryModel(updated)
    if (
      effective.model !== input.model ||
      (input.defaultEffort !== undefined && effective.defaultEffort !== input.defaultEffort) ||
      (input.maxOutputSize !== undefined && effective.maxOutputSize !== input.maxOutputSize)
    ) {
      throw new Error(
        'Kimi Runtime did not apply the requested secondary model configuration; check environment overrides and Runtime warnings.'
      )
    }
    return await this.getSnapshot()
  }

  async disableSecondaryModel(): Promise<KimiSettingsSnapshot> {
    if (!this.#canControlOwnedRuntimeEnvironment()) {
      throw new Error(this.#secondaryModelUnavailableReason())
    }
    await this.secondaryModelPreferencesStore!.save({
      mode: 'disabled',
      model: null,
      defaultEffort: null
    })
    return await this.getSnapshot()
  }

  async inheritSecondaryModel(): Promise<KimiSettingsSnapshot> {
    if (!this.#canControlOwnedRuntimeEnvironment()) {
      throw new Error(this.#secondaryModelUnavailableReason())
    }
    await this.secondaryModelPreferencesStore!.save({
      mode: 'inherit',
      model: null,
      defaultEffort: null
    })
    return await this.getSnapshot()
  }

  async #loadSecondaryModelPreference(): Promise<KimiSecondaryModelPreference> {
    if (this.secondaryModelPreferencesStore === null) {
      return { ...DEFAULT_SECONDARY_MODEL_PREFERENCE }
    }
    return await this.secondaryModelPreferencesStore.load()
  }

  #canControlOwnedRuntimeEnvironment(): boolean {
    const mode = this.runtime.state.mode
    return this.secondaryModelPreferencesStore !== null && (mode === 'managed' || mode === 'system')
  }

  #secondaryModelUnavailableReason(): string {
    const mode = this.runtime.state.mode
    return mode === 'shared' || mode === 'external'
      ? SECONDARY_MODEL_EXTERNAL_UNAVAILABLE
      : SECONDARY_MODEL_WRITE_UNAVAILABLE
  }

  #getSecondaryModelWriteCapability(
    client: ReturnType<KimiRuntimeManager['createRestClient']>
  ): Promise<boolean> {
    const serverId = this.runtime.state.serverId ?? 'unidentified-runtime'
    if (this.#secondaryModelWriteCapability?.serverId === serverId) {
      return this.#secondaryModelWriteCapability.value
    }
    const value = client.supportsSecondaryModelConfigWrite()
    this.#secondaryModelWriteCapability = { serverId, value }
    return value
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
    const client = this.runtime.createRestClient()
    const providers = await client.listProviders()
    if (providers.some((provider) => provider.id === input.id)) {
      throw new Error(`Kimi provider already exists: ${input.id}`)
    }
    const provider: Record<string, unknown> = { type: input.type }
    if (input.baseUrl !== undefined) provider.base_url = input.baseUrl
    if (input.apiKey !== undefined) provider.api_key = input.apiKey
    if (input.defaultModel !== undefined) provider.default_model = input.defaultModel
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

function mapSecondaryModel(config: KimiConfigSnapshot): KimiSettingsSnapshot['secondaryModel'] {
  const secondary = config.secondary_model
  return {
    model: secondary?.model ?? null,
    defaultEffort: secondary?.defaultEffort ?? secondary?.default_effort ?? null,
    maxOutputSize: secondary?.maxOutputSize ?? secondary?.max_output_size ?? null
  }
}

function mapSecondaryModelCapability(
  runtime: KimiRuntimeManager,
  hasLocalStore: boolean,
  restWritable: boolean
): KimiSettingsSnapshot['capabilities']['secondaryModel'] {
  const state = runtime.state
  const supported = isSupportedKimiVersion(state.version)
  const owned = state.mode === 'managed' || state.mode === 'system'
  const localWritable = supported && owned && hasLocalStore
  const writable = supported && (localWritable || restWritable)
  const appliedPreference = runtime.appliedSecondaryModelPreference
  const enabled = supported && owned
    ? appliedPreference?.mode === 'disabled' ? false : true
    : supported
      ? null
      : false
  return {
    supported,
    enabled,
    writable,
    canDisable: localWritable,
    maxOutputSizeWritable: restWritable,
    unavailableReason: writable
      ? null
      : state.mode === 'shared' || state.mode === 'external'
        ? SECONDARY_MODEL_EXTERNAL_UNAVAILABLE
        : SECONDARY_MODEL_WRITE_UNAVAILABLE
  }
}

function mapSecondaryModelControl(
  runtime: KimiRuntimeManager,
  preference: KimiSecondaryModelPreference,
  hasLocalStore: boolean,
  restWritable: boolean
): KimiSettingsSnapshot['secondaryModelControl'] {
  const mode = runtime.state.mode
  const owned = mode === 'managed' || mode === 'system'
  const appliedPreference = owned ? runtime.appliedSecondaryModelPreference : null
  return {
    preference: { ...preference },
    appliedPreference,
    appliedSource: owned ? runtime.appliedSecondaryModelSource ?? null : null,
    requiresRestart: owned && hasLocalStore && !samePreference(preference, appliedPreference),
    configurationMode: owned && hasLocalStore
      ? 'runtime-env'
      : restWritable
        ? 'runtime-rest'
        : 'read-only'
  }
}

function samePreference(
  left: KimiSecondaryModelPreference,
  right: KimiSecondaryModelPreference | null
): boolean {
  return right !== null &&
    left.mode === right.mode &&
    left.model === right.model &&
    left.defaultEffort === right.defaultEffort
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
