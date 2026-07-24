import { describe, expect, it } from 'vitest'
import { TranscriptProjector } from '../../packages/kimi-adapter/src/projector/TranscriptProjector.js'
import type { SessionSnapshot } from '../../packages/kimi-adapter/src/wire/schemas.js'
import type { SessionEventFrame } from '../../packages/kimi-adapter/src/wire/ws.js'

function snapshot(seq = 10): SessionSnapshot {
  return {
    as_of_seq: seq,
    epoch: 'epoch-1',
    session: {
      id: 'session-1',
      workspace_id: 'workspace-1',
      title: 'Real session',
      created_at: '2026-07-23T00:00:00.000Z',
      updated_at: '2026-07-23T00:01:00.000Z',
      busy: true,
      main_turn_active: true,
      pending_interaction: 'none',
      metadata: { cwd: '/workspace' },
      agent_config: { model: 'kimi-code' },
      usage: { input_tokens: 1, output_tokens: 2, context_tokens: 3, context_limit: 100 },
      permission_rules: [],
      message_count: 1,
      last_seq: seq
    },
    messages: {
      items: [{
        id: 'user-1',
        session_id: 'session-1',
        role: 'user',
        content: [{ type: 'text', text: 'Build it' }],
        created_at: '2026-07-23T00:00:00.000Z'
      }],
      has_more: false
    },
    in_flight_turn: {
      turn_id: 2,
      assistant_text: 'Hello',
      thinking_text: 'Plan',
      running_tools: [{ tool_call_id: 'tool-1', name: 'Read', args: { path: 'README.md' } }],
      current_prompt_id: 'prompt-1'
    },
    pending_approvals: [],
    pending_questions: []
  }
}

function frame(type: string, payload: Record<string, unknown>, offset?: number): SessionEventFrame {
  return {
    type,
    seq: 10,
    epoch: 'epoch-1',
    volatile: offset !== undefined,
    ...(offset === undefined ? {} : { offset }),
    session_id: 'session-1',
    timestamp: '2026-07-23T00:02:00.000Z',
    payload
  }
}

describe('TranscriptProjector', () => {
  it('seeds persisted messages and the in-flight turn from one atomic snapshot', () => {
    const projector = new TranscriptProjector()
    const projection = projector.seedSnapshot('session-1', snapshot())

    expect(projection.messages).toHaveLength(2)
    expect(projection.messages[0]).toEqual(expect.objectContaining({ role: 'user' }))
    expect(projection.messages[1]?.content).toEqual([
      { type: 'thinking', text: 'Plan' },
      { type: 'text', text: 'Hello' },
      expect.objectContaining({ type: 'tool', toolCallId: 'tool-1', state: 'running' })
    ])
    expect(projection.active).toBe(true)
  })

  it('keeps Kimi cron turns visible with their authoritative origin metadata', () => {
    const cronSnapshot = snapshot()
    cronSnapshot.in_flight_turn = null
    cronSnapshot.messages.items = [{
      id: 'cron-user-1',
      session_id: 'session-1',
      role: 'user',
      content: [{ type: 'text', text: 'Run the scheduled audit' }],
      created_at: '2026-07-23T00:00:00.000Z',
      metadata: { origin: { kind: 'cron', taskId: 'cron-42' } }
    }]
    const projection = new TranscriptProjector().seedSnapshot('session-1', cronSnapshot)

    expect(projection.messages).toEqual([expect.objectContaining({
      id: 'cron-user-1',
      originKind: 'cron',
      originTaskId: 'cron-42',
      content: [{ type: 'text', text: 'Run the scheduled audit' }]
    })])
  })

  it('renders only the safe slash command for persisted Kimi skill activations', () => {
    const skillSnapshot = snapshot()
    skillSnapshot.messages.items = [{
      id: 'skill-user-1',
      session_id: 'session-1',
      role: 'user',
      content: [{
        type: 'text',
        text: '<kimi-skill-loaded name="review" dir="/private/skills/review">TOP SECRET INSTRUCTIONS</kimi-skill-loaded>'
      }],
      created_at: '2026-07-23T00:00:00.000Z',
      metadata: {
        origin: {
          kind: 'skill_activation',
          activationId: 'activation-1',
          skillName: 'review',
          skillArgs: '--fix src',
          trigger: 'user-slash',
          skillPath: '/private/skills/review/SKILL.md'
        }
      }
    }]

    const rendered = JSON.stringify(new TranscriptProjector().seedSnapshot('session-1', skillSnapshot))
    expect(rendered).toContain('/review --fix src')
    expect(rendered).not.toContain('TOP SECRET INSTRUCTIONS')
    expect(rendered).not.toContain('/private/skills')
    expect(rendered).not.toContain('skillPath')
  })

  it('hides injected and non-user skill messages from snapshot and live delivery', () => {
    const skillSnapshot = snapshot()
    skillSnapshot.messages.items = [{
      id: 'nested-skill-1',
      session_id: 'session-1',
      role: 'user',
      content: [{ type: 'text', text: 'NESTED SECRET /private/nested' }],
      created_at: '2026-07-23T00:00:00.000Z',
      metadata: { origin: { kind: 'skill_activation', skillName: 'nested', trigger: 'nested-skill' } }
    }]
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', skillSnapshot)

    expect(projector.project(frame('event.message.created', {
      message: {
        id: 'model-skill-1',
        session_id: 'session-1',
        role: 'user',
        content: [{ type: 'text', text: 'MODEL SECRET /private/model' }],
        created_at: '2026-07-23T00:02:00.000Z',
        metadata: { origin: { kind: 'skill_activation', skillName: 'model', trigger: 'model-tool' } }
      }
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('event.message.updated', {
      message_id: 'model-skill-1',
      content: [{ type: 'text', text: 'UPDATED SECRET' }],
      status: 'completed'
    }))).toEqual({ changed: false, resyncRequired: false })

    const rendered = JSON.stringify(projector.getProjection('session-1'))
    expect(rendered).not.toContain('SECRET')
    expect(rendered).not.toContain('/private')
  })

  it('sanitizes a live user-slash skill message and ignores raw content updates', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    expect(projector.project(frame('event.message.created', {
      message: {
        id: 'slash-skill-live',
        session_id: 'session-1',
        role: 'user',
        content: [{ type: 'text', text: '<kimi-skill-loaded dir="/private/live">LIVE SECRET</kimi-skill-loaded>' }],
        created_at: '2026-07-23T00:02:00.000Z',
        metadata: {
          origin: {
            kind: 'skill_activation', skillName: 'review', skillArgs: '--strict',
            trigger: 'user-slash', skillPath: '/private/live/SKILL.md'
          }
        }
      }
    }))).toEqual({ changed: true, resyncRequired: false })
    projector.project(frame('event.message.updated', {
      message_id: 'slash-skill-live',
      content: [{ type: 'text', text: 'UPDATED LIVE SECRET /private/live' }],
      status: 'completed'
    }))

    const rendered = JSON.stringify(projector.getProjection('session-1'))
    expect(rendered).toContain('/review --strict')
    expect(rendered).not.toContain('LIVE SECRET')
    expect(rendered).not.toContain('/private/live')
  })

  it('preserves the plugin namespace while sanitizing plugin commands', () => {
    const pluginSnapshot = snapshot()
    pluginSnapshot.messages.items = [{
      id: 'plugin-command-1', session_id: 'session-1', role: 'user',
      content: [{ type: 'text', text: 'EXPANDED PLUGIN BODY' }],
      created_at: '2026-07-23T00:00:00.000Z',
      metadata: {
        origin: {
          kind: 'plugin_command', pluginId: 'github', commandName: 'review',
          commandArgs: '--strict', trigger: 'user-slash'
        }
      }
    }]

    const rendered = JSON.stringify(new TranscriptProjector().seedSnapshot('session-1', pluginSnapshot))
    expect(rendered).toContain('/github:review --strict')
    expect(rendered).not.toContain('EXPANDED PLUGIN BODY')
  })

  it('aligns volatile deltas and requests a resync when an offset gap is detected', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    expect(projector.project(frame('assistant.delta', { delta: ' world' }, 5))).toEqual({
      changed: true,
      resyncRequired: false
    })
    expect(projector.project(frame('assistant.delta', { delta: 'duplicate' }, 3))).toEqual({
      changed: false,
      resyncRequired: false
    })
    expect(projector.project(frame('assistant.delta', { delta: 'gap' }, 99))).toEqual({
      changed: false,
      resyncRequired: true,
      reason: 'delta_gap'
    })
    expect(projector.getProjection('session-1').messages[1]?.content).toContainEqual({
      type: 'text',
      text: ' world'
    })
  })

  it('omits embedded base64 media from tool previews before sending state to the renderer', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('event.message.created', {
      message: {
        id: 'tool-result-2',
        session_id: 'session-1',
        role: 'tool',
        content: [{
          type: 'tool_result',
          tool_call_id: 'tool-2',
          output: { image: 'data:image/png;base64,QUJDREVGRw==' }
        }],
        created_at: '2026-07-23T00:02:00.000Z'
      }
    }))

    const rendered = JSON.stringify(projector.getProjection('session-1'))
    expect(rendered).toContain('[base64 media omitted]')
    expect(rendered).not.toContain('QUJDREVGRw==')
  })

  it('projects durable assistant deltas by message content index', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    expect(projector.project(frame('event.assistant.delta', {
      message_id: 'inflight:session-1:2',
      content_index: 1,
      delta: { text: ' durable' }
    }))).toEqual({ changed: true, resyncRequired: false })

    expect(projector.getProjection('session-1').messages[1]?.content[1]).toEqual({
      type: 'text',
      text: 'Hello durable'
    })
  })

  it('deduplicates overlapping raw and durable assistant streams without creating a false raw gap', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    expect(projector.project(frame('assistant.delta', { turnId: 2, delta: ' world' }, 5))).toEqual({
      changed: true,
      resyncRequired: false
    })
    expect(projector.project(frame('event.assistant.delta', {
      message_id: 'inflight:session-1:2',
      content_index: 3,
      delta: { text: ' world' }
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('assistant.delta', { turnId: 2, delta: ' late raw' }, 99))).toEqual({
      changed: false,
      resyncRequired: false
    })
    expect(projector.project(frame('event.assistant.delta', {
      message_id: 'inflight:session-1:2',
      content_index: 3,
      delta: { text: '!' }
    }))).toEqual({ changed: true, resyncRequired: false })

    const text = projector.getProjection('session-1').messages[1]?.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    expect(text).toBe('Hello world!')
  })

  it.each([
    [['foo', 'bar'], ['foo', 'bar'], 'Hellofoobar'],
    [['ha', 'ha'], ['ha', 'ha'], 'Hellohaha']
  ])('reconciles delayed multi-chunk raw/durable streams including repeated text', (rawChunks, durableChunks, expected) => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    let offset = 5
    for (const delta of rawChunks) {
      projector.project(frame('assistant.delta', { turnId: 2, delta }, offset))
      offset += delta.length
    }
    for (const text of durableChunks) {
      expect(projector.project(frame('event.assistant.delta', {
        message_id: 'inflight:session-1:2',
        content_index: 3,
        delta: { text }
      })).resyncRequired).toBe(false)
    }

    const projected = projector.getProjection('session-1').messages[1]?.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')
    expect(projected).toBe(expected)
  })

  it('deduplicates tool starts and projects raw plus durable progress into one completed tool', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    projector.project(frame('tool.call.started', {
      turnId: 2,
      toolCallId: 'tool-2',
      name: 'Shell',
      args: { command: 'pnpm test' },
      display: { kind: 'command', command: 'pnpm test', cwd: '/workspace' }
    }))
    projector.project(frame('tool.use', {
      turnId: 2,
      toolCallId: 'tool-2',
      toolName: 'Shell',
      input: { command: 'pnpm test' }
    }))
    projector.project(frame('tool.progress', {
      turnId: 2,
      toolCallId: 'tool-2',
      update: { kind: 'stderr', text: 'warning', percent: 30 }
    }))
    projector.project(frame('event.tool.output', {
      tool_call_id: 'tool-2',
      chunk: 'passed',
      stream: 'stdout'
    }))
    projector.project(frame('tool.result', {
      turnId: 2,
      toolCallId: 'tool-2',
      output: '2 tests passed',
      isError: false
    }))

    const toolParts = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .filter((part) => part.type === 'tool' && part.toolCallId === 'tool-2')
    expect(toolParts).toEqual([expect.objectContaining({
      toolName: 'Shell',
      state: 'done',
      description: 'pnpm test · /workspace',
      inputPreview: '{"command":"pnpm test"}',
      outputPreview: '2 tests passed',
      outputStream: 'mixed',
      progress: 100
    })])
  })

  it('reconciles persisted tool_use and tool_result messages by tool call id', () => {
    const persisted = snapshot()
    persisted.in_flight_turn = null
    persisted.messages.items.push(
      {
        id: 'assistant-tool',
        session_id: 'session-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          tool_call_id: 'tool-persisted',
          tool_name: 'Read',
          input: { path: 'README.md' }
        }],
        created_at: '2026-07-23T00:01:00.000Z'
      },
      {
        id: 'result-tool',
        session_id: 'session-1',
        role: 'tool',
        content: [{
          type: 'tool_result',
          tool_call_id: 'tool-persisted',
          output: 'Kimi Agent',
          is_error: false
        }],
        created_at: '2026-07-23T00:01:01.000Z'
      }
    )
    const projector = new TranscriptProjector()
    const projection = projector.seedSnapshot('session-1', persisted)

    expect(projection.messages.some((message) => message.id === 'result-tool')).toBe(false)
    expect(projection.messages.find((message) => message.id === 'assistant-tool')?.content).toEqual([
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'tool-persisted',
        toolName: 'Read',
        state: 'done',
        outputPreview: 'Kimi Agent'
      })
    ])
  })

  it('keeps authoritative tool-result identity addressable after view reconciliation', () => {
    const persisted = snapshot()
    persisted.in_flight_turn = null
    persisted.messages.items.push(
      {
        id: 'assistant-tool-update',
        session_id: 'session-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          tool_call_id: 'tool-update',
          tool_name: 'Shell',
          input: { command: 'pnpm test' }
        }],
        created_at: '2026-07-23T00:01:00.000Z'
      },
      {
        id: 'result-tool-update',
        session_id: 'session-1',
        role: 'tool',
        content: [{ type: 'tool_result', tool_call_id: 'tool-update', output: 'running' }],
        created_at: '2026-07-23T00:01:01.000Z'
      }
    )
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', persisted)
    expect(projector.getProjection('session-1').messages.some((message) => message.id === 'result-tool-update')).toBe(false)

    expect(projector.project(frame('event.message.updated', {
      message_id: 'result-tool-update',
      content: [{ type: 'tool_result', tool_call_id: 'tool-update', output: '3 tests passed' }],
      status: 'completed'
    }))).toEqual({ changed: true, resyncRequired: false })

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-update')
    expect(tool).toEqual(expect.objectContaining({ state: 'done', outputPreview: '3 tests passed' }))
  })

  it('does not downgrade a terminal tool when a late duplicate start arrives', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('tool.result', {
      turnId: 2,
      toolCallId: 'tool-1',
      output: 'README',
      isError: false
    }))
    projector.project(frame('tool.call.started', {
      turnId: 2,
      toolCallId: 'tool-1',
      name: 'Read',
      args: { path: 'README.md' }
    }))

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-1')
    expect(tool).toEqual(expect.objectContaining({ state: 'done', outputPreview: 'README' }))
  })

  it('preserves a raw terminal Tool across a later durable tool-use message update', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('event.message.created', {
      message: {
        id: 'assistant-tool-durable',
        session_id: 'session-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          tool_call_id: 'tool-1',
          tool_name: 'Read',
          input: { path: 'README.md' }
        }],
        created_at: '2026-07-23T00:02:00.000Z'
      }
    }))
    projector.project(frame('tool.result', {
      turnId: 2,
      toolCallId: 'tool-1',
      output: 'README',
      isError: false
    }))

    projector.project(frame('event.message.updated', {
      message_id: 'assistant-tool-durable',
      content: [{
        type: 'tool_use',
        tool_call_id: 'tool-1',
        tool_name: 'Read',
        input: { path: 'README.md' }
      }],
      status: 'pending'
    }))

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-1')
    expect(tool).toEqual(expect.objectContaining({ state: 'done', outputPreview: 'README', progress: 100 }))
  })

  it('continues the active assistant stream after a tool result', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('tool.result', {
      turnId: 2,
      toolCallId: 'tool-1',
      output: 'README',
      isError: false
    }))

    expect(projector.project(frame('assistant.delta', { turnId: 2, delta: ' after tool' }, 5))).toEqual({
      changed: true,
      resyncRequired: false
    })
    expect(projector.getProjection('session-1').messages[1]?.content).toContainEqual({
      type: 'text',
      text: ' after tool'
    })
  })

  it('prefers a durable tool-use message over the matching synthetic snapshot slot', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    projector.project(frame('event.message.created', {
      message: {
        id: 'assistant-durable',
        session_id: 'session-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          tool_call_id: 'tool-1',
          tool_name: 'Read',
          input: { path: 'README.md' }
        }],
        created_at: '2026-07-23T00:02:00.000Z'
      }
    }))

    const projection = projector.getProjection('session-1')
    const matchingParts = projection.messages.flatMap((message) => message.content)
      .filter((part) => part.type === 'tool' && part.toolCallId === 'tool-1')
    expect(matchingParts).toHaveLength(1)
    expect(projection.messages.find((message) => message.id === 'assistant-durable')?.content).toEqual([
      { type: 'thinking', text: 'Plan' },
      { type: 'text', text: 'Hello' },
      expect.objectContaining({ type: 'tool', toolCallId: 'tool-1', toolName: 'Read' })
    ])
  })

  it('does not let a delayed prior-step durable assistant replace the active synthetic step', () => {
    const projector = new TranscriptProjector()
    projector.reset('session-1')
    projector.project(frame('prompt.submitted', {
      promptId: 'prompt-delayed',
      userMessageId: 'user-delayed',
      content: [{ type: 'text', text: 'Two steps' }]
    }))
    projector.project(frame('turn.started', { turnId: 8 }))
    projector.project(frame('turn.step.started', { turnId: 8, step: 1 }))
    projector.project(frame('assistant.delta', { turnId: 8, delta: 'first step' }, 0))
    projector.project(frame('turn.step.completed', { turnId: 8, step: 1 }))
    projector.project(frame('turn.step.started', { turnId: 8, step: 2 }))
    const activeStepId = projector.getProjection('session-1').messages.at(-1)?.id

    projector.project(frame('event.message.created', {
      message: {
        id: 'durable-prior-step',
        session_id: 'session-1',
        role: 'assistant',
        prompt_id: 'prompt-delayed',
        content: [{ type: 'text', text: 'first step' }],
        created_at: '2026-07-23T00:01:00.000Z'
      }
    }))
    projector.project(frame('assistant.delta', { turnId: 8, delta: 'second step' }, 0))

    expect(projector.getProjection('session-1').messages.find((message) => message.id === activeStepId)?.content).toEqual([
      { type: 'text', text: 'second step' }
    ])
  })

  it('reuses the same assistant message when a streamed step retries', () => {
    const projector = new TranscriptProjector()
    projector.reset('session-1')
    projector.project(frame('prompt.submitted', {
      promptId: 'prompt-retry',
      userMessageId: 'user-retry',
      content: [{ type: 'text', text: 'Retry it' }],
      createdAt: '2026-07-23T00:00:00.000Z'
    }))
    projector.project(frame('turn.started', { turnId: 3 }))
    projector.project(frame('turn.step.started', { turnId: 3, step: 1 }))
    projector.project(frame('thinking.delta', { turnId: 3, delta: 'old thought' }, 0))
    const beforeRetry = projector.getProjection('session-1').messages.at(-1)?.id

    projector.project(frame('turn.step.retrying', {
      turnId: 3,
      step: 1,
      failedAttempt: 1,
      nextAttempt: 2,
      maxAttempts: 3,
      delayMs: 100,
      errorName: 'RateLimitError',
      errorMessage: 'retry'
    }))
    projector.project(frame('turn.step.started', { turnId: 3, step: 1 }))
    projector.project(frame('assistant.delta', { turnId: 3, delta: 'fresh answer' }, 0))

    const assistantMessages = projector.getProjection('session-1').messages.filter((message) => message.role === 'assistant')
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]?.id).toBe(beforeRetry)
    expect(assistantMessages[0]?.content).toEqual([{ type: 'text', text: 'fresh answer' }])
  })

  it('consumes a retry target when streaming resumes directly and does not reuse it for the next step', () => {
    const projector = new TranscriptProjector()
    projector.reset('session-1')
    projector.project(frame('prompt.submitted', {
      promptId: 'prompt-retry-direct',
      userMessageId: 'user-retry-direct',
      content: [{ type: 'text', text: 'Retry directly' }]
    }))
    projector.project(frame('turn.started', { turnId: 4 }))
    projector.project(frame('turn.step.started', { turnId: 4, step: 1, stepId: 'step-1' }))
    projector.project(frame('thinking.delta', { turnId: 4, delta: 'failed attempt' }, 0))
    const retriedMessageId = projector.getProjection('session-1').messages.at(-1)?.id
    projector.project(frame('turn.step.retrying', {
      turnId: 4,
      step: 1,
      stepId: 'step-1',
      failedAttempt: 1,
      nextAttempt: 2,
      maxAttempts: 3,
      delayMs: 10,
      errorName: 'RetryableError',
      errorMessage: 'retry'
    }))

    expect(projector.project(frame('assistant.delta', { turnId: 4, delta: 'recovered' }, 0))).toEqual({
      changed: true,
      resyncRequired: false
    })
    projector.project(frame('turn.step.started', { turnId: 4, step: 2, stepId: 'step-2' }))

    const assistantMessages = projector.getProjection('session-1').messages.filter((message) => message.role === 'assistant')
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]).toEqual(expect.objectContaining({
      id: retriedMessageId,
      content: [{ type: 'text', text: 'recovered' }]
    }))
    expect(assistantMessages[1]?.id).not.toBe(retriedMessageId)
  })

  it('consumes a retry target when a durable delta resumes directly', () => {
    const projector = new TranscriptProjector()
    projector.reset('session-1')
    projector.project(frame('prompt.submitted', {
      promptId: 'prompt-retry-durable',
      userMessageId: 'user-retry-durable',
      content: [{ type: 'text', text: 'Retry durable' }]
    }))
    projector.project(frame('turn.started', { turnId: 9 }))
    projector.project(frame('turn.step.started', { turnId: 9, step: 1 }))
    projector.project(frame('thinking.delta', { turnId: 9, delta: 'failed attempt' }, 0))
    const retriedMessageId = projector.getProjection('session-1').messages.at(-1)?.id
    projector.project(frame('turn.step.retrying', {
      turnId: 9,
      step: 1,
      failedAttempt: 1,
      nextAttempt: 2,
      maxAttempts: 3,
      delayMs: 10,
      errorName: 'RetryableError',
      errorMessage: 'retry'
    }))
    projector.project(frame('event.assistant.delta', {
      message_id: retriedMessageId,
      content_index: 0,
      delta: { text: 'durable recovery' }
    }))
    projector.project(frame('turn.step.started', { turnId: 9, step: 2 }))

    const assistantMessages = projector.getProjection('session-1').messages.filter((message) => message.role === 'assistant')
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]).toEqual(expect.objectContaining({
      id: retriedMessageId,
      content: [{ type: 'text', text: 'durable recovery' }]
    }))
    expect(assistantMessages[1]?.id).not.toBe(retriedMessageId)
  })

  it('isolates durable subagent messages, deltas and tool progress from the main transcript', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    const before = projector.getProjection('session-1')

    expect(projector.project(frame('event.message.created', {
      message: {
        id: 'subagent-message',
        session_id: 'session-1',
        role: 'assistant',
        content: [{
          type: 'tool_use',
          tool_call_id: 'subagent-tool',
          tool_name: 'Shell',
          input: { command: 'secret work' }
        }],
        metadata: { agent_id: 'worker-1' },
        created_at: '2026-07-23T00:02:00.000Z'
      }
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('event.message.updated', {
      message_id: 'subagent-message',
      content: [{ type: 'text', text: 'must stay hidden' }],
      status: 'completed'
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('event.assistant.delta', {
      message_id: 'subagent-message',
      content_index: 0,
      delta: { text: 'hidden delta' }
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('event.tool.output', {
      tool_call_id: 'subagent-tool',
      chunk: 'hidden output',
      stream: 'stdout'
    }))).toEqual({ changed: false, resyncRequired: false })
    expect(projector.project(frame('event.tool.progress', {
      tool_call_id: 'subagent-tool',
      message: 'hidden progress',
      progress: 50
    }))).toEqual({ changed: false, resyncRequired: false })

    expect(projector.getProjection('session-1')).toEqual(before)
  })

  it('bounds and redacts structured tool previews and streamed output', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    const manyFields = Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [`field_${index}`, index]))
    projector.project(frame('tool.call.started', {
      turnId: 2,
      toolCallId: 'tool-safe-preview',
      name: 'Shell',
      args: {
        authorization: 'Bearer should-not-render',
        password: 'should-not-render',
        blob: `${'A'.repeat(200)}==`,
        manyFields
      }
    }))
    projector.project(frame('event.tool.output', {
      tool_call_id: 'tool-safe-preview',
      chunk: `PASSWORD=hunter2 API_KEY: "plain-secret" ghp_${'x'.repeat(30)} AKIA${'A'.repeat(16)}\n${'B'.repeat(220)}==\n${'visible '.repeat(1_000)}`,
      stream: 'stdout'
    }))

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-safe-preview')
    expect(tool?.type).toBe('tool')
    if (tool?.type !== 'tool') throw new Error('tool preview was not projected')
    expect(tool.inputPreview).toContain('[secret omitted]')
    expect(tool.inputPreview).toContain('[base64 data omitted]')
    expect(tool.inputPreview).toContain('more fields omitted')
    expect(tool.inputPreview).not.toContain('should-not-render')
    expect(tool.outputPreview).toContain('[base64 data omitted]')
    expect(tool.outputPreview).toContain('PASSWORD=[secret omitted]')
    expect(tool.outputPreview).not.toContain('hunter2')
    expect(tool.outputPreview).not.toContain('plain-secret')
    expect(tool.outputPreview).not.toContain(`ghp_${'x'.repeat(30)}`)
    expect(tool.outputPreview).not.toContain(`AKIA${'A'.repeat(16)}`)
    expect(tool.outputPreview?.length).toBeLessThanOrEqual(4_001)
  })

  it.each([
    ['command', { kind: 'command', command: 'pnpm test', cwd: '/repo' }, 'pnpm test · /repo'],
    ['file_io', { kind: 'file_io', operation: 'write', path: 'src/app.ts', detail: 'overwrite' }, 'write · src/app.ts · overwrite'],
    ['diff', { kind: 'diff', path: 'src/app.ts', before: 'a', after: 'b', hunks: 2 }, 'src/app.ts · 2 hunks'],
    ['search', { kind: 'search', query: 'needle', scope: 'src' }, 'needle · src'],
    ['url_fetch', { kind: 'url_fetch', url: 'https://example.com', method: 'GET' }, 'https://example.com · GET'],
    ['agent_call', { kind: 'agent_call', agent_name: 'reviewer', prompt: 'inspect' }, 'reviewer · inspect'],
    ['skill_call', { kind: 'skill_call', skill_name: 'lint', args: '--fix' }, 'lint · --fix'],
    ['todo_list', { kind: 'todo_list', items: [{ title: 'One', status: 'done' }, { title: 'Two', status: 'pending' }] }, 'One · Two · 2 items'],
    ['task', { kind: 'task', task_id: 'task-1', status: 'running', description: 'Implement', task_kind: 'coding' }, 'Implement · coding · running'],
    ['task_stop', { kind: 'task_stop', task_id: 'task-1', task_description: 'Stop worker' }, 'Stop worker · task-1'],
    ['plan_review', { kind: 'plan_review', plan: 'Review this', path: 'plan.md' }, 'plan.md · Review this'],
    ['goal_start', { kind: 'goal_start', objective: 'Ship it', completionCriterion: 'Tests pass', mode: 'manual' }, 'Ship it · manual · Tests pass'],
    ['generic', { kind: 'generic', summary: 'Generic', detail: 'detail' }, 'Generic · detail']
  ])('projects the %s tool display variant', (_kind, display, expectedDescription) => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('tool.call.started', {
      turnId: 2,
      toolCallId: 'tool-display',
      name: 'Tool',
      args: {},
      display
    }))

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-display')
    expect(tool).toEqual(expect.objectContaining({ description: expectedDescription }))
  })

  it('preserves a bounded diff display for the dedicated Tool Diff view', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())
    projector.project(frame('tool.call.started', {
      turnId: 2,
      toolCallId: 'tool-diff',
      name: 'Edit',
      display: {
        kind: 'diff', path: 'src/App.vue', before: '<h1>Old</h1>', after: '<h1>New</h1>', hunks: 1
      }
    }))

    const tool = projector.getProjection('session-1').messages
      .flatMap((message) => message.content)
      .find((part) => part.type === 'tool' && part.toolCallId === 'tool-diff')
    expect(tool).toEqual(expect.objectContaining({
      toolDiff: { path: 'src/App.vue', before: '<h1>Old</h1>', after: '<h1>New</h1>', hunks: 1 }
    }))
  })

  it('does not count pinned known-noop tool protocol events as unknown', () => {
    const projector = new TranscriptProjector()
    projector.seedSnapshot('session-1', snapshot())

    projector.project(frame('tool.call.delta', {
      turnId: 2,
      toolCallId: 'tool-1',
      argumentsPart: '{'
    }))
    projector.project(frame('event.assistant.tool_use_started', {
      message_id: 'inflight:session-1:2',
      tool_call_id: 'tool-1',
      tool_name: 'Read',
      content_index: 2
    }))
    projector.project(frame('event.tool.completed', {
      tool_call_id: 'tool-1',
      output: 'README',
      is_error: false,
      duration_ms: 4
    }))
    projector.project(frame('hook.result', { hookEvent: 'afterTool', content: 'ok' }))

    expect(projector.getProjection('session-1').unknownEventCount).toBe(0)
  })
})
