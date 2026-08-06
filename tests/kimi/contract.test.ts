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

const openapi033Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.33.0-openapi.json', import.meta.url)
)
const asyncapi033Path = fileURLToPath(
  new URL('../../packages/kimi-adapter/contracts/kimi-0.33.0-asyncapi.json', import.meta.url)
)
const openapi033 = JSON.parse(readFileSync(openapi033Path, 'utf8')) as OpenApiDocumentLike
const asyncapi033 = JSON.parse(readFileSync(asyncapi033Path, 'utf8')) as AsyncApiDocumentLike

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

describe('pinned Kimi 0.33.0 contract', () => {
  it('contains every route and WebSocket message required by the desktop foundation', () => {
    expect(() => assertKimiContract(openapi033, asyncapi033)).not.toThrow()
  })
})
