import type { KimiRuntimeManager } from '../runtime/KimiRuntimeManager.js'
import type {
  AddKimiProviderInput,
  KimiCatalogProviderDetail,
  KimiCatalogProviderSummary,
  KimiOAuthCancelResult,
  KimiOAuthFlow,
  KimiPreferencesPatch,
  KimiProviderCatalogItem,
  KimiProviderRefreshResult,
  KimiSecondaryModelPreference,
  KimiSecondaryModelUpdateInput,
  KimiSettingsPreferences,
  KimiSettingsSnapshot,
  UpdateKimiProviderInput
} from '../../shared/contracts.js'
import type {
  KimiConfigSnapshot,
  ModelCatalogItem,
  OAuthFlowSnapshot,
  OAuthFlowStart,
  ProviderCatalogItem,
  ProviderDirectoryItem,
  ProviderRefreshResult
} from '../../../packages/kimi-adapter/src/wire/schemas.js'
import { isSupportedKimiVersion } from '../runtime/version.js'
import {
  DEFAULT_SECONDARY_MODEL_PREFERENCE,
  type SecondaryModelPreferencesStore
} from '../runtime/SecondaryModelPreferencesStore.js'

const PROVIDER_DELETE_UNAVAILABLE =
  '当前 Kimi Runtime 没有 Provider 管理 REST 接口；客户端不会绕过 Kimi 直接改配置文件。'
const SECONDARY_MODEL_WRITE_UNAVAILABLE =
  '当前 Kimi Runtime 的公开 /config 契约尚未声明 secondary_model 写入；Moon Code 只展示有效配置，不会伪造保存或直接修改 config.toml。'
const SECONDARY_MODEL_EXTERNAL_UNAVAILABLE =
  '当前 Runtime 不是由 Moon Code 启动，Moon Code 无法改变它的进程环境；请在启动该 Runtime 时配置官方 secondary model 环境变量。'
const SECONDARY_MODEL_MAX_OUTPUT_ENV_UNAVAILABLE =
  'Kimi 官方没有提供 secondary max_output_size 环境变量；当前 Runtime 的 /config 契约也不支持写入该字段。'

interface ProviderWriteModel {
  model: string
  max_context_size: number
  display_name?: string
  capabilities?: string[]
  support_efforts?: string[]
}

interface ProviderWriteCatalog {
  models: ProviderWriteModel[]
  defaultModel: string
}

export class KimiSettingsBridge {
  #secondaryModelWriteCapability: {
    serverId: string
    value: Promise<boolean>
  } | null = null
  #providerManagementCapability: {
    serverId: string
    value: Promise<boolean>
  } | null = null

  constructor(
    private readonly runtime: KimiRuntimeManager,
    private readonly secondaryModelPreferencesStore: Pick<SecondaryModelPreferencesStore, 'load' | 'save'> | null = null
  ) {}

  async getSnapshot(): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    const [auth, models, providers, config, secondaryModelRestWritable, providerManagementWritable, secondaryPreference] = await Promise.all([
      client.getAuth(),
      client.listModels(),
      client.listProviders(),
      client.getConfig(),
      this.#getSecondaryModelWriteCapability(client),
      this.#getProviderManagementCapability(client),
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
        canEditProvider: providerManagementWritable,
        canDeleteProvider: providerManagementWritable,
        providerManagementUnavailableReason: providerManagementWritable ? null : PROVIDER_DELETE_UNAVAILABLE,
        providerDeleteUnavailableReason: providerManagementWritable ? null : PROVIDER_DELETE_UNAVAILABLE,
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

  #getProviderManagementCapability(
    client: ReturnType<KimiRuntimeManager['createRestClient']>
  ): Promise<boolean> {
    const serverId = this.runtime.state.serverId ?? 'unidentified-runtime'
    if (this.#providerManagementCapability?.serverId === serverId) {
      return this.#providerManagementCapability.value
    }
    const supportsProviderManagement = (client as typeof client & {
      supportsProviderManagement?: () => Promise<boolean>
    }).supportsProviderManagement
    const value = typeof supportsProviderManagement === 'function'
      ? supportsProviderManagement.call(client)
      : Promise.resolve(false)
    this.#providerManagementCapability = { serverId, value }
    return value
  }

  async updatePreferences(patch: KimiPreferencesPatch): Promise<KimiSettingsPreferences> {
    const client = this.runtime.createRestClient()
    let config: KimiConfigSnapshot | null = null
    if (patch.thinkingEffort !== undefined) {
      config = await client.getConfig()
      const thinking = normalizeThinkingConfig(config.thinking)
      if (patch.thinkingEffort === null) {
        delete thinking.effort
      } else {
        thinking.effort = await this.#resolvePrimaryThinkingEffort(client, config.default_model, patch.thinkingEffort)
      }
      config = await client.setConfig({ thinking })
      const effectiveEffort = normalizeThinkingConfig(config.thinking).effort ?? null
      const expectedEffort = typeof thinking.effort === 'string' ? thinking.effort : null
      if (effectiveEffort !== expectedEffort) {
        throw new Error(
          'Kimi Runtime did not apply the requested thinking effort configuration; check environment overrides and Runtime warnings.'
        )
      }
    }
    const wirePatch: Record<string, unknown> = {}
    if (patch.telemetry !== undefined) wirePatch.telemetry = patch.telemetry
    if (patch.defaultPermissionMode !== undefined) {
      wirePatch.default_permission_mode = patch.defaultPermissionMode
    }
    if (patch.defaultPlanMode !== undefined) wirePatch.default_plan_mode = patch.defaultPlanMode
    if (patch.mergeAllAvailableSkills !== undefined) {
      wirePatch.merge_all_available_skills = patch.mergeAllAvailableSkills
    }
    if (Object.keys(wirePatch).length > 0) config = await client.setConfig(wirePatch)
    if (config === null) config = await client.getConfig()
    return mapPreferences(config)
  }

  async #resolvePrimaryThinkingEffort(
    client: ReturnType<KimiRuntimeManager['createRestClient']>,
    defaultModel: string | undefined,
    effort: string
  ): Promise<string> {
    const trimmed = effort.trim()
    if (trimmed.length < 1) throw new TypeError('Invalid Kimi thinking effort')
    if (defaultModel === undefined) return trimmed
    const selected = (await client.listModels()).find((model) => model.model === defaultModel)
    if (selected === undefined) return trimmed
    const supported = selected.support_efforts ?? []
    if (supported.length < 1) {
      throw new TypeError(`Kimi 模型 ${defaultModel} 不支持选择思考强度`)
    }
    const matched = supported.find((item) => item.toLocaleLowerCase() === trimmed.toLocaleLowerCase())
    if (matched === undefined) {
      throw new TypeError(`Kimi 模型 ${defaultModel} 不支持思考强度 ${trimmed}`)
    }
    return matched
  }

  async addProvider(input: AddKimiProviderInput): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    const providers = await client.listProviders()
    if (providers.some((provider) => provider.id === input.id)) {
      throw new Error(`Kimi provider already exists: ${input.id}`)
    }
    if (await this.#getProviderManagementCapability(client)) {
      const resolved = await this.#resolveProviderWriteCatalog(client, {
        providerId: input.id,
        type: input.type,
        baseUrl: input.baseUrl,
        defaultModel: input.defaultModel,
        defaultModelContextSize: input.defaultModelContextSize,
        configuredModels: []
      })
      await client.createProvider({
        id: input.id,
        type: input.type,
        ...(input.baseUrl === undefined ? {} : { base_url: input.baseUrl }),
        ...(input.apiKey === undefined ? {} : { api_key: input.apiKey }),
        default_model: resolved.defaultModel,
        models: resolved.models
      })
      return await this.getSnapshot()
    }
    const provider: Record<string, unknown> = { type: input.type }
    if (input.baseUrl !== undefined) provider.base_url = input.baseUrl
    if (input.apiKey !== undefined) provider.api_key = input.apiKey
    if (input.defaultModel !== undefined) provider.default_model = input.defaultModel
    await client.setConfig({ providers: { [input.id]: provider } })
    await client.refreshProvider(input.id)
    return await this.getSnapshot()
  }

  async updateProvider(input: UpdateKimiProviderInput): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    if (!await this.#getProviderManagementCapability(client)) {
      throw new Error(PROVIDER_DELETE_UNAVAILABLE)
    }
    const providers = await client.listProviders()
    const current = providers.find((provider) => provider.id === input.id)
    if (current === undefined) throw new Error(`Kimi provider not found: ${input.id}`)
    const managedProvider = (await client.getAuth()).managed_provider?.name
    if (input.id === managedProvider) {
      throw new Error('Kimi 内置 Provider 不能编辑，请通过账号设置管理登录状态。')
    }
    const targetId = input.newId ?? input.id
    const targetBaseUrl = input.baseUrl ?? current.base_url
    const resolved = await this.#resolveProviderWriteCatalog(client, {
      providerId: targetId,
      previousProviderId: input.id,
      type: input.type,
      baseUrl: targetBaseUrl,
      defaultModel: input.defaultModel ?? current.default_model,
      defaultModelContextSize: input.defaultModelContextSize,
      configuredModels: (await client.listModels()).filter((model) => model.provider === input.id)
    })
    await client.replaceProvider(input.id, {
      ...(input.newId === undefined || input.newId === input.id ? {} : { new_id: input.newId }),
      type: input.type,
      ...(targetBaseUrl === undefined ? {} : { base_url: targetBaseUrl }),
      ...(input.apiKey === undefined ? {} : { api_key: input.apiKey }),
      default_model: resolved.defaultModel,
      models: resolved.models
    })
    return await this.getSnapshot()
  }

  async #resolveProviderWriteCatalog(
    client: ReturnType<KimiRuntimeManager['createRestClient']>,
    input: {
      providerId: string
      previousProviderId?: string
      type: string
      baseUrl: string | undefined
      defaultModel: string | null | undefined
      defaultModelContextSize: number | undefined
      configuredModels: ModelCatalogItem[]
    }
  ): Promise<ProviderWriteCatalog> {
    const requestedDefault = stripProviderPrefix(
      input.defaultModel ?? '',
      input.previousProviderId ?? input.providerId,
      input.providerId
    )
    const configured = input.configuredModels.map((model) => ({
      model: stripProviderPrefix(model.model, input.previousProviderId ?? input.providerId, input.providerId),
      max_context_size: model.max_context_size,
      ...(model.display_name === undefined ? {} : { display_name: model.display_name }),
      ...(model.capabilities === undefined ? {} : { capabilities: model.capabilities }),
      ...(model.support_efforts === undefined ? {} : { support_efforts: model.support_efforts })
    }))
    const directory = await this.#findProviderDirectory(client, input.providerId, input.baseUrl)
    const directoryModels = directory?.models.map((model) => ({
      model: model.id,
      max_context_size: model.max_context_size,
      ...(model.name === undefined ? {} : { display_name: model.name }),
      ...(model.capabilities === undefined ? {} : { capabilities: model.capabilities })
    })) ?? []
    const models = configured.length > 0 ? configured : directoryModels
    if (requestedDefault.length > 0 && !models.some((model) => model.model === requestedDefault)) {
      const directoryModel = directoryModels.find((model) => model.model === requestedDefault)
      if (directoryModel !== undefined) models.push(directoryModel)
      else if (input.defaultModelContextSize !== undefined) {
        models.push({ model: requestedDefault, max_context_size: input.defaultModelContextSize })
      }
    }
    const defaultModel = requestedDefault || models[0]?.model || ''
    if (models.length < 1 || defaultModel.length < 1) {
      throw new Error(
        `模型服务 ${input.previousProviderId ?? input.providerId} 尚无模型元数据；请输入首个模型别名和上下文 Token 后再保存。`
      )
    }
    if (!models.some((model) => model.model === defaultModel)) {
      throw new Error(
        `模型 ${defaultModel} 不在已知目录中；请填写该模型的上下文 Token 后再保存。`
      )
    }
    return { models, defaultModel }
  }

  async #findProviderDirectory(
    client: ReturnType<KimiRuntimeManager['createRestClient']>,
    providerId: string,
    baseUrl?: string
  ): Promise<Awaited<ReturnType<typeof client.getCatalogProvider>> | null> {
    const candidates = providerDirectoryCandidates(providerId, baseUrl)
    for (const candidate of candidates) {
      try {
        const directory = await client.getCatalogProvider(candidate)
        if (!directory.rejected && directory.models.length > 0) return directory
      } catch {
        // Unknown catalog ids are expected for private OpenAI-compatible endpoints.
      }
    }
    return null
  }

  async deleteProvider(providerId: string): Promise<KimiSettingsSnapshot> {
    const client = this.runtime.createRestClient()
    if (!await this.#getProviderManagementCapability(client)) {
      throw new Error(PROVIDER_DELETE_UNAVAILABLE)
    }
    const providers = await client.listProviders()
    const provider = providers.find((item) => item.id === providerId)
    if (provider === undefined) throw new Error(`Kimi provider not found: ${providerId}`)
    const managedProvider = (await client.getAuth()).managed_provider?.name
    if (providerId === managedProvider) {
      throw new Error('Kimi 内置 Provider 不能删除，请通过账号设置退出登录。')
    }
    await client.deleteProvider(providerId)
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

  async listCatalogProviders(): Promise<KimiCatalogProviderSummary[]> {
    const items = await this.runtime.createRestClient().listCatalogProviders()
    return items.map(mapCatalogProviderSummary)
  }

  async getCatalogProvider(catalogId: string): Promise<KimiCatalogProviderDetail> {
    const item = await this.runtime.createRestClient().getCatalogProvider(catalogId)
    return {
      ...mapCatalogProviderSummary(item),
      models: item.models.map((model) => ({
        id: model.id,
        name: model.name ?? null,
        maxContextSize: model.max_context_size,
        capabilities: model.capabilities ?? [],
        reasoning: model.reasoning
      }))
    }
  }
}

function mapCatalogProviderSummary(item: ProviderDirectoryItem): KimiCatalogProviderSummary {
  return {
    id: item.id,
    name: item.name,
    wireType: item.wire_type,
    needsBaseUrl: item.needs_base_url,
    envKey: item.env_key,
    modelCount: item.models.length,
    rejected: item.rejected,
    rejectReason: item.reject_reason
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
    telemetry: config.telemetry ?? null,
    thinkingEffort: normalizeThinkingConfig(config.thinking).effort ?? null
  }
}

function normalizeThinkingConfig(value: unknown): Record<string, unknown> & { effort?: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = { ...(value as Record<string, unknown>) }
  const effort = record.effort
  if (effort !== undefined && (typeof effort !== 'string' || effort.trim().length < 1)) {
    delete record.effort
  }
  return record as Record<string, unknown> & { effort?: string }
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

function stripProviderPrefix(value: string, ...providerIds: string[]): string {
  for (const providerId of providerIds) {
    const prefix = `${providerId}/`
    if (value.startsWith(prefix)) return value.slice(prefix.length)
  }
  return value
}

function providerDirectoryCandidates(providerId: string, baseUrl?: string): string[] {
  const candidates = new Set<string>()
  const normalizedId = providerId.trim().toLowerCase()
  if (normalizedId.length > 0) candidates.add(normalizedId)
  if (baseUrl !== undefined) {
    try {
      const labels = new URL(baseUrl).hostname.toLowerCase().split('.').filter(Boolean)
      const registrableLabel = labels.at(-2)
      if (registrableLabel !== undefined) candidates.add(registrableLabel)
    } catch {
      // The IPC validator owns URL validity; catalog resolution is best effort.
    }
  }
  return [...candidates]
}
