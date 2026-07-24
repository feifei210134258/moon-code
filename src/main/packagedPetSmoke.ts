import { EventEmitter } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { PetOpenSessionIntent, PetRosterState } from '../shared/contracts.js'
import { rendererEntryUrl } from './security/trustedRenderer.js'
import { KimiPetWindowManager } from './pet/KimiPetWindowManager.js'
import type { KimiPetService } from './pet/KimiPetService.js'
import { PetPositionStore } from './pet/PetPositionStore.js'

const MARKER = 'KIMI_PACKAGED_PET_OK'

class SmokePetService extends EventEmitter {
  state: PetRosterState = {
    connected: true,
    items: [{
      serverId: 'pet-smoke-server',
      workspaceId: 'pet-smoke-workspace',
      workspaceName: 'Pet Smoke Project',
      sessionId: 'pet-smoke-session',
      title: 'Pet smoke task',
      status: 'waiting',
      pendingInteraction: 'approval',
      backgroundActivity: false,
      unread: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      latestTool: null,
      overflowCount: 0
    }],
    overflow: 0,
    updatedAt: new Date().toISOString()
  }
}

export async function runPackagedPetSmoke(timeoutMs = 15_000): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'kimi-pet-smoke-'))
  const service = new SmokePetService()
  let intent: PetOpenSessionIntent | null = null
  const before = new Set(BrowserWindow.getAllWindows())
  const manager = new KimiPetWindowManager(service as unknown as KimiPetService, {
    trustedRendererUrl: rendererEntryUrl(join(__dirname, '../renderer/index.html')),
    positionStore: new PetPositionStore(join(root, 'positions.json')),
    onOpenSession: (value) => { intent = value }
  })
  try {
    manager.start()
    const petWindow = await waitForWindow(before, timeoutMs)
    await waitFor(() => !petWindow.webContents.isLoading(), timeoutMs)
    const diagnostics = await petWindow.webContents.executeJavaScript(`({
      kimiAgent: typeof window.kimiAgent,
      kimiPet: typeof window.kimiPet,
      process: typeof process,
      require: typeof require,
      text: document.body.innerText
    })`) as Record<string, string>
    if (
      diagnostics.kimiAgent !== 'undefined' ||
      diagnostics.kimiPet !== 'object' ||
      diagnostics.process !== 'undefined' ||
      diagnostics.require !== 'undefined'
    ) throw new Error(`Pet preload boundary failed: ${JSON.stringify(diagnostics)}`)
    const visibleText = diagnostics.text ?? ''
    if (!visibleText.includes('Pet smoke task') || !visibleText.includes('等待授权')) {
      throw new Error(`Pet Renderer did not project the assigned state: ${visibleText}`)
    }
    if (!petWindow.isAlwaysOnTop() || petWindow.isResizable()) {
      throw new Error('Pet BrowserWindow lost its always-on-top or fixed-size contract')
    }

    await petWindow.webContents.executeJavaScript('window.kimiPet.openSession()')
    await waitFor(() => intent !== null, timeoutMs)
    const opened = intent as PetOpenSessionIntent | null
    if (
      opened?.serverId !== 'pet-smoke-server' ||
      opened.workspaceId !== 'pet-smoke-workspace' ||
      opened.sessionId !== 'pet-smoke-session' ||
      opened.focus !== 'interaction'
    ) throw new Error(`Pet Session intent was not bound correctly: ${JSON.stringify(opened)}`)
  } finally {
    manager.close()
  }
}

async function waitForWindow(before: Set<BrowserWindow>, timeoutMs: number): Promise<BrowserWindow> {
  let result: BrowserWindow | null = null
  await waitFor(() => {
    result = BrowserWindow.getAllWindows().find((window) => !before.has(window)) ?? null
    return result !== null
  }, timeoutMs)
  if (result === null) throw new Error('Pet window was not created')
  return result
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('Timed out waiting for packaged Pet diagnostics')
}

export { MARKER as PACKAGED_PET_SMOKE_MARKER }
