import { join } from 'node:path'
import { app, BrowserWindow, Notification, shell } from 'electron'
import { registerIpc } from './ipc.js'
import { KimiSessionBridge } from './kimi/KimiSessionBridge.js'
import { KimiSettingsBridge } from './kimi/KimiSettingsBridge.js'
import { KimiCapabilitiesBridge } from './kimi/KimiCapabilitiesBridge.js'
import { KimiBrowserManager } from './browser/KimiBrowserManager.js'
import { KimiUsageService } from './kimi/KimiUsageService.js'
import { UsagePreferencesStore } from './kimi/UsagePreferencesStore.js'
import { KimiNotificationService } from './kimi/KimiNotificationService.js'
import { KimiPetService } from './pet/KimiPetService.js'
import { KimiPetWindowManager } from './pet/KimiPetWindowManager.js'
import { PetPositionStore } from './pet/PetPositionStore.js'
import { KimiRuntimeManager } from './runtime/KimiRuntimeManager.js'
import { isTrustedRendererUrl, rendererEntryUrl } from './security/trustedRenderer.js'
import { PACKAGED_PTY_SMOKE_MARKER, runPackagedPtySmoke } from './packagedPtySmoke.js'
import { PACKAGED_BROWSER_SMOKE_MARKER, runPackagedBrowserSmoke } from './packagedBrowserSmoke.js'
import { PACKAGED_PET_SMOKE_MARKER, runPackagedPetSmoke } from './packagedPetSmoke.js'
import { ipcChannels, type PetOpenSessionIntent } from '../shared/contracts.js'

let mainWindow: BrowserWindow | null = null
const runtime = new KimiRuntimeManager()
const sessions = new KimiSessionBridge(runtime)
const settings = new KimiSettingsBridge(runtime)
const capabilities = new KimiCapabilitiesBridge(runtime)
const browser = new KimiBrowserManager(runtime, () => mainWindow)
const pets = new KimiPetService(runtime)
const notifications = new KimiNotificationService({
  isSupported: () => Notification.isSupported(),
  show: ({ title, body }) => new Notification({ title, body }).show(),
  beep: () => shell.beep()
})
const usage = new KimiUsageService(runtime, {
  preferencesStore: new UsagePreferencesStore(() => join(app.getPath('userData'), 'usage-preferences.json')),
  onUnauthorized: () => {
    void settings.getSnapshot().catch(() => undefined)
  },
  notifyThreshold: ({ window, threshold }) => {
    notifications.notifyUsageThreshold({ window, threshold }, usage.state.preferences)
  },
  notifyTurnCompletion: (notice) => {
    notifications.notifyTurnCompletion(notice, usage.state.preferences)
  }
})
let quitting = false
let petWindows: KimiPetWindowManager | null = null

function getTrustedRendererUrl(): string {
  return process.env.ELECTRON_RENDERER_URL ?? rendererEntryUrl(join(__dirname, '../renderer/index.html'))
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1488,
    height: 1040,
    minWidth: 920,
    minHeight: 680,
    show: false,
    title: 'Moon Code',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#F7FAFC',
    ...(process.platform === 'darwin'
      ? { vibrancy: 'under-window', visualEffectState: 'active' as const }
      : {}),
    webPreferences: {
      // Sandboxed preload scripts must be CommonJS in Electron. Keeping the
      // bridge in a .cjs bundle makes the security sandbox and typed IPC work
      // together instead of silently leaving `window.kimiAgent` undefined.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url, getTrustedRendererUrl())) event.preventDefault()
  })
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    browser.destroyGuest()
    if (mainWindow === window) mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

function openMainWindowForPet(intent: PetOpenSessionIntent): void {
  const window = mainWindow ?? createMainWindow()
  const sendIntent = (): void => {
    if (!window.isDestroyed()) window.webContents.send(ipcChannels.petOpenSession, intent)
  }
  if (window.webContents.isLoadingMainFrame()) window.webContents.once('did-finish-load', sendIntent)
  else sendIntent()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

if (process.argv.includes('--smoke-node-pty')) {
  app.whenReady()
    .then(() => runPackagedPtySmoke())
    .then(() => {
      process.stdout.write(`${PACKAGED_PTY_SMOKE_MARKER}\n`)
      quitting = true
      app.exit(0)
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      quitting = true
      app.exit(1)
    })
} else if (process.argv.includes('--smoke-browser')) {
  app.whenReady()
    .then(() => runPackagedBrowserSmoke())
    .then(() => {
      process.stdout.write(`${PACKAGED_BROWSER_SMOKE_MARKER}\n`)
      quitting = true
      app.exit(0)
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      quitting = true
      app.exit(1)
    })
} else if (process.argv.includes('--smoke-pet')) {
  app.whenReady()
    .then(() => runPackagedPetSmoke())
    .then(() => {
      process.stdout.write(`${PACKAGED_PET_SMOKE_MARKER}\n`)
      quitting = true
      app.exit(0)
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
      quitting = true
      app.exit(1)
    })
} else {
  app.whenReady().then(() => {
    usage.start()
    pets.start()
    const trustedRendererUrl = getTrustedRendererUrl()
    registerIpc(runtime, sessions, settings, capabilities, browser, usage, pets, () => mainWindow, trustedRendererUrl)
    petWindows = new KimiPetWindowManager(pets, {
      trustedRendererUrl,
      positionStore: new PetPositionStore(join(app.getPath('userData'), 'pet-positions.json')),
      onOpenSession: openMainWindowForPet
    })
    petWindows.start()
    mainWindow = createMainWindow()
    // Moon Code uses the Kimi Code CLI installed by the user. Start it as
    // soon as the application opens so the renderer can use its sessions
    // without asking the user to choose a connection method.
    void runtime.start('system')

    app.on('activate', () => {
      if (mainWindow === null) mainWindow = createMainWindow()
    })
    app.on('browser-window-focus', () => {
      usage.setActive(true)
      void usage.refresh()
    })
    app.on('browser-window-blur', () => usage.setActive(false))
  })
}

app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  void Promise.all([
    sessions.close().catch(() => undefined),
    browser.close().catch(() => undefined)
  ])
    .then(async () => {
      usage.close()
      petWindows?.close()
      pets.close()
      if (runtime.state.status !== 'stopped') await runtime.stop()
    })
    .finally(() => app.exit(0))
})

app.on('window-all-closed', () => {
  if (!process.argv.includes('--smoke-node-pty') && process.platform !== 'darwin') app.quit()
})
