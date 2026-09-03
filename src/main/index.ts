import { join } from 'node:path'
import { app, BrowserWindow, Notification, screen, shell } from 'electron'
import { registerIpc } from './ipc.js'
import { KimiSessionBridge } from './kimi/KimiSessionBridge.js'
import { KimiConfigFileWatcher } from './kimi/KimiConfigFileWatcher.js'
import { KimiSettingsBridge } from './kimi/KimiSettingsBridge.js'
import { KimiRemoteControlBridge } from './kimi/KimiRemoteControlBridge.js'
import { KimiTowerBridge } from './kimi/KimiTowerBridge.js'
import { KimiCapabilitiesBridge } from './kimi/KimiCapabilitiesBridge.js'
import { KimiBrowserManager } from './browser/KimiBrowserManager.js'
import { KimiUsageService } from './kimi/KimiUsageService.js'
import { UsagePreferencesStore } from './kimi/UsagePreferencesStore.js'
import { KimiNotificationService } from './kimi/KimiNotificationService.js'
import { KimiPetService } from './pet/KimiPetService.js'
import { KimiPetWindowManager } from './pet/KimiPetWindowManager.js'
import { PetPositionStore } from './pet/PetPositionStore.js'
import { EMPTY_WINDOW_STATE, WindowStateStore, resolveWindowState, type StoredWindowState } from './WindowStateStore.js'
import { KimiRuntimeManager } from './runtime/KimiRuntimeManager.js'
import { SecondaryModelPreferencesStore } from './runtime/SecondaryModelPreferencesStore.js'
import { RemoteControlPreferencesStore } from './runtime/RemoteControlPreferencesStore.js'
import { TowerPreferencesStore } from './runtime/TowerPreferencesStore.js'
import { KimiCliUpdateService } from './runtime/KimiCliUpdateService.js'
import { isTrustedRendererUrl, rendererEntryUrl } from './security/trustedRenderer.js'
import { PACKAGED_PTY_SMOKE_MARKER, runPackagedPtySmoke } from './packagedPtySmoke.js'
import { PACKAGED_BROWSER_SMOKE_MARKER, runPackagedBrowserSmoke } from './packagedBrowserSmoke.js'
import { PACKAGED_PET_SMOKE_MARKER, runPackagedPetSmoke } from './packagedPetSmoke.js'
import { ipcChannels, type KimiUsageState, type PetOpenSessionIntent } from '../shared/contracts.js'

let mainWindow: BrowserWindow | null = null
const secondaryModelPreferences = new SecondaryModelPreferencesStore(
  () => join(app.getPath('userData'), 'secondary-model-preferences.json')
)
const remoteControlPreferences = new RemoteControlPreferencesStore(
  () => join(app.getPath('userData'), 'remote-control-preferences.json')
)
const towerPreferences = new TowerPreferencesStore(
  () => join(app.getPath('userData'), 'tower-preferences.json')
)
const runtime = new KimiRuntimeManager({
  clientVersion: app.getVersion(),
  secondaryModelPreferencesStore: secondaryModelPreferences,
  remoteControlPreferencesStore: remoteControlPreferences,
  towerPreferencesStore: towerPreferences
})
const cliUpdates = new KimiCliUpdateService()
const sessions = new KimiSessionBridge(runtime, new KimiConfigFileWatcher())
const settings = new KimiSettingsBridge(runtime, secondaryModelPreferences)
const remoteControl = new KimiRemoteControlBridge(runtime, remoteControlPreferences)
const tower = new KimiTowerBridge(runtime, towerPreferences)
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
const syncPetWindowPreference = (state: KimiUsageState): void => {
  petWindows?.setEnabled(state.preferences.petEnabled === true)
}

const MAIN_WINDOW_LIMITS = { defaultWidth: 1488, defaultHeight: 1040, minWidth: 920, minHeight: 680 } as const
const windowStates = new WindowStateStore(() => join(app.getPath('userData'), 'window-state.json'))
let lastWindowState: StoredWindowState = { ...EMPTY_WINDOW_STATE }

function getTrustedRendererUrl(): string {
  return process.env.ELECTRON_RENDERER_URL ?? rendererEntryUrl(join(__dirname, '../renderer/index.html'))
}

function createMainWindow(): BrowserWindow {
  // Restore the last closed window bounds when they still overlap a connected
  // display; otherwise fall back to the default centered size.
  const windowState = resolveWindowState(
    lastWindowState,
    screen.getAllDisplays().map((display) => display.bounds),
    MAIN_WINDOW_LIMITS
  )
  const window = new BrowserWindow({
    width: windowState.bounds.width,
    height: windowState.bounds.height,
    ...(windowState.bounds.x !== undefined && windowState.bounds.y !== undefined
      ? { x: windowState.bounds.x, y: windowState.bounds.y }
      : {}),
    minWidth: MAIN_WINDOW_LIMITS.minWidth,
    minHeight: MAIN_WINDOW_LIMITS.minHeight,
    show: false,
    title: 'Moon Code',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 18, y: 18 },
    // Windows：原生窗口控制按钮覆盖层（最小化/最大化/关闭），配色与顶栏一致，
    // 按钮宽度等系统行为（悬停、贴靠布局）由 Windows 原生绘制。
    // color/height 与渲染层 styles.css 的 --window-bg、.topbar 高度手工同步。
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#E0E0DF',
            symbolColor: '#1d1d1f',
            height: 56
          }
        }
      : {}),
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

  if (windowState.isMaximized) window.maximize()

  // Persist the window state so the next launch reopens with the same size.
  // Bounds are recorded debounced and only while the window is in its normal
  // state; the maximized flag is tracked separately.
  const saveWindowState = (patch: Partial<Pick<StoredWindowState, 'bounds' | 'isMaximized'>>): void => {
    lastWindowState = { ...lastWindowState, ...patch }
    void windowStates.save(lastWindowState).catch(() => undefined)
  }
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const recordWindowBounds = (): void => {
    if (boundsTimer !== null) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (window.isDestroyed() || window.isMaximized() || window.isFullScreen() || window.isMinimized()) return
      saveWindowState({ bounds: window.getBounds(), isMaximized: false })
    }, 300)
  }
  window.on('resize', recordWindowBounds)
  window.on('move', recordWindowBounds)
  window.on('maximize', () => saveWindowState({ isMaximized: true }))
  window.on('unmaximize', recordWindowBounds)
  window.on('close', () => {
    if (boundsTimer !== null) clearTimeout(boundsTimer)
    if (window.isMaximized()) saveWindowState({ isMaximized: true })
    else if (!window.isMinimized() && !window.isFullScreen()) {
      saveWindowState({ bounds: window.getBounds(), isMaximized: false })
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
  window.once('ready-to-show', () => {
    window.show()
    if (process.platform === 'darwin') {
      app.show()
      app.focus({ steal: true })
    }
    window.focus()

    // Pet windows are non-activating companions. Creating them before the
    // primary window has completed its first activation can push the app into
    // the background on macOS, making the first launch look like an exit.
    petWindows?.setEnabled(usage.state.preferences.petEnabled === true)
  })
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
  app.whenReady().then(async () => {
    usage.on('state-changed', syncPetWindowPreference)
    usage.start()
    pets.start()
    const trustedRendererUrl = getTrustedRendererUrl()
    registerIpc(runtime, sessions, settings, remoteControl, tower, capabilities, browser, usage, pets, cliUpdates, () => mainWindow, trustedRendererUrl)
    remoteControl.startWatching()
    petWindows = new KimiPetWindowManager(pets, {
      trustedRendererUrl,
      positionStore: new PetPositionStore(join(app.getPath('userData'), 'pet-positions.json')),
      onOpenSession: openMainWindowForPet
    })
    petWindows.start()
    // Load the persisted window state before the first window is created.
    lastWindowState = await windowStates.load()
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
    browser.close().catch(() => undefined),
    windowStates.flush().catch(() => undefined)
  ])
    .then(async () => {
      usage.off('state-changed', syncPetWindowPreference)
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
