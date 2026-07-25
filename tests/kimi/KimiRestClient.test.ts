import { describe, expect, it, vi } from 'vitest'
import { KimiRestClient } from '../../src/main/kimi/KimiRestClient.js'

describe('KimiRestClient', () => {
  it('reads the authoritative managed usage shape without normalizing away optional windows', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      msg: 'ok',
      data: {
        kind: 'ok',
        summary: { label: 'Weekly', used: 72, limit: 100, reset_hint: '5 days' },
        limits: [{ label: '5h', used: 41, limit: 100 }],
        extra_usage: {
          balance_cents: 1840,
          total_cents: 5000,
          monthly_charge_limit_enabled: true,
          monthly_charge_limit_cents: 2000,
          monthly_used_cents: 620,
          currency: 'CNY'
        }
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.getOAuthUsage('kimi')).resolves.toEqual(expect.objectContaining({
      kind: 'ok',
      summary: expect.objectContaining({ used: 72, reset_hint: '5 days' })
    }))
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/oauth/usage?provider=kimi',
      expect.objectContaining({ headers: expect.any(Headers) })
    )
  })

  it('preserves Retry-After on API failures for bounded usage backoff', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      code: 42900, msg: 'slow down', data: null
    }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '15' } }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.getOAuthUsage()).rejects.toEqual(expect.objectContaining({
      status: 429,
      retryAfterMs: 15_000
    }))
  })

  it('treats a non-zero envelope code as an error even with HTTP 200', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 40001, msg: 'bad request', data: null, request_id: 'req-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.request('/api/v1/meta')).rejects.toEqual(
      expect.objectContaining({ code: 40001, requestId: 'req-1' })
    )
  })

  it('adds bearer auth and returns data from a successful envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, msg: 'ok', data: { server_id: 'srv-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234/', token: 'secret', fetchImpl })

    await expect(client.request<{ server_id: string }>('/api/v1/meta')).resolves.toEqual({ server_id: 'srv-1' })
    const init = fetchImpl.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret')
  })

  it('accepts legacy workspaces with an empty display name', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: 'ok',
          data: {
            items: [
              {
                id: 'wd_project_123456789abc',
                root: '/tmp/project',
                name: '',
                created_at: null,
                last_opened_at: null,
                session_count: 0
              }
            ]
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listWorkspaces()).resolves.toEqual([
      expect.objectContaining({ name: '', root: '/tmp/project' })
    ])
  })

  it('does not combine the mutually exclusive archived session filters', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, msg: 'ok', data: { items: [], has_more: false } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listSessionPage({ archivedOnly: true, includeArchive: true })).resolves.toEqual({
      items: [], hasMore: false
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/sessions?page_size=100&include_archive=false&exclude_empty=false&archived_only=true',
      expect.any(Object)
    )
  })

  it('submits text prompts with bearer auth and validates the authoritative response', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: {
          prompt_id: 'prompt-1',
          user_message_id: 'message-1',
          status: 'queued',
          content: [{ type: 'text', text: 'Continue' }],
          created_at: '2026-07-23T00:00:00.000Z'
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.submitPrompt('session-1', {
      content: [{ type: 'text', text: 'Continue' }],
      model: 'kimi-for-coding',
      thinking: 'high',
      permissionMode: 'manual',
      planMode: true,
      swarmMode: false
    })).resolves.toEqual(expect.objectContaining({ prompt_id: 'prompt-1', status: 'queued' }))
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/sessions/session-1/prompts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          content: [{ type: 'text', text: 'Continue' }],
          model: 'kimi-for-coding',
          thinking: 'high',
          permission_mode: 'manual',
          plan_mode: true,
          swarm_mode: false
        })
      })
    )
  })

  it('reads the authoritative session runtime controls', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      code: 0, msg: 'ok', data: {
        busy: true, model: 'kimi-for-coding', thinking_level: 'high', permission: 'manual',
        plan_mode: true, swarm_mode: false, context_tokens: 1200,
        max_context_tokens: 262144, context_usage: 0.0045
      }
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })
    await expect(client.getSessionStatus('session-1')).resolves.toEqual(expect.objectContaining({
      model: 'kimi-for-coding', thinking_level: 'high', permission: 'manual', plan_mode: true
    }))
  })

  it('uses the pinned Goal, Task and Prompt Queue routes', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({
        goalId: 'goal-1', objective: '完成 P0', status: 'active', turnsUsed: 2,
        tokensUsed: 1000, wallClockMs: 5000,
        budget: {
          tokenBudget: null, turnBudget: null, wallClockBudgetMs: null,
          remainingTokens: null, remainingTurns: null, remainingWallClockMs: null,
          tokenBudgetReached: false, turnBudgetReached: false,
          wallClockBudgetReached: false, overBudget: false
        }
      }))
      .mockResolvedValueOnce(envelope({ items: [{
        id: 'task-1', session_id: 'session-1', kind: 'bash', description: '测试',
        status: 'running', created_at: '2026-07-23T00:00:00.000Z'
      }] }))
      .mockResolvedValueOnce(envelope({
        active: null,
        queued: [{
          prompt_id: 'p1', user_message_id: 'm1', status: 'queued',
          content: [{ type: 'text', text: '继续' }], created_at: '2026-07-23T00:00:00.000Z'
        }]
      }))
      .mockResolvedValueOnce(envelope({ cancelled: true }))
      .mockResolvedValueOnce(envelope({
        id: 'session-1', workspace_id: 'wd_project_123456789abc', title: 'P0',
        created_at: null, updated_at: null, busy: false,
        metadata: { cwd: '/tmp/project' }, agent_config: { model: 'kimi-for-coding' },
        usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 262144 },
        permission_rules: [], message_count: 0, last_seq: 0
      }))
      .mockResolvedValueOnce(envelope({
        id: 'session-1', workspace_id: 'wd_project_123456789abc', title: 'P0',
        created_at: null, updated_at: null, busy: false,
        metadata: { cwd: '/tmp/project' }, agent_config: { model: 'kimi-for-coding' },
        usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 262144 },
        permission_rules: [], message_count: 0, last_seq: 0
      }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.getSessionGoal('session-1')).resolves.toEqual(expect.objectContaining({ goalId: 'goal-1' }))
    await expect(client.listTasks('session-1')).resolves.toEqual([expect.objectContaining({ id: 'task-1' })])
    await expect(client.getPromptQueue('session-1')).resolves.toEqual(expect.objectContaining({
      queued: [expect.objectContaining({ prompt_id: 'p1' })]
    }))
    await expect(client.cancelTask('session-1', 'task/1')).resolves.toEqual({ cancelled: true })
    await expect(client.updateSessionGoal('session-1', 'pause')).resolves.toEqual(expect.objectContaining({ id: 'session-1' }))
    await expect(client.updateSessionGoalObjective('session-1', '完成 P0')).resolves.toEqual(expect.objectContaining({ id: 'session-1' }))

    expect(fetchImpl.mock.calls[3]?.[0]).toBe('http://127.0.0.1:1234/api/v1/sessions/session-1/tasks/task%2F1:cancel')
    expect(fetchImpl.mock.calls[4]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', body: JSON.stringify({ agent_config: { goal_control: 'pause' } })
    }))
    expect(fetchImpl.mock.calls[5]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', body: JSON.stringify({ agent_config: { goal_objective: '完成 P0' } })
    }))
  })

  it('uses Kimi Workspace and Session lifecycle routes without a second registry', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
    const workspace = {
      id: 'wd_project_123456789abc', root: '/tmp/project', name: 'Project',
      created_at: null, last_opened_at: null, session_count: 0
    }
    const session = {
      id: 'session-1', workspace_id: workspace.id, title: 'Task',
      created_at: null, updated_at: null, busy: false,
      metadata: { cwd: '/tmp/project' }, agent_config: { model: 'kimi-for-coding' },
      usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 262144 },
      permission_rules: [], message_count: 0, last_seq: 0
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope(workspace))
      .mockResolvedValueOnce(envelope({ ...workspace, name: 'Renamed' }))
      .mockResolvedValueOnce(envelope({ deleted: true }))
      .mockResolvedValueOnce(envelope(session))
      .mockResolvedValueOnce(envelope({ ...session, title: 'Renamed task' }))
      .mockResolvedValueOnce(envelope({ archived: true }))
      .mockResolvedValueOnce(envelope({ ...session, archived: false }))
      .mockResolvedValueOnce(envelope({ ...session, id: 'session-fork' }))
      .mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4]), {
        status: 200, headers: { 'content-type': 'application/zip' }
      }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await client.addWorkspace({ root: '/tmp/project' })
    await client.renameWorkspace(workspace.id, 'Renamed')
    await client.deleteWorkspace(workspace.id)
    await client.createSession({ workspaceId: workspace.id })
    await client.renameSession('session-1', 'Renamed task')
    await client.archiveSession('session-1')
    await client.restoreSession('session-1')
    await client.forkSession('session-1')
    await expect(client.exportSession('session-1')).resolves.toEqual(new Uint8Array([80, 75, 3, 4]))

    expect(fetchImpl.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', body: JSON.stringify({ root: '/tmp/project' })
    }))
    expect(fetchImpl.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ method: 'PATCH' }))
    expect(fetchImpl.mock.calls[2]?.[1]).toEqual(expect.objectContaining({ method: 'DELETE' }))
    expect(fetchImpl.mock.calls[3]?.[1]).toEqual(expect.objectContaining({
      method: 'POST', body: JSON.stringify({ workspace_id: workspace.id })
    }))
    expect(fetchImpl.mock.calls[8]?.[0]).toBe('http://127.0.0.1:1234/api/v1/sessions/session-1/export')
    expect(new Headers(fetchImpl.mock.calls[8]?.[1]?.headers).get('authorization')).toBe('Bearer secret')
  })

  it('treats PROMPT_NOT_FOUND as an idempotent abort result', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        code: 40903,
        msg: 'prompt already completed',
        data: { aborted: false },
        request_id: 'req-abort'
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.abortPrompt('session-1', 'prompt-1')).resolves.toEqual({ aborted: false })
  })

  it('falls back to the official session abort action when no prompt id exists', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, msg: 'ok', data: { aborted: true } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.abortSession('session/1')).resolves.toEqual({ aborted: true })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/sessions/session%2F1:abort',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('sends approval decisions using the pinned Kimi wire shape', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: { resolved: true, resolved_at: 1_753_228_800_000 }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    )
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.respondApproval('session-1', 'approval-1', {
      decision: 'approved',
      scope: 'session'
    })).resolves.toEqual({ resolved: true, resolved_at: 1_753_228_800_000 })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/sessions/session-1/approvals/approval-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'approved', scope: 'session' })
      })
    )
  })

  it('sends question answers and idempotent dismiss requests using the pinned wire shapes', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: { resolved: true, resolved_at: '2026-07-23T00:00:00.000Z' }
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 40909,
        msg: 'already dismissed',
        data: { dismissed: true, dismissed_at: '2026-07-23T00:01:00.000Z' }
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await client.respondQuestion('session-1', 'question-1', {
      answers: { framework: { kind: 'single', option_id: 'vue' } },
      method: 'click'
    })
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/questions/question-1',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          answers: { framework: { kind: 'single', option_id: 'vue' } },
          method: 'click'
        })
      })
    )

    await expect(client.dismissQuestion('session-1', 'question-1')).resolves.toEqual(
      expect.objectContaining({ dismissed: true })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/questions/question-1:dismiss',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uses the pinned Session FS actions for list, read, git status and on-demand diff', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({
        items: [{
          path: 'src', name: 'src', kind: 'directory', modified_at: '2026-07-23T00:00:00.000Z',
          git_status: 'modified', child_count: 2
        }],
        truncated: false
      }))
      .mockResolvedValueOnce(envelope({
        path: 'src/app.ts', content: 'export {}', encoding: 'utf-8', size: 9,
        truncated: false, etag: 'etag-1', mime: 'text/typescript', language_id: 'typescript', is_binary: false
      }))
      .mockResolvedValueOnce(envelope({
        branch: 'main', ahead: 1, behind: 0, entries: { 'src/app.ts': 'modified' },
        additions: 4, deletions: 1, pullRequest: null
      }))
      .mockResolvedValueOnce(envelope({
        path: 'src/app.ts', diff: '@@ -1 +1 @@\n-old\n+new', truncated: false
      }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listFiles('session-1', { path: 'src' })).resolves.toEqual(
      expect.objectContaining({ items: [expect.objectContaining({ path: 'src', kind: 'directory' })] })
    )
    await expect(client.readFile('session-1', 'src/app.ts')).resolves.toEqual(
      expect.objectContaining({ content: 'export {}', is_binary: false })
    )
    await expect(client.getGitStatus('session-1')).resolves.toEqual(
      expect.objectContaining({ branch: 'main', entries: { 'src/app.ts': 'modified' } })
    )
    await expect(client.getFileDiff('session-1', 'src/app.ts')).resolves.toEqual(
      expect.objectContaining({ path: 'src/app.ts', truncated: false })
    )

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:list',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({
        path: 'src', depth: 1, limit: 500, show_hidden: false,
        follow_gitignore: true, sort: 'type_first', include_git_status: true
      }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:read',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({
        path: 'src/app.ts', offset: 0, length: 1_048_576, encoding: 'auto'
      }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:git_status',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ paths: [] }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:diff',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: 'src/app.ts' }) })
    )
  })

  it('uses Kimi native file search, grep, download and external file actions', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({
        items: [{ path: 'src/App.vue', name: 'App.vue', kind: 'file', score: 0.98, match_positions: [0, 3] }],
        truncated: false
      }))
      .mockResolvedValueOnce(envelope({
        files: [{ path: 'src/App.vue', matches: [{ line: 12, col: 4, text: 'const ready = true', before: [], after: [] }] }],
        files_scanned: 5, truncated: false, elapsed_ms: 3
      }))
      .mockResolvedValueOnce(envelope({ opened: true }))
      .mockResolvedValueOnce(envelope({ opened: true }))
      .mockResolvedValueOnce(envelope({ revealed: true }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.searchFiles('session-1', 'app')).resolves.toEqual(expect.objectContaining({ truncated: false }))
    await expect(client.grepFiles('session-1', 'ready')).resolves.toEqual(expect.objectContaining({ files_scanned: 5 }))
    await client.openFile('session-1', 'src/App.vue', 12)
    await client.openFileIn('session-1', 'vscode', 'src/App.vue', 12)
    await client.revealFile('session-1', 'src/App.vue')
    await expect(client.downloadWorkspaceFile('session-1', 'src/App.vue')).resolves.toEqual(new Uint8Array([1, 2, 3]))

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:search',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ query: 'app', limit: 50, follow_gitignore: true }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:grep',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({
        pattern: 'ready', regex: false, case_sensitive: false, follow_gitignore: true,
        max_files: 200, max_matches_per_file: 50, max_total_matches: 5000, context_lines: 2
      }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:open',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: 'src/App.vue', line: 12 }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:open-in',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ app_id: 'vscode', path: 'src/App.vue', line: 12 }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs:reveal',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ path: 'src/App.vue' }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/fs/src/App.vue',
      expect.objectContaining({ headers: expect.any(Headers) })
    )
  })

  it('uses the official Web Compact and Undo session actions', async () => {
    const response = () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: {} }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response())
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await client.compactSession('session-1', '保留当前实现约束')
    await client.undoSession('session-1', 1)

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:1234/api/v1/sessions/session-1:compact',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ instruction: '保留当前实现约束' }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/sessions/session-1:undo',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ count: 1 }) })
    )
  })

  it('uses the official Web BTW action to create an agent-scoped Side Chat', async () => {
    const response = new Response(JSON.stringify({ code: 0, msg: 'ok', data: { agent_id: 'agent-btw-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.startSideChat('session-1')).resolves.toEqual({ agent_id: 'agent-btw-1' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/api/v1/sessions/session-1:btw',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({}) })
    )
  })

  it('uses the pinned Session Terminal REST resources', async () => {
    const terminal = {
      id: 'terminal-1', session_id: 'session-1', cwd: '/tmp/project', shell: '/bin/zsh',
      cols: 120, rows: 32, status: 'running', created_at: '2026-07-23T00:00:00.000Z'
    }
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ items: [terminal] }))
      .mockResolvedValueOnce(envelope(terminal))
      .mockResolvedValueOnce(envelope(terminal))
      .mockResolvedValueOnce(envelope({ closed: true }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listTerminals('session-1')).resolves.toEqual([terminal])
    await expect(client.createTerminal('session-1', { cols: 120, rows: 32 })).resolves.toEqual(terminal)
    await expect(client.getTerminal('session-1', 'terminal-1')).resolves.toEqual(terminal)
    await expect(client.closeTerminal('session-1', 'terminal-1')).resolves.toEqual({ closed: true })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/terminals',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ cols: 120, rows: 32 }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:1234/api/v1/sessions/session-1/terminals/terminal-1:close',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uses the pinned auth, catalog, config and OAuth routes without exposing credentials', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const model = {
      provider: 'managed:kimi-code', model: 'kimi-for-coding', display_name: 'Kimi for Coding',
      max_context_size: 262_144, capabilities: ['thinking'], support_efforts: ['off', 'high'], default_effort: 'high'
    }
    const provider = {
      id: 'managed:kimi-code', type: 'kimi', base_url: 'https://api.kimi.com/coding/v1',
      has_api_key: true, status: 'connected', models: ['kimi-for-coding']
    }
    const refresh = {
      changed: [{ provider_id: 'managed:kimi-code', provider_name: 'Kimi Code', added: 1, removed: 0 }],
      unchanged: [], failed: []
    }
    const config = {
      providers: {
        'managed:kimi-code': { type: 'kimi', base_url: 'https://api.kimi.com/coding/v1', has_api_key: true }
      },
      default_model: 'kimi-for-coding',
      telemetry: false
    }
    const pendingFlow = {
      flow_id: 'flow-1', provider: 'managed:kimi-code', status: 'pending',
      verification_uri: 'https://auth.kimi.com/device',
      verification_uri_complete: 'https://auth.kimi.com/device?code=ABCD',
      user_code: 'ABCD', expires_in: 600, interval: 5, expires_at: '2026-07-23T01:00:00.000Z'
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({
        ready: true, providers_count: 1, default_model: 'kimi-for-coding',
        managed_provider: { name: 'managed:kimi-code', status: 'authenticated' }
      }))
      .mockResolvedValueOnce(envelope({ items: [model] }))
      .mockResolvedValueOnce(envelope({ items: [provider] }))
      .mockResolvedValueOnce(envelope(provider))
      .mockResolvedValueOnce(envelope(config))
      .mockResolvedValueOnce(envelope(config))
      .mockResolvedValueOnce(envelope({ default_model: 'managed/kimi', model }))
      .mockResolvedValueOnce(envelope(refresh))
      .mockResolvedValueOnce(envelope(refresh))
      .mockResolvedValueOnce(envelope(refresh))
      .mockResolvedValueOnce(envelope(pendingFlow))
      .mockResolvedValueOnce(envelope(pendingFlow))
      .mockResolvedValueOnce(envelope({ cancelled: true, status: 'cancelled' }))
      .mockResolvedValueOnce(envelope({ logged_out: true, provider: 'managed:kimi-code' }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.getAuth()).resolves.toEqual(expect.objectContaining({ ready: true }))
    await expect(client.listModels()).resolves.toEqual([model])
    await expect(client.listProviders()).resolves.toEqual([provider])
    await expect(client.getProvider('managed:kimi-code')).resolves.toEqual(provider)
    await expect(client.getConfig()).resolves.toEqual(config)
    await expect(client.setConfig({ telemetry: false })).resolves.toEqual(config)
    await expect(client.setDefaultModel('managed/kimi')).resolves.toEqual(expect.objectContaining({
      default_model: 'managed/kimi'
    }))
    await expect(client.refreshProvider('managed:kimi-code')).resolves.toEqual(refresh)
    await expect(client.refreshAllProviders()).resolves.toEqual(refresh)
    await expect(client.refreshOAuthProviderModels()).resolves.toEqual(refresh)
    await expect(client.startOAuthLogin('managed:kimi-code')).resolves.toEqual(pendingFlow)
    await expect(client.pollOAuthLogin('managed:kimi-code')).resolves.toEqual(pendingFlow)
    await expect(client.cancelOAuthLogin('managed:kimi-code')).resolves.toEqual({ cancelled: true, status: 'cancelled' })
    await expect(client.logoutOAuth('managed:kimi-code')).resolves.toEqual({
      logged_out: true, provider: 'managed:kimi-code'
    })

    expect(fetchImpl).toHaveBeenNthCalledWith(7,
      'http://127.0.0.1:1234/api/v1/models/managed%2Fkimi:set_default',
      expect.objectContaining({ method: 'POST' }))
    expect(fetchImpl).toHaveBeenNthCalledWith(8,
      'http://127.0.0.1:1234/api/v1/providers/managed%3Akimi-code:refresh',
      expect.objectContaining({ method: 'POST' }))
    expect(fetchImpl).toHaveBeenNthCalledWith(9,
      'http://127.0.0.1:1234/api/v1/providers:refresh',
      expect.objectContaining({ method: 'POST' }))
    expect(fetchImpl).toHaveBeenNthCalledWith(10,
      'http://127.0.0.1:1234/api/v1/providers:refresh_oauth',
      expect.objectContaining({ method: 'POST' }))
    expect(fetchImpl).toHaveBeenNthCalledWith(11,
      'http://127.0.0.1:1234/api/v1/oauth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ provider: 'managed:kimi-code' }) }))
    expect(fetchImpl).toHaveBeenNthCalledWith(12,
      'http://127.0.0.1:1234/api/v1/oauth/login?provider=managed%3Akimi-code',
      expect.any(Object))
    expect(fetchImpl).toHaveBeenNthCalledWith(13,
      'http://127.0.0.1:1234/api/v1/oauth/login?provider=managed%3Akimi-code',
      expect.objectContaining({ method: 'DELETE' }))
  })

  it('uses the pinned Skills, Tools and MCP management routes', async () => {
    const envelope = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'ok', data }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
    const skill = {
      name: 'review', description: 'Review code', path: '/tmp/SKILL.md', source: 'project',
      disable_model_invocation: false
    }
    const tool = {
      name: 'mcp__github__search', description: 'Search GitHub', input_schema: null,
      source: 'mcp', mcp_server_id: 'github', active: true
    }
    const server = {
      id: 'github', name: 'github', transport: 'stdio', status: 'connected', tool_count: 1
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(envelope({ skills: [skill] }))
      .mockResolvedValueOnce(envelope({ skills: [skill] }))
      .mockResolvedValueOnce(envelope({ activated: true, skill_name: 'review' }))
      .mockResolvedValueOnce(envelope({ tools: [tool] }))
      .mockResolvedValueOnce(envelope({ servers: [server] }))
      .mockResolvedValueOnce(envelope({ restarting: true }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listSessionSkills('session/1')).resolves.toEqual([skill])
    await expect(client.listWorkspaceSkills('workspace 1')).resolves.toEqual([skill])
    await expect(client.activateSkill('session/1', 'review code', '--fix')).resolves.toEqual({
      activated: true, skill_name: 'review'
    })
    await expect(client.listTools('session/1')).resolves.toEqual([tool])
    await expect(client.listMcpServers()).resolves.toEqual([server])
    await expect(client.restartMcpServer('github/local')).resolves.toEqual({ restarting: true })

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:1234/api/v1/sessions/session%2F1/skills',
      expect.any(Object)
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:1234/api/v1/sessions/session%2F1/skills/review%20code:activate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ args: '--fix' }) })
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      4,
      'http://127.0.0.1:1234/api/v1/tools?session_id=session%2F1',
      expect.any(Object)
    )
    expect(fetchImpl).toHaveBeenNthCalledWith(
      6,
      'http://127.0.0.1:1234/api/v1/mcp/servers/github%2Flocal:restart',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('uploads and downloads Kimi files without exposing bearer auth to the renderer', async () => {
    const upload = {
      id: 'file-1', name: 'design.png', media_type: 'image/png', size: 3,
      created_at: '2026-07-24T00:00:00.000Z'
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, msg: 'ok', data: upload }), {
        status: 200, headers: { 'content-type': 'application/json' }
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200, headers: { 'content-type': 'application/octet-stream' }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, msg: 'ok', data: { deleted: true } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.uploadFile({
      bytes: new Uint8Array([1, 2, 3]), name: 'design.png', mediaType: 'image/png'
    })).resolves.toEqual(upload)
    const uploadInit = fetchImpl.mock.calls[0]?.[1]
    expect(uploadInit?.body).toBeInstanceOf(FormData)
    expect(new Headers(uploadInit?.headers).get('authorization')).toBe('Bearer secret')
    expect(new Headers(uploadInit?.headers).has('content-type')).toBe(false)
    await expect(client.downloadFile('file/1')).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await expect(client.deleteFile('file/1')).resolves.toEqual({ deleted: true })
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:1234/api/v1/files/file%2F1',
      expect.objectContaining({ headers: expect.any(Headers) })
    )
  })

  it('reads child sessions and official Session warnings', async () => {
    const session = {
      id: 'session-child', workspace_id: 'wd_project_123456789abc', title: 'Child',
      created_at: null, updated_at: null, busy: false,
      metadata: { cwd: '/tmp/project', parent_session_id: 'session-parent' },
      agent_config: { model: 'kimi-for-coding' },
      usage: { input_tokens: 0, output_tokens: 0, context_tokens: 0, context_limit: 262144 },
      permission_rules: [], message_count: 0, last_seq: 0
    }
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0, msg: 'ok', data: { items: [session], has_more: false }
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 0,
        msg: 'ok',
        data: { warnings: [{ code: 'agents_too_large', message: 'AGENTS.md is large', severity: 'warning' }] }
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const client = new KimiRestClient({ origin: 'http://127.0.0.1:1234', token: 'secret', fetchImpl })

    await expect(client.listChildSessions('session/parent')).resolves.toEqual([session])
    await expect(client.getSessionWarnings('session/parent')).resolves.toEqual([
      { code: 'agents_too_large', message: 'AGENTS.md is large', severity: 'warning' }
    ])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:1234/api/v1/sessions/session%2Fparent/children?page_size=100'
    )
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'http://127.0.0.1:1234/api/v1/sessions/session%2Fparent/warnings'
    )
  })
})
