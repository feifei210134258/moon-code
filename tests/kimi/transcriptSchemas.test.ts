import { describe, expect, it } from 'vitest'
import {
  sessionTodoItemSchema,
  sessionTranscriptSchema
} from '../../packages/kimi-adapter/src/wire/schemas.js'

describe('Kimi transcript schemas', () => {
  it('fills missing transcript fields with empty defaults instead of failing', () => {
    const parsed = sessionTranscriptSchema.parse({ agent_id: 'main' })

    expect(parsed).toEqual({
      agent_id: 'main',
      items: [],
      has_more: false,
      tasks: [],
      interactions: [],
      attachments: [],
      todos: [],
      meta: {},
      agents: [],
      pending_interactions: []
    })
  })

  it('accepts pending_interactions as a string array (server sends interaction ids)', () => {
    const parsed = sessionTranscriptSchema.parse({
      agent_id: 'main',
      pending_interactions: ['approval-1', 'question-2']
    })

    expect(parsed.pending_interactions).toEqual(['approval-1', 'question-2'])
  })

  it('drops transcript items with unknown kinds instead of failing the whole array', () => {
    const parsed = sessionTranscriptSchema.parse({
      agent_id: 'main',
      items: [
        { kind: 'marker', markerId: 'marker-1', marker: 'history_compacted' },
        { kind: 'weird_new_kind', anything: true },
        { kind: 'taskref', refId: 'ref-1', taskId: 'task-1' }
      ]
    })

    expect(parsed.items).toEqual([
      { kind: 'marker', markerId: 'marker-1', marker: 'history_compacted' },
      { kind: 'taskref', refId: 'ref-1', taskId: 'task-1' }
    ])
  })

  it('normalizes todo items: title falls back to content, completed variants map to done', () => {
    expect(sessionTodoItemSchema.parse({ content: 'Ship it', status: 'completed' })).toEqual({
      title: 'Ship it',
      status: 'done'
    })
    expect(sessionTodoItemSchema.parse({ title: 'Keep title', status: 'complete' })).toEqual({
      title: 'Keep title',
      status: 'done'
    })
    expect(sessionTodoItemSchema.parse({ title: 'Finished one', status: 'finished' })).toEqual({
      title: 'Finished one',
      status: 'done'
    })
    expect(sessionTodoItemSchema.parse({ title: 'Plain', status: 'in_progress' })).toEqual({
      title: 'Plain',
      status: 'in_progress'
    })
  })

  it('still rejects todo items that carry neither title nor content', () => {
    expect(sessionTodoItemSchema.safeParse({ status: 'pending' }).success).toBe(false)
    expect(sessionTodoItemSchema.safeParse({ title: 'Bad status', status: 'weird' }).success).toBe(false)
  })

  it('normalizes todo items inside a transcript todos array', () => {
    const parsed = sessionTranscriptSchema.parse({
      agent_id: 'main',
      todos: [{
        todoId: 'todo-1',
        items: [
          { content: 'Via content', status: 'completed' },
          { title: 'Via title', status: 'done' }
        ]
      }]
    })

    expect(parsed.todos[0]?.items).toEqual([
      { title: 'Via content', status: 'done' },
      { title: 'Via title', status: 'done' }
    ])
  })
})
