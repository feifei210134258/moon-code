import type {
  KimiMcpConfig,
  KimiMcpServerInput
} from '../../shared/contracts.js'

const MAX_MCP_NAME = 128
const MAX_MCP_URL = 2_048
const MAX_MCP_COMMAND = 512
const MAX_MCP_ARG = 2_048
const MAX_MCP_ENV_KEY = 128
const MAX_MCP_ENV_VALUE = 4_096
const MAX_MCP_TIMEOUT_MS = 2_147_483_647

export function validateMcpServerName(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid MCP server name')
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > MAX_MCP_NAME) throw new TypeError('Invalid MCP server name')
  return trimmed
}

export function validateMcpFlowId(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid MCP auth flow id')
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > 256) throw new TypeError('Invalid MCP auth flow id')
  return trimmed
}

export function validateMcpServerInput(value: unknown): KimiMcpServerInput {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid MCP server input')
  }
  const record = value as Record<string, unknown>
  return { name: validateMcpServerName(record.name), config: validateMcpConfig(record.config) }
}

export function validateMcpConfig(value: unknown): KimiMcpConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Invalid MCP server config')
  }
  const record = value as Record<string, unknown>
  const transport = record.transport
  if (transport === 'stdio') return validateStdioConfig(record)
  if (transport === 'http') return validateHttpConfig(record)
  if (transport === 'sse') return validateSseConfig(record)
  throw new TypeError('Invalid MCP server transport')
}

function validateStdioConfig(record: Record<string, unknown>): KimiMcpConfig {
  return {
    transport: 'stdio',
    command: boundedString(record.command, MAX_MCP_COMMAND, 'MCP command'),
    ...(record.args === undefined ? {} : { args: stringArray(record.args, MAX_MCP_ARG, 'MCP args') }),
    ...(record.env === undefined ? {} : { env: stringRecord(record.env, 'MCP env') }),
    ...(record.cwd === undefined ? {} : { cwd: boundedString(record.cwd, MAX_MCP_URL, 'MCP cwd') }),
    ...(record.executor === 'local' || record.executor === 'kaos' ? { executor: record.executor } : {}),
    ...enabledField(record),
    ...timeoutFields(record),
    ...toolFilterFields(record)
  } satisfies KimiMcpConfig
}

function validateHttpConfig(record: Record<string, unknown>): KimiMcpConfig {
  return {
    transport: 'http',
    url: boundedString(record.url, MAX_MCP_URL, 'MCP url'),
    ...(record.headers === undefined ? {} : { headers: stringRecord(record.headers, 'MCP headers') }),
    ...(record.auth === 'oauth' ? { auth: 'oauth' } : {}),
    ...(record.bearerTokenEnvVar === undefined
      ? {}
      : { bearerTokenEnvVar: boundedString(record.bearerTokenEnvVar, MAX_MCP_ENV_KEY, 'MCP bearer env var') }),
    ...enabledField(record),
    ...timeoutFields(record),
    ...toolFilterFields(record)
  } satisfies KimiMcpConfig
}

function validateSseConfig(record: Record<string, unknown>): KimiMcpConfig {
  return {
    transport: 'sse',
    url: boundedString(record.url, MAX_MCP_URL, 'MCP url'),
    ...(record.headers === undefined ? {} : { headers: stringRecord(record.headers, 'MCP headers') }),
    ...enabledField(record),
    ...timeoutFields(record),
    ...toolFilterFields(record)
  } satisfies KimiMcpConfig
}

interface McpCommonOptionalFields {
  enabled?: boolean
  startupTimeoutMs?: number
  toolTimeoutMs?: number
  enabledTools?: string[]
  disabledTools?: string[]
}

function timeoutFields(record: Record<string, unknown>): Pick<
  McpCommonOptionalFields,
  'startupTimeoutMs' | 'toolTimeoutMs'
> {
  return {
    ...(record.startupTimeoutMs === undefined
      ? {}
      : { startupTimeoutMs: timeoutValue(record.startupTimeoutMs, 'MCP startup timeout') }),
    ...(record.toolTimeoutMs === undefined
      ? {}
      : { toolTimeoutMs: timeoutValue(record.toolTimeoutMs, 'MCP tool timeout') })
  }
}

function toolFilterFields(record: Record<string, unknown>): Pick<
  McpCommonOptionalFields,
  'enabledTools' | 'disabledTools'
> {
  return {
    ...(record.enabledTools === undefined
      ? {}
      : { enabledTools: stringArray(record.enabledTools, MAX_MCP_ARG, 'MCP enabled tools') }),
    ...(record.disabledTools === undefined
      ? {}
      : { disabledTools: stringArray(record.disabledTools, MAX_MCP_ARG, 'MCP disabled tools') })
  }
}

function enabledField(record: Record<string, unknown>): Pick<McpCommonOptionalFields, 'enabled'> {
  return record.enabled === undefined ? {} : { enabled: booleanValue(record.enabled, 'MCP enabled') }
}

function boundedString(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`Invalid ${label}`)
  return value
}

function timeoutValue(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_MCP_TIMEOUT_MS) {
    throw new TypeError(`Invalid ${label}`)
  }
  return value
}

function stringArray(value: unknown, max: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > 256) throw new TypeError(`Invalid ${label}`)
  return value.map((item) => boundedString(item, max, label))
}

function stringRecord(value: unknown, label: string): Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Invalid ${label}`)
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key.length < 1 || key.length > MAX_MCP_ENV_KEY) throw new TypeError(`Invalid ${label}`)
    if (typeof item !== 'string' || item.length > MAX_MCP_ENV_VALUE) throw new TypeError(`Invalid ${label}`)
    result[key] = item
  }
  return result
}
