import type {
  AddKimiProviderInput,
  KimiOAuthRegion,
  KimiPreferencesPatch,
  KimiProviderModelInput,
  KimiProviderType,
  KimiSecondaryModelUpdateInput,
  UpdateKimiProviderInput
} from '../../shared/contracts.js'

const PROVIDER_TYPES = new Set<KimiProviderType>([
  'anthropic',
  'openai',
  'kimi',
  'google-genai',
  'openai_responses',
  'vertexai'
])
// 新建/重命名 Provider 的 id 规则与 Kimi Runtime 服务端契约保持一致
//（packages/kimi-adapter/contracts/*-openapi.json 中 createProvider 的 pattern：
// ^[\p{L}\p{N}][\p{L}\p{N}\-_ ]*$）。本地只放行服务端能接受的值，避免
// 本地校验通过、服务端再拒绝（例如带 "." 或 ":" 的 id），也放行服务端允许、
// 旧版客户端却拒绝的合法 id（例如中文名或带空格的名称）。
const NEW_PROVIDER_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\-_ ]*$/u
const NEW_PROVIDER_ID_MAX_LENGTH = 128
// 既有 Provider（可能来自手工编辑的 config.toml，如 "managed:kimi-code"）只要求
// 非空、可安全进入 URL 路径；删除/刷新/编辑等操作以服务端返回的 id 为准。
const PROVIDER_ID_MAX_LENGTH = 256

export function validateModelId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.includes('\0')) {
    throw new TypeError('Invalid Kimi model id')
  }
  return value
}

export function validateSecondaryModelInput(value: unknown): KimiSecondaryModelUpdateInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi secondary model input')
  const allowed = new Set(['model', 'defaultEffort', 'maxOutputSize'])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Invalid Kimi secondary model input')
  }
  const model = validateModelId(value.model).trim()
  if (model.length < 1) throw new TypeError('Invalid Kimi secondary model id')
  const defaultEffort = optionalString(value.defaultEffort, 'secondary effort', 128)
  const maxOutputSize = value.maxOutputSize
  if (maxOutputSize !== undefined && (
    typeof maxOutputSize !== 'number' ||
    !Number.isInteger(maxOutputSize) ||
    maxOutputSize < 1 ||
    maxOutputSize > 16_777_216
  )) {
    throw new TypeError('Invalid Kimi secondary max output size')
  }
  return {
    model,
    ...(defaultEffort === undefined ? {} : { defaultEffort }),
    ...(maxOutputSize === undefined ? {} : { maxOutputSize })
  }
}

export function validateProviderId(value: unknown, optional = false): string | undefined {
  if (value === undefined && optional) return undefined
  if (typeof value !== 'string' || value.length < 1 || value.length > PROVIDER_ID_MAX_LENGTH || value.includes('\0')) {
    throw new TypeError('Invalid Kimi provider id')
  }
  return value
}

export function validateNewProviderId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > NEW_PROVIDER_ID_MAX_LENGTH ||
    !NEW_PROVIDER_ID_PATTERN.test(value)
  ) {
    throw new TypeError('连接名称只能包含文字、数字、空格以及 - 和 _，且必须以文字或数字开头')
  }
  return value
}

export function validateCatalogId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > PROVIDER_ID_MAX_LENGTH || value.includes('\0')) {
    throw new TypeError('Invalid Kimi catalog id')
  }
  return value
}

/** OAuth 登录区域（0.38.0+）。未提供（undefined）时返回 undefined，
 *  只放行协议快照声明的 `mainland-cn` / `global` 两个值。 */
export function validateOAuthRegion(value: unknown): KimiOAuthRegion | undefined {
  if (value === undefined) return undefined
  if (value !== 'mainland-cn' && value !== 'global') {
    throw new TypeError('Invalid Kimi OAuth region')
  }
  return value
}

export function validateAddProviderInput(value: unknown): AddKimiProviderInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi provider input')
  const id = validateNewProviderId(value.id)
  const type = value.type
  if (typeof type !== 'string' || !PROVIDER_TYPES.has(type as KimiProviderType)) {
    throw new TypeError('Invalid Kimi provider type')
  }
  const baseUrl = optionalString(value.baseUrl, 'base URL', 2_048)
  if (baseUrl !== undefined) validateProviderUrl(baseUrl)
  const apiKey = optionalString(value.apiKey, 'API key', 8_192)
  const defaultModel = value.defaultModel === undefined || value.defaultModel === ''
    ? undefined
    : validateModelId(value.defaultModel)
  const defaultModelContextSize = validateOptionalContextSize(value.defaultModelContextSize)
  const models = validateProviderModelsInput(value.models)
  return {
    id,
    type: type as KimiProviderType,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(defaultModel === undefined ? {} : { defaultModel }),
    ...(defaultModelContextSize === undefined ? {} : { defaultModelContextSize }),
    ...(models === undefined ? {} : { models })
  }
}

export function validateUpdateProviderInput(value: unknown): UpdateKimiProviderInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi provider update input')
  const allowed = new Set(['id', 'newId', 'type', 'baseUrl', 'apiKey', 'defaultModel', 'defaultModelContextSize', 'models'])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Invalid Kimi provider update input')
  }
  const id = validateProviderId(value.id)
  const newId = value.newId === undefined ? undefined : validateNewProviderId(value.newId)
  const type = value.type
  if (typeof type !== 'string' || !PROVIDER_TYPES.has(type as KimiProviderType)) {
    throw new TypeError('Invalid Kimi provider type')
  }
  const baseUrl = optionalString(value.baseUrl, 'base URL', 2_048)
  if (baseUrl !== undefined) validateProviderUrl(baseUrl)
  const apiKey = optionalString(value.apiKey, 'API key', 8_192)
  const defaultModel = value.defaultModel === undefined || value.defaultModel === ''
    ? undefined
    : validateModelId(value.defaultModel)
  const defaultModelContextSize = validateOptionalContextSize(value.defaultModelContextSize)
  const models = validateProviderModelsInput(value.models)
  return {
    id: id!,
    ...(newId === undefined ? {} : { newId }),
    type: type as KimiProviderType,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(defaultModel === undefined ? {} : { defaultModel }),
    ...(defaultModelContextSize === undefined ? {} : { defaultModelContextSize }),
    ...(models === undefined ? {} : { models })
  }
}

export function validatePreferencesPatch(value: unknown): KimiPreferencesPatch {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi preferences patch')
  const allowed = new Set([
    'telemetry',
    'defaultPermissionMode',
    'defaultPlanMode',
    'mergeAllAvailableSkills',
    'thinkingEffort'
  ])
  if (Object.keys(value).length < 1 || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Invalid Kimi preferences patch')
  }
  const patch: KimiPreferencesPatch = {}
  if (value.telemetry !== undefined) patch.telemetry = booleanValue(value.telemetry, 'telemetry')
  if (value.defaultPlanMode !== undefined) {
    patch.defaultPlanMode = booleanValue(value.defaultPlanMode, 'default plan mode')
  }
  if (value.mergeAllAvailableSkills !== undefined) {
    patch.mergeAllAvailableSkills = booleanValue(value.mergeAllAvailableSkills, 'skill merge mode')
  }
  if (value.defaultPermissionMode !== undefined) {
    const mode = value.defaultPermissionMode
    if (mode !== 'manual' && mode !== 'auto' && mode !== 'yolo') {
      throw new TypeError('Invalid Kimi default permission mode')
    }
    patch.defaultPermissionMode = mode
  }
  if (value.thinkingEffort !== undefined) {
    const effort = value.thinkingEffort
    if (effort === null) {
      patch.thinkingEffort = null
    } else {
      if (typeof effort !== 'string' || effort.trim().length < 1 || effort.length > 128 || effort.includes('\0')) {
        throw new TypeError('Invalid Kimi thinking effort')
      }
      patch.thinkingEffort = effort.trim()
    }
  }
  return patch
}

export function validateProviderRefreshInput(
  value: unknown
): { scope: 'all' | 'oauth' | 'provider'; providerId?: string } {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi provider refresh input')
  const scope = value.scope
  if (scope !== 'all' && scope !== 'oauth' && scope !== 'provider') {
    throw new TypeError('Invalid Kimi provider refresh scope')
  }
  const providerId = validateProviderId(value.providerId, scope !== 'provider')
  if (scope === 'provider' && providerId === undefined) throw new TypeError('Invalid Kimi provider id')
  return { scope, ...(providerId === undefined ? {} : { providerId }) }
}

function validateProviderUrl(value: string): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new TypeError('Invalid Kimi provider base URL')
  }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
      url.username.length > 0 || url.password.length > 0 || url.search.length > 0 || url.hash.length > 0) {
    throw new TypeError('Invalid Kimi provider base URL')
  }
}

function validateOptionalContextSize(value: unknown): number | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 16_777_216) {
    throw new TypeError('Invalid Kimi provider model context size')
  }
  return value
}

const PROVIDER_MODELS_MAX = 64

/**
 * 显式模型清单校验。空数组等价于未提供（回退到目录补全/单模型路径）；
 * 重复的模型别名会被服务端拒绝，这里提前拦截。
 */
function validateProviderModelsInput(value: unknown): KimiProviderModelInput[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > PROVIDER_MODELS_MAX) {
    throw new TypeError('Invalid Kimi provider models')
  }
  if (value.length < 1) return undefined
  const seen = new Set<string>()
  return value.map((entry) => {
    if (!isRecord(entry)) throw new TypeError('Invalid Kimi provider model entry')
    const allowed = new Set(['model', 'maxContextSize', 'displayName', 'capabilities', 'supportEfforts'])
    if (Object.keys(entry).some((key) => !allowed.has(key))) {
      throw new TypeError('Invalid Kimi provider model entry')
    }
    const model = validateModelId(entry.model).trim()
    if (model.length < 1) throw new TypeError('Invalid Kimi provider model id')
    if (seen.has(model)) throw new TypeError(`模型 ${model} 在清单中重复`)
    seen.add(model)
    const maxContextSize = validateOptionalContextSize(entry.maxContextSize)
    if (maxContextSize === undefined) throw new TypeError('Invalid Kimi provider model context size')
    const displayName = optionalString(entry.displayName, 'model display name', 256)
    return {
      model,
      maxContextSize,
      ...(displayName === undefined ? {} : { displayName }),
      ...(entry.capabilities === undefined ? {} : { capabilities: validateStringList(entry.capabilities, 'capabilities') }),
      ...(entry.supportEfforts === undefined ? {} : { supportEfforts: validateStringList(entry.supportEfforts, 'supportEfforts') })
    }
  })
}

function validateStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError(`Invalid Kimi provider model ${label}`)
  return value.map((item) => {
    if (typeof item !== 'string' || item.length < 1 || item.length > 128 || item.includes('\0')) {
      throw new TypeError(`Invalid Kimi provider model ${label}`)
    }
    return item
  })
}

function optionalString(value: unknown, label: string, maxLength: number): string | undefined {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) {
    throw new TypeError(`Invalid Kimi provider ${label}`)
  }
  const trimmed = value.trim()
  if (trimmed.length < 1) throw new TypeError(`Invalid Kimi provider ${label}`)
  return trimmed
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`Invalid Kimi ${label}`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
