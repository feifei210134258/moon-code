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

function collectConsts(value: unknown, result = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return result
  const record = value as Record<string, unknown>
  if (typeof record.const === 'string') result.add(record.const)
  for (const child of Object.values(record)) collectConsts(child, result)
  return result
}
