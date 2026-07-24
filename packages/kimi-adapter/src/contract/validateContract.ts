export interface OpenApiDocumentLike {
  openapi?: unknown
  paths?: Record<string, Record<string, unknown>>
}

export interface AsyncApiDocumentLike {
  asyncapi?: unknown
  channels?: Record<string, unknown>
  operations?: Record<string, unknown>
  components?: {
    messages?: Record<string, unknown>
  }
}

export interface ContractFinding {
  location: string
  message: string
}

const requiredRestOperations: ReadonlyArray<readonly [path: string, method: string]> = [
  ['/api/v1/healthz', 'get'],
  ['/api/v1/meta', 'get'],
  ['/api/v1/auth', 'get'],
  ['/api/v1/config', 'get'],
  ['/api/v1/config', 'post'],
  ['/api/v1/models', 'get'],
  ['/api/v1/models/{tail}', 'post'],
  ['/api/v1/providers', 'get'],
  ['/api/v1/providers{action}', 'post'],
  ['/api/v1/providers/{tail}', 'post'],
  ['/api/v1/providers/{provider_id}', 'get'],
  ['/api/v1/oauth/login', 'get'],
  ['/api/v1/oauth/login', 'post'],
  ['/api/v1/oauth/login', 'delete'],
  ['/api/v1/oauth/logout', 'post'],
  ['/api/v1/workspaces', 'get'],
  ['/api/v1/workspaces/{workspace_id}/skills', 'get'],
  ['/api/v1/sessions', 'get'],
  ['/api/v1/sessions', 'post'],
  ['/api/v1/sessions/{session_id}/skills', 'get'],
  ['/api/v1/sessions/{session_id}/skills/{tail}', 'post'],
  ['/api/v1/sessions/{session_id}/snapshot', 'get'],
  ['/api/v1/sessions/{session_id}/transcript', 'get'],
  ['/api/v1/sessions/{session_id}/prompts', 'post'],
  ['/api/v1/sessions/{session_id}/prompts:steer', 'post'],
  ['/api/v1/sessions/{session_id}/approvals/{approval_id}', 'post'],
  ['/api/v1/sessions/{session_id}/questions/{tail}', 'post'],
  ['/api/v1/sessions/{session_id}/{tail}', 'post'],
  ['/api/v1/sessions/{session_id}/terminals', 'get'],
  ['/api/v1/sessions/{session_id}/terminals', 'post'],
  ['/api/v1/sessions/{session_id}/terminals/{terminal_id}', 'get'],
  ['/api/v1/sessions/{session_id}/terminals/{tail}', 'post'],
  ['/api/v1/tools', 'get'],
  ['/api/v1/mcp/servers', 'get'],
  ['/api/v1/mcp/servers/{tail}', 'post'],
  ['/api/v1/fs:content', 'get'],
  ['/api/v1/oauth/usage', 'get'],
  ['/api/v1/shutdown', 'post']
]

const requiredSessionEvents = [
  'event.session.work_changed',
  'agent.status.updated',
  'subagent.spawned',
  'subagent.started',
  'subagent.suspended',
  'subagent.completed',
  'subagent.failed',
  'task.started',
  'turn.started',
  'turn.ended'
] as const

const requiredWsMessages = [
  'client_hello',
  'server_hello',
  'subscribe',
  'subscribe_ack',
  'session_event',
  'resync_required',
  'ping',
  'pong',
  'error',
  'terminal_attach',
  'terminal_detach',
  'terminal_input',
  'terminal_resize',
  'terminal_close'
] as const

export function validateKimiContract(
  openapi: OpenApiDocumentLike,
  asyncapi: AsyncApiDocumentLike
): ContractFinding[] {
  const findings: ContractFinding[] = []
  if (typeof openapi.openapi !== 'string') {
    findings.push({ location: 'openapi', message: 'OpenAPI version is missing' })
  }

  for (const [path, method] of requiredRestOperations) {
    if (openapi.paths?.[path]?.[method] === undefined) {
      findings.push({ location: `${method.toUpperCase()} ${path}`, message: 'Required REST operation is missing' })
    }
  }

  // Kimi 0.29 emits GET /sessions/{session_id} and POST /sessions/{tail}
  // under the same normalized OpenAPI path. Presence of this path guards the
  // session-level :abort dispatcher; the exact POST URL is covered by the
  // typed REST client and Runtime integration tests.
  if (openapi.paths?.['/api/v1/sessions/{session_id}'] === undefined) {
    findings.push({
      location: 'POST /api/v1/sessions/{session_id}:abort',
      message: 'Required session abort action path is missing'
    })
  }

  const snapshotOperation = openapi.paths?.['/api/v1/sessions/{session_id}/snapshot']?.get
  if (!hasObjectKey(snapshotOperation, 'subagents')) {
    findings.push({
      location: 'GET /api/v1/sessions/{session_id}/snapshot response.subagents',
      message: 'Required snapshot Subagent roster is missing'
    })
  }

  if (asyncapi.channels?.kimiCodeWebSocket === undefined) {
    findings.push({ location: 'channels.kimiCodeWebSocket', message: 'Required WebSocket channel is missing' })
  }
  if (asyncapi.operations?.receiveClientMessages === undefined) {
    findings.push({ location: 'operations.receiveClientMessages', message: 'Client receive operation is missing' })
  }
  if (asyncapi.operations?.sendServerMessages === undefined) {
    findings.push({ location: 'operations.sendServerMessages', message: 'Server send operation is missing' })
  }

  for (const message of requiredWsMessages) {
    if (asyncapi.components?.messages?.[message] === undefined) {
      findings.push({ location: `components.messages.${message}`, message: 'Required WebSocket message is missing' })
    }
  }

  const sessionEventTypes = collectStringConsts(asyncapi.components?.messages?.session_event)
  for (const eventType of requiredSessionEvents) {
    if (!sessionEventTypes.has(eventType)) {
      findings.push({
        location: `components.messages.session_event.${eventType}`,
        message: 'Required session event variant is missing'
      })
    }
  }

  return findings
}

function hasObjectKey(value: unknown, key: string): boolean {
  if (value === null || typeof value !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(value, key)) return true
  return Object.values(value).some((child) => hasObjectKey(child, key))
}

function collectStringConsts(value: unknown, result = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return result
  const record = value as Record<string, unknown>
  if (typeof record.const === 'string') result.add(record.const)
  for (const child of Object.values(record)) collectStringConsts(child, result)
  return result
}

export function assertKimiContract(openapi: OpenApiDocumentLike, asyncapi: AsyncApiDocumentLike): void {
  const findings = validateKimiContract(openapi, asyncapi)
  if (findings.length === 0) return
  const detail = findings.map((finding) => `${finding.location}: ${finding.message}`).join('\n')
  throw new Error(`Kimi contract validation failed:\n${detail}`)
}
