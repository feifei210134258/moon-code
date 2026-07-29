import type {
  AddKimiProviderInput,
  KimiPreferencesPatch,
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
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

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
  if (typeof value !== 'string' || !PROVIDER_ID_PATTERN.test(value)) {
    throw new TypeError('Invalid Kimi provider id')
  }
  return value
}

export function validateAddProviderInput(value: unknown): AddKimiProviderInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi provider input')
  const id = validateProviderId(value.id)
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
  return {
    id: id!,
    type: type as KimiProviderType,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(defaultModel === undefined ? {} : { defaultModel })
  }
}

export function validateUpdateProviderInput(value: unknown): UpdateKimiProviderInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi provider update input')
  const allowed = new Set(['id', 'newId', 'type', 'baseUrl', 'apiKey', 'defaultModel'])
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new TypeError('Invalid Kimi provider update input')
  }
  const id = validateProviderId(value.id)
  const newId = value.newId === undefined ? undefined : validateProviderId(value.newId)
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
  return {
    id: id!,
    ...(newId === undefined ? {} : { newId }),
    type: type as KimiProviderType,
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(defaultModel === undefined ? {} : { defaultModel })
  }
}

export function validatePreferencesPatch(value: unknown): KimiPreferencesPatch {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi preferences patch')
  const allowed = new Set([
    'telemetry',
    'defaultPermissionMode',
    'defaultPlanMode',
    'mergeAllAvailableSkills'
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
