import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { KimiSessionBridge } from '../../src/main/kimi/KimiSessionBridge.js'
import { KimiRuntimeManager } from '../../src/main/runtime/KimiRuntimeManager.js'

const runIntegration = process.env.KIMI_RUNTIME_CONVERSATION_INTEGRATION === '1'
const manager = new KimiRuntimeManager({ startupTimeoutMs: 30_000 })

describe.skipIf(!runIntegration)('managed Kimi Markdown image integration', () => {
  afterEach(async () => {
    await manager.stop()
  })

  it('reads a Workspace Markdown image through the Main-owned Session FS bridge', async () => {
    await manager.start('managed')
    const rest = manager.createRestClient()
    const root = resolve(process.cwd())
    let workspace = (await rest.listWorkspaces()).find((item) => resolve(item.root) === root)
    const createdWorkspace = workspace === undefined
    if (workspace === undefined) workspace = await rest.addWorkspace({ root, name: 'Kimi Agent P0 integration' })
    const session = await rest.createSession({ workspaceId: workspace.id, title: 'P0 Markdown image integration' })
    const bridge = new KimiSessionBridge(manager)
    try {
      await bridge.openSession(session.id)
      const image = await bridge.readMarkdownImage(session.id, 'docs/assets/main-workspace-visual-baseline.png')
      expect(image).toEqual(expect.objectContaining({
        path: 'docs/assets/main-workspace-visual-baseline.png', mediaType: 'image/png'
      }))
      expect(image?.dataUrl).toMatch(/^data:image\/png;base64,/)
      const auth = await rest.getAuth()
      expect(auth.ready ?? auth.models_ready).toBe(true)
      /* 0.39.1 移除了 /auth 的 default_model；默认模型统一从 /config 读取。 */
      const model = auth.default_model ?? (await rest.getConfig()).default_model
      if (model === null || model === undefined) throw new Error('Kimi Runtime has no default model for the P0 conversation smoke')
      await rest.submitPrompt(session.id, {
        content: [{ type: 'text', text: 'Reply only with: P0 smoke.' }],
        model,
        thinking: 'off',
        permissionMode: 'manual',
        planMode: false,
        swarmMode: false
      })
      await waitForTurnToFinish(rest, session.id)
      await bridge.compactSession(session.id, 'Keep the file-context boundary.')
      await waitForTurnToFinish(rest, session.id)
      // 0.33 起 undo 不允许跨越 compaction 边界，应被 SESSION_UNDO_UNAVAILABLE (40911) 拒绝。
      await expect(bridge.undoSession(session.id)).rejects.toMatchObject({ code: 40911 })
    } finally {
      await bridge.close()
      await rest.archiveSession(session.id).catch(() => undefined)
      if (createdWorkspace) await rest.deleteWorkspace(workspace.id).catch(() => undefined)
    }
  }, 40_000)
})

async function waitForTurnToFinish(
  rest: ReturnType<KimiRuntimeManager['createRestClient']>,
  sessionId: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snapshot = await rest.getSessionSnapshot(sessionId)
    if (!snapshot.session.main_turn_active && !snapshot.session.busy) return
    await new Promise<void>((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for the P0 conversation smoke turn')
}
