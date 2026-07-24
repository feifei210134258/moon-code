import { afterEach, describe, expect, it } from 'vitest'
import { KimiApiError } from '../../packages/kimi-adapter/src/transport/KimiRestClient.js'
import { KimiSessionBridge } from '../../src/main/kimi/KimiSessionBridge.js'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

const runIntegration = process.env.KIMI_RUNTIME_INTEGRATION === '1'
const manager = new KimiRuntimeManager({ startupTimeoutMs: 30_000 })

describe.skipIf(!runIntegration)('managed Kimi runtime integration', () => {
  afterEach(async () => {
    await manager.stop()
  })

  it('starts the pinned runtime, reads metadata, and stops without exposing its token', async () => {
    const running = await manager.start('managed')

    expect(running).toEqual(
      expect.objectContaining({
        status: 'running',
        mode: 'managed',
        version: '0.29.0'
      })
    )
    expect(running.serverId).toEqual(expect.any(String))
    expect(running.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(JSON.stringify(running)).not.toContain('token')

    const rest = manager.createRestClient()
    const [auth, models, providers, config] = await Promise.all([
      rest.getAuth(),
      rest.listModels(),
      rest.listProviders(),
      rest.getConfig()
    ])
    expect(auth).toEqual(expect.objectContaining({
      ready: expect.any(Boolean),
      providers_count: expect.any(Number)
    }))
    expect(models).toEqual(expect.any(Array))
    expect(providers).toEqual(expect.any(Array))
    expect(config).toEqual(expect.objectContaining({ providers: expect.any(Object) }))
    const managedUsage = await rest.getOAuthUsage()
    if (managedUsage.kind === 'ok') {
      expect(managedUsage.limits).toEqual(expect.any(Array))
      expect(managedUsage.summary === null || typeof managedUsage.summary.label === 'string').toBe(true)
    } else {
      expect(managedUsage).toEqual(expect.objectContaining({ message: expect.any(String) }))
    }
    if (providers[0] !== undefined) {
      await expect(rest.getProvider(providers[0].id)).resolves.toEqual(
        expect.objectContaining({ id: providers[0].id })
      )
    }
    const workspaces = await rest.listWorkspaces()
    expect(workspaces).toEqual(expect.any(Array))
    if (workspaces[0] !== undefined) {
      await expect(rest.listWorkspaceSkills(workspaces[0].id)).resolves.toEqual(expect.any(Array))
    }
    await expect(rest.listMcpServers()).resolves.toEqual(expect.any(Array))
    const sessions = await rest.listSessions({ includeArchive: false })
    expect(sessions).toEqual(expect.any(Array))

    const ws = manager.createWsClient({ clientId: 'kimi-agent-integration-test' })
    const firstSession = sessions[0]
    if (firstSession === undefined) {
      await ws.connect({ subscriptions: [] })
    } else {
      const snapshot = await rest.getSessionSnapshot(firstSession.id)
      expect(snapshot).toEqual(expect.objectContaining({
        as_of_seq: expect.any(Number),
        epoch: expect.any(String),
        session: expect.objectContaining({ id: firstSession.id }),
        messages: expect.objectContaining({ items: expect.any(Array) })
      }))
      const transcript = await rest.getSessionTranscript(firstSession.id)
      expect(transcript).toEqual(expect.objectContaining({
        agent_id: 'main',
        items: expect.any(Array)
      }))
      await expect(rest.listSessionSkills(firstSession.id)).resolves.toEqual(expect.any(Array))
      await expect(rest.listTools(firstSession.id)).resolves.toEqual(expect.any(Array))
      const files = await rest.listFiles(firstSession.id, { path: '.', limit: 20 })
      expect(files).toEqual(expect.objectContaining({ items: expect.any(Array), truncated: expect.any(Boolean) }))
      const readableFile = files.items.find((entry) =>
        entry.kind === 'file' && entry.is_binary !== true && (entry.size ?? 0) <= 100_000
      )
      if (readableFile !== undefined) {
        const preview = await rest.readFile(firstSession.id, readableFile.path, { length: 100_000 })
        expect(preview).toEqual(expect.objectContaining({ path: readableFile.path, content: expect.any(String) }))
      }
      try {
        const git = await rest.getGitStatus(firstSession.id)
        expect(git).toEqual(expect.objectContaining({ entries: expect.any(Object) }))
        const changedPath = Object.keys(git.entries).find((path) => git.entries[path] !== 'clean')
        if (changedPath !== undefined) {
          const diff = await rest.getFileDiff(firstSession.id, changedPath)
          expect(diff).toEqual(expect.objectContaining({ path: changedPath, diff: expect.any(String) }))
        }
      } catch (error) {
        expect(error).toBeInstanceOf(KimiApiError)
        expect(error).toEqual(expect.objectContaining({ code: 40908 }))
      }
      await ws.connect({
        subscriptions: [firstSession.id],
        cursors: { [firstSession.id]: { seq: snapshot.as_of_seq, epoch: snapshot.epoch } }
      })

      const bridge = new KimiSessionBridge(manager)
      await bridge.openSession(firstSession.id)
      const terminal = await bridge.createTerminal(firstSession.id, { cols: 80, rows: 24 })
      let terminalClosed = false
      try {
        expect(manager.backend).toBe('v2')
        await expect(bridge.listTerminals(firstSession.id)).resolves.toEqual(
          expect.arrayContaining([expect.objectContaining({ id: terminal.id })])
        )
        const marker = 'KIMI_TERMINAL_SMOKE_OK'
        const output = waitForTerminalOutput(bridge, firstSession.id, terminal.id, marker)
        await bridge.attachTerminal(firstSession.id, terminal.id)
        await bridge.resizeTerminal(firstSession.id, terminal.id, 100, 28)
        await bridge.sendTerminalInput(firstSession.id, terminal.id, `printf '${marker}\\n'\r`)
        await expect(output).resolves.toContain(marker)
        await bridge.closeTerminal(firstSession.id, terminal.id)
        terminalClosed = true
      } finally {
        if (!terminalClosed) {
          try {
            await bridge.closeTerminal(firstSession.id, terminal.id)
          } catch {
            // The server may have already closed the PTY after a transport failure.
          }
        }
        await bridge.close()
      }
    }
    ws.close()
  }, 40_000)
})

function waitForTerminalOutput(
  bridge: KimiSessionBridge,
  sessionId: string,
  terminalId: string,
  marker: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    const cleanup = (): void => {
      bridge.off('terminal-output', onOutput)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Timed out waiting for terminal output: ${marker}`))
    }, 10_000)
    const onOutput = (output: { sessionId: string; terminalId: string; data: string }): void => {
      if (output.sessionId !== sessionId || output.terminalId !== terminalId) return
      text += output.data
      if (!text.includes(marker)) return
      clearTimeout(timer)
      cleanup()
      resolve(text)
    }
    bridge.on('terminal-output', onOutput)
  })
}
