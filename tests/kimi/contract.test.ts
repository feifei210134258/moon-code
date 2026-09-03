import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertKimiContract,
  validateKimiContract,
  type AsyncApiDocumentLike,
  type OpenApiDocumentLike
} from '../../packages/kimi-adapter/src/contract/validateContract.js'

const openapiPath = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.29.2-openapi.json', import.meta.url)
)
const asyncapiPath = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.29.2-asyncapi.json', import.meta.url)
)
const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDocumentLike
const asyncapi = JSON.parse(readFileSync(asyncapiPath, 'utf8')) as AsyncApiDocumentLike

const openapi036Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.36.0-openapi.json', import.meta.url)
)
const asyncapi036Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.36.0-asyncapi.json', import.meta.url)
)
const openapi036 = JSON.parse(readFileSync(openapi036Path, 'utf8')) as OpenApiDocumentLike
const asyncapi036 = JSON.parse(readFileSync(asyncapi036Path, 'utf8')) as AsyncApiDocumentLike

describe('pinned Kimi 0.29.2 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi, asyncapi)).not.toThrow()
  })

  it('fails explicitly when a core route disappears', () => {
    const withoutSnapshot = structuredClone(openapi)
    delete withoutSnapshot.paths?.['/api/v1/sessions/{session_id}/snapshot']

    expect(validateKimiContract(withoutSnapshot, asyncapi)).toContainEqual({
      location: 'GET /api/v1/sessions/{session_id}/snapshot',
      message: 'Required REST operation is missing'
    })
  })

  it('gates Kimi Skills, Tools, MCP, snapshot Subagents and work lifecycle events', () => {
    const withoutSkillActivation = structuredClone(openapi)
    delete withoutSkillActivation.paths?.['/api/v1/sessions/{session_id}/skills/{tail}']
    expect(validateKimiContract(withoutSkillActivation, asyncapi)).toContainEqual({
      location: 'POST /api/v1/sessions/{session_id}/skills/{tail}',
      message: 'Required REST operation is missing'
    })

    const withoutSessionActions = structuredClone(openapi)
    delete withoutSessionActions.paths?.['/api/v1/sessions/{session_id}']
    expect(validateKimiContract(withoutSessionActions, asyncapi)).toContainEqual({
      location: 'POST /api/v1/sessions/{session_id}:abort',
      message: 'Required session abort action path is missing'
    })

    const withoutRoster = structuredClone(openapi)
    const snapshotJson = JSON.stringify(withoutRoster.paths?.['/api/v1/sessions/{session_id}/snapshot'])
      .replaceAll('subagents', 'removed_roster')
    if (withoutRoster.paths !== undefined) {
      withoutRoster.paths['/api/v1/sessions/{session_id}/snapshot'] = JSON.parse(snapshotJson)
    }
    expect(validateKimiContract(withoutRoster, asyncapi)).toContainEqual({
      location: 'GET /api/v1/sessions/{session_id}/snapshot response.subagents',
      message: 'Required snapshot Subagent roster is missing'
    })

    const withoutWorkEvent = structuredClone(asyncapi)
    const eventJson = JSON.stringify(withoutWorkEvent.components?.messages?.session_event)
      .replaceAll('event.session.work_changed', 'removed.session.work_changed')
    if (withoutWorkEvent.components?.messages !== undefined) {
      withoutWorkEvent.components.messages.session_event = JSON.parse(eventJson)
    }
    expect(validateKimiContract(openapi, withoutWorkEvent)).toContainEqual({
      location: 'components.messages.session_event.event.session.work_changed',
      message: 'Required session event variant is missing'
    })
  })
})

describe('pinned Kimi 0.36.0 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi036, asyncapi036)).not.toThrow()
  })
})

const openapi037Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.37.2-openapi.json', import.meta.url)
)
const asyncapi037Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.37.2-asyncapi.json', import.meta.url)
)
const openapi037 = JSON.parse(readFileSync(openapi037Path, 'utf8')) as OpenApiDocumentLike
const asyncapi037 = JSON.parse(readFileSync(asyncapi037Path, 'utf8')) as AsyncApiDocumentLike

/** 浅层辅助：在 schema 树中查找某个属性名（跳过 responses/security 分支）。 */
function nodeHasProperty(value: unknown, property: string): boolean {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some((item) => nodeHasProperty(item, property))
  const record = value as Record<string, unknown>
  if (Object.prototype.hasOwnProperty.call(record, 'properties')) {
    const properties = record.properties as Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(properties, property)) return true
  }
  return Object.entries(record).some(([key, child]) => {
    if (key === 'responses' || key === 'security') return false
    return nodeHasProperty(child, property)
  })
}

function openApiPostRequestBody(path: string): unknown {
  return (openapi037 as Record<string, any>).paths?.[path]?.post?.requestBody
}

function v2GetParameters(): Record<string, any>[] {
  return (openapi037 as Record<string, any>).paths?.['/api/v2/sessions']?.get?.parameters ?? []
}

describe('pinned Kimi 0.37.2 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi037, asyncapi037)).not.toThrow()
  })

  it('exposes optional skills and prompt_id on the prompt submission body', () => {
    const requestBody = openApiPostRequestBody('/api/v1/sessions/{session_id}/prompts')
    expect(nodeHasProperty(requestBody, 'skills')).toBe(true)
    expect(nodeHasProperty(requestBody, 'prompt_id')).toBe(true)
  })

  it('adds the session media binary endpoint and v2 batch archive/restore actions', () => {
    const paths = (openapi037 as Record<string, any>).paths
    expect(paths?.['/api/v1/sessions/{session_id}/media/{file_id}']?.get).toBeTruthy()
    expect(paths?.['/api/v2/sessions:archive']?.post).toBeTruthy()
    expect(paths?.['/api/v2/sessions:restore']?.post).toBeTruthy()
  })

  it('supports fields/meta.updated_before/page on the v2 list and makes total required', () => {
    const names = v2GetParameters().map((parameter) => parameter.name)
    expect(names).toContain('fields')
    expect(names).toContain('meta.updated_before')
    expect(names).toContain('page')
    const pageSize = v2GetParameters().find((parameter) => parameter.name === 'page_size')
    expect(pageSize?.schema?.maximum).toBe(10_000)

    const operation = (openapi037 as Record<string, any>).paths?.['/api/v2/sessions']?.get
    const data = operation?.responses?.['200']?.content?.['application/json']?.schema
      ?.oneOf?.[0]?.properties?.data
    expect(data?.required).toContain('total')
  })

  it('adds the two new session_event variants and the prompt.id_conflict error code', () => {
    const eventNames = collectConsts(asyncapi037.components?.messages?.session_event)
    expect(eventNames).toContain('event.plugin.changed')
    expect(eventNames).toContain('event.capability.changed')
    const enumText = JSON.stringify(asyncapi037.components?.messages?.session_event)
    expect(enumText).toContain('"prompt.id_conflict"')
  })

  it('carries agent_id/subagent_type/parent_tool_call_id on the task object', () => {
    const tasksOperation = JSON.stringify((openapi037 as Record<string, any>).paths?.['/api/v1/sessions/{session_id}/tasks']?.get)
    expect(tasksOperation).toContain('"agent_id"')
    expect(tasksOperation).toContain('"subagent_type"')
    expect(tasksOperation).toContain('"parent_tool_call_id"')
  })
})

const openapi038Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.38.0-openapi.json', import.meta.url)
)
const asyncapi038Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.38.0-asyncapi.json', import.meta.url)
)
const openapi038 = JSON.parse(readFileSync(openapi038Path, 'utf8')) as OpenApiDocumentLike
const asyncapi038 = JSON.parse(readFileSync(asyncapi038Path, 'utf8')) as AsyncApiDocumentLike

/** 按 const type 收集 session_event 的 payload 变体（含各自 properties/required）。 */
function sessionEventVariants(asyncapi: AsyncApiDocumentLike): Record<string, Record<string, unknown>> {
  const variants: Record<string, Record<string, unknown>> = {}
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    const properties = record.properties as Record<string, unknown> | undefined
    const typeNode = properties?.type as Record<string, unknown> | undefined
    if (typeof typeNode?.const === 'string' && Array.isArray(record.required)) {
      variants[typeNode.const] = record
    }
    for (const child of Object.values(record)) walk(child)
  }
  walk(asyncapi.components?.messages?.session_event)
  return variants
}

describe('pinned Kimi 0.38.0 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi038, asyncapi038)).not.toThrow()
  })

  it('broadcasts the event.session.archived variant with its workspace payload', () => {
    const eventNames = collectConsts(asyncapi038.components?.messages?.session_event)
    expect(eventNames).toContain('event.session.archived')
    const archived = sessionEventVariants(asyncapi038)['event.session.archived']
    expect(archived?.required).toEqual(expect.arrayContaining(['type', 'workspace_id']))
    expect((archived?.properties as Record<string, unknown>)?.workspace_id).toBeTruthy()
  })

  it('marks agentId required on session events and adds promptAttachments to turn.started', () => {
    const variants = sessionEventVariants(asyncapi038)
    const turnStarted = variants['turn.started']
    expect(turnStarted?.required).toContain('agentId')
    expect((turnStarted?.properties as Record<string, unknown>)?.promptAttachments).toBeTruthy()
    expect(variants['turn.ended']?.required).toContain('agentId')
    expect(variants['tool.progress']?.required).toContain('agentId')
    expect(variants['shell.output']?.required).toContain('agentId')
    expect(variants['prompt.completed']?.required).toContain('agentId')
    expect(variants['goal.updated']?.required).toContain('agentId')
    /* subagent.* 保持 subagentId 坐标，0.38.0 不新增 agentId */
    expect(variants['subagent.completed']?.required).not.toContain('agentId')
  })

  it('adds optional replace to the tool.progress / shell.output update object', () => {
    const variants = sessionEventVariants(asyncapi038)
    const progressUpdate = (variants['tool.progress']?.properties as Record<string, unknown> | undefined)?.update as
      Record<string, unknown> | undefined
    expect((progressUpdate?.properties as Record<string, unknown> | undefined)?.replace).toBeTruthy()
    const shellUpdate = (variants['shell.output']?.properties as Record<string, unknown> | undefined)?.update as
      Record<string, unknown> | undefined
    expect((shellUpdate?.properties as Record<string, unknown> | undefined)?.replace).toBeTruthy()
  })

  it('adds the v2 sessions view/group.page_size/meta.has_prompt parameters and the by_workspace page', () => {
    const operation = (openapi038 as Record<string, any>).paths?.['/api/v2/sessions']?.get
    const names = (operation?.parameters ?? []).map((parameter: { name: string }) => parameter.name)
    expect(names).toContain('view')
    expect(names).toContain('group.page_size')
    expect(names).toContain('meta.has_prompt')
    const data = operation?.responses?.['200']?.content?.['application/json']?.schema
      ?.oneOf?.[0]?.properties?.data
    const branches = data?.anyOf ?? []
    expect(branches.some((branch: { properties?: Record<string, string> }) => branch.properties?.items)).toBe(true)
    expect(branches.some((branch: { properties?: Record<string, string> }) => branch.properties?.groups)).toBe(true)
  })

  it('adds the OAuth region endpoint and the login region body', () => {
    const paths = (openapi038 as Record<string, any>).paths
    expect(paths?.['/api/v1/oauth/region']?.get).toBeTruthy()
    const regionBody = (paths as Record<string, any>)['/api/v1/oauth/login']?.post?.requestBody
    expect(nodeHasProperty(regionBody, 'region')).toBe(true)
  })

  it('drops context_limit and context_usage from the required field sets', () => {
    const openapi038Text = JSON.stringify(openapi038)
    /* usage：required 收窄为 input/output/cache/context_tokens 四件套（无 context_limit） */
    expect(openapi038Text).toContain(
      '"required":["input_tokens","output_tokens","cache_read_tokens","cache_creation_tokens","context_tokens"]'
    )
    /* status：required 不再包含 context_usage */
    expect(openapi038Text).toContain(
      '"required":["busy","thinking_level","permission","plan_mode","swarm_mode","context_tokens"]'
    )
    expect(openapi038Text).not.toContain('"context_usage"]')
  })
})

function collectConsts(value: unknown, result = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return result
  const record = value as Record<string, unknown>
  if (typeof record.const === 'string') result.add(record.const)
  for (const child of Object.values(record)) collectConsts(child, result)
  return result
}

const openapi040Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.40.1-openapi.json', import.meta.url)
)
const asyncapi040Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.40.1-asyncapi.json', import.meta.url)
)
const openapi040 = JSON.parse(readFileSync(openapi040Path, 'utf8')) as OpenApiDocumentLike
const asyncapi040 = JSON.parse(readFileSync(asyncapi040Path, 'utf8')) as AsyncApiDocumentLike

describe('pinned Kimi 0.40.1 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi040, asyncapi040)).not.toThrow()
  })

  it('broadcasts the config/model-catalog global events with their payloads', () => {
    const variants = sessionEventVariants(asyncapi040)
    expect(variants['event.config.changed']?.required).toEqual(expect.arrayContaining(['type', 'changedFields', 'config']))
    expect(variants['event.config.warning']?.required).toEqual(expect.arrayContaining(['type', 'warnings']))
    expect(variants['event.model_catalog.changed']?.required)
      .toEqual(expect.arrayContaining(['type', 'changed', 'unchanged', 'failed']))
  })

  it('widens turn.started promptAttachments with the path-referenced file branch', () => {
    const variants = sessionEventVariants(asyncapi040)
    const attachments = (variants['turn.started']?.properties as Record<string, any> | undefined)
      ?.promptAttachments as Record<string, any> | undefined
    const branches = attachments?.items?.anyOf ?? []
    expect(branches.some((branch: any) => branch.properties?.kind?.const === 'file')).toBe(true)
    const fileBranch = branches.find((branch: any) => branch.properties?.kind?.const === 'file')
    expect(fileBranch?.required).toEqual(['kind', 'name', 'mediaType', 'size', 'path'])
  })

  it('renames the auth readiness fields (0.39.1: ready→models_ready, default_model dropped)', () => {
    const data = (openapi040 as Record<string, any>).paths?.['/api/v1/auth']?.get
      ?.responses?.['200']?.content?.['application/json']?.schema?.properties?.data
    expect(data?.properties?.models_ready).toBeTruthy()
    expect(data?.properties?.managed_provider).toBeTruthy()
    expect(data?.properties?.ready).toBeUndefined()
    expect(data?.required).toContain('models_ready')
  })

  it('adds the path source variant to prompt/message attachments (0.40.1)', () => {
    const promptBody = JSON.stringify(
      (openapi040 as Record<string, any>).paths?.['/api/v1/sessions/{session_id}/prompts']?.post?.requestBody
    )
    expect(promptBody).toContain('"path"')
  })
})
