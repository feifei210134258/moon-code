import { join } from 'node:path'
import {
  BrowserWindow,
  ipcMain,
  screen,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle
} from 'electron'
import {
  ipcChannels,
  type PetOpenSessionIntent,
  type PetPointerPosition,
  type PetRosterState,
  type PetSessionState
} from '../../shared/contracts.js'
import { isTrustedRendererUrl } from '../security/trustedRenderer.js'
import type { KimiPetService } from './KimiPetService.js'
import { PetPositionStore } from './PetPositionStore.js'

interface DragState {
  pointer: PetPointerPosition
  bounds: Rectangle
}

interface PetWindowRecord {
  window: BrowserWindow
  roster: PetRosterState
  drag: DragState | null
  /** Bounds before the hover expansion; restores the pet footprint on leave. */
  collapsedBounds: Rectangle | null
}

export interface KimiPetWindowManagerOptions {
  trustedRendererUrl: string
  positionStore: PetPositionStore
  onOpenSession: (intent: PetOpenSessionIntent) => void
  preloadPath?: string
  windowSize?: { width: number; height: number }
}

const DEFAULT_SIZE = { width: 112, height: 140 }
// The session overlay is shown above the pet when hovered; the window grows
// towards the screen centre so the pet body itself never moves.
const EXPANDED_SIZE = { width: 240, height: 340 }
const EDGE_MARGIN = 8

export class KimiPetWindowManager {
  readonly #service: KimiPetService
  readonly #trustedRendererUrl: string
  readonly #positionStore: PetPositionStore
  readonly #onOpenSession: (intent: PetOpenSessionIntent) => void
  readonly #preloadPath: string
  readonly #windowSize: { width: number; height: number }
  #window: PetWindowRecord | null = null
  #creating = false
  #started = false
  #enabled = false
  #latestRoster: PetRosterState | null = null

  readonly #onRosterChanged = (roster: PetRosterState): void => {
    this.#latestRoster = roster
    void this.#reconcile(roster)
  }

  readonly #onBootstrap = (event: IpcMainInvokeEvent): PetRosterState => {
    const record = this.#recordForSender(event)
    return { ...record.roster, items: record.roster.items.map((item) => ({ ...item })) }
  }

  readonly #onOpen = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    const target = this.#sessionForInput(record.roster, input)
    if (target === undefined) throw new Error('Rejected pet open-session request: no matching session')
    this.#onOpenSession({
      serverId: target.serverId,
      workspaceId: target.workspaceId,
      sessionId: target.sessionId,
      focus: target.pendingInteraction !== 'none'
        ? 'interaction'
        : target.unread
          ? 'unread'
          : 'latest'
    })
  }

  readonly #onDragStart = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    const pointer = validatePointer(input)
    this.#collapse(record)
    record.drag = { pointer, bounds: record.window.getBounds() }
  }

  readonly #onDragMove = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    if (record.drag === null) return
    const pointer = validatePointer(input)
    const display = screen.getDisplayNearestPoint({ x: Math.round(pointer.screenX), y: Math.round(pointer.screenY) })
    const bounds = record.window.getBounds()
    const x = record.drag.bounds.x + Math.round(pointer.screenX - record.drag.pointer.screenX)
    const y = record.drag.bounds.y + Math.round(pointer.screenY - record.drag.pointer.screenY)
    record.window.setPosition(
      clamp(x, display.workArea.x, display.workArea.x + display.workArea.width - bounds.width),
      clamp(y, display.workArea.y, display.workArea.y + display.workArea.height - bounds.height),
      false
    )
  }

  readonly #onDragEnd = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    if (record.drag === null) return
    this.#onDragMove(event, input)
    record.drag = null
    void this.#snapAndSave(record)
  }

  readonly #onHoverChanged = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    if (input === true) {
      if (record.collapsedBounds !== null) return
      record.collapsedBounds = record.window.getBounds()
      this.#expand(record)
      return
    }
    if (input !== false) throw new TypeError('Invalid pet hover state')
    this.#collapse(record)
  }

  constructor(service: KimiPetService, options: KimiPetWindowManagerOptions) {
    this.#service = service
    this.#trustedRendererUrl = options.trustedRendererUrl
    this.#positionStore = options.positionStore
    this.#onOpenSession = options.onOpenSession
    this.#preloadPath = options.preloadPath ?? join(__dirname, '../preload/pet.cjs')
    this.#windowSize = options.windowSize ?? DEFAULT_SIZE
  }

  start(): void {
    if (this.#started) return
    this.#started = true
    ipcMain.handle(ipcChannels.petBootstrap, this.#onBootstrap)
    ipcMain.on(ipcChannels.petOpenSession, this.#onOpen)
    ipcMain.on(ipcChannels.petDragStart, this.#onDragStart)
    ipcMain.on(ipcChannels.petDragMove, this.#onDragMove)
    ipcMain.on(ipcChannels.petDragEnd, this.#onDragEnd)
    ipcMain.on(ipcChannels.petHoverChanged, this.#onHoverChanged)
    this.#service.on('state-changed', this.#onRosterChanged)
    this.#latestRoster = this.#service.state
    void this.#reconcile(this.#latestRoster)
  }

  setEnabled(enabled: boolean): void {
    if (this.#enabled === enabled) return
    this.#enabled = enabled
    if (!this.#started) return
    if (enabled) {
      if (this.#latestRoster !== null) void this.#reconcile(this.#latestRoster)
      return
    }
    this.#window?.window.destroy()
    this.#window = null
  }

  close(): void {
    if (!this.#started) return
    this.#started = false
    this.#service.off('state-changed', this.#onRosterChanged)
    ipcMain.removeHandler(ipcChannels.petBootstrap)
    ipcMain.off(ipcChannels.petOpenSession, this.#onOpen)
    ipcMain.off(ipcChannels.petDragStart, this.#onDragStart)
    ipcMain.off(ipcChannels.petDragMove, this.#onDragMove)
    ipcMain.off(ipcChannels.petDragEnd, this.#onDragEnd)
    ipcMain.off(ipcChannels.petHoverChanged, this.#onHoverChanged)
    this.#window?.window.destroy()
    this.#window = null
    this.#creating = false
  }

  async #reconcile(roster: PetRosterState): Promise<void> {
    if (!this.#started || !this.#enabled) return
    if (roster.items.length === 0) {
      this.#window?.window.destroy()
      this.#window = null
      return
    }
    const record = this.#window
    if (record !== null) {
      record.roster = roster
      if (!record.window.isDestroyed()) record.window.webContents.send(ipcChannels.petStateChanged, roster)
      return
    }
    if (this.#creating) return
    this.#creating = true
    try {
      await this.#createWindow(roster)
    } finally {
      this.#creating = false
    }
  }

  async #createWindow(roster: PetRosterState): Promise<void> {
    if (!this.#started || !this.#enabled || this.#window !== null) return
    const latest = this.#latestRoster
    if (latest === null || latest.items.length === 0) return
    roster = latest
    const bounds = await this.#initialBounds()
    if (!this.#started || !this.#enabled || this.#window !== null) return
    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.#preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true
      }
    })
    const record: PetWindowRecord = { window, roster, drag: null, collapsedBounds: null }
    this.#window = record

    window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'normal')
    if (process.platform === 'darwin') {
      window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        // Electron otherwise toggles the entire process between foreground
        // and UI-element activation policies. That hides the Dock icon and
        // primary window when the first pet appears.
        skipTransformProcessType: true
      })
    }
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!isTrustedRendererUrl(url, this.#trustedRendererUrl)) event.preventDefault()
    })
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.on('closed', () => {
      if (this.#window?.window === window) this.#window = null
    })
    window.once('ready-to-show', () => window.showInactive())

    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL)
      url.searchParams.set('pet-window', '1')
      await window.loadURL(url.toString())
    } else {
      await window.loadFile(join(__dirname, '../renderer/index.html'), { query: { 'pet-window': '1' } })
    }
  }

  async #initialBounds(): Promise<Rectangle> {
    const stored = await this.#positionStore.get()
    const displays = screen.getAllDisplays()
    const display = displays.find((candidate) => String(candidate.id) === stored?.displayId)
      ?? screen.getPrimaryDisplay()
    const edge = stored?.edge ?? 'right'
    const x = edge === 'left'
      ? display.workArea.x + EDGE_MARGIN
      : display.workArea.x + display.workArea.width - this.#windowSize.width - EDGE_MARGIN
    const defaultY = display.workArea.y + 28
    const storedY = stored === null
      ? defaultY
      : display.workArea.y + Math.round(stored.offsetY * Math.max(0, display.workArea.height - this.#windowSize.height))
    return {
      x,
      y: clamp(storedY, display.workArea.y, display.workArea.y + display.workArea.height - this.#windowSize.height),
      width: this.#windowSize.width,
      height: this.#windowSize.height
    }
  }

  /** Grows the window towards the screen centre so the pet body stays put. */
  #expand(record: PetWindowRecord): void {
    const current = record.window.getBounds()
    const display = screen.getDisplayMatching(current)
    const centerX = current.x + current.width / 2
    const displayCenter = display.workArea.x + display.workArea.width / 2
    const x = centerX < displayCenter
      ? current.x
      : current.x + current.width - EXPANDED_SIZE.width
    const y = Math.max(display.workArea.y, current.y + current.height - EXPANDED_SIZE.height)
    record.window.setBounds({
      x: clamp(x, display.workArea.x, display.workArea.x + Math.max(0, display.workArea.width - EXPANDED_SIZE.width)),
      y: clamp(y, display.workArea.y, display.workArea.y + Math.max(0, display.workArea.height - EXPANDED_SIZE.height)),
      width: EXPANDED_SIZE.width,
      height: EXPANDED_SIZE.height
    })
  }

  #collapse(record: PetWindowRecord): void {
    const bounds = record.collapsedBounds
    record.collapsedBounds = null
    if (bounds === null || record.window.isDestroyed()) return
    const display = screen.getDisplayMatching(bounds)
    record.window.setBounds({
      ...bounds,
      x: clamp(bounds.x, display.workArea.x, display.workArea.x + Math.max(0, display.workArea.width - bounds.width)),
      y: clamp(bounds.y, display.workArea.y, display.workArea.y + Math.max(0, display.workArea.height - bounds.height))
    })
  }

  async #snapAndSave(record: PetWindowRecord): Promise<void> {
    if (record.window.isDestroyed()) return
    const current = record.window.getBounds()
    const display = screen.getDisplayMatching(current)
    const centerX = current.x + current.width / 2
    const displayCenter = display.workArea.x + display.workArea.width / 2
    const edge = centerX < displayCenter ? 'left' : 'right'
    const x = edge === 'left'
      ? display.workArea.x + EDGE_MARGIN
      : display.workArea.x + display.workArea.width - current.width - EDGE_MARGIN
    const y = clamp(current.y, display.workArea.y, display.workArea.y + display.workArea.height - current.height)
    record.window.setPosition(x, y, true)
    const availableY = Math.max(1, display.workArea.height - current.height)
    await this.#positionStore.set({
      displayId: String(display.id),
      edge,
      offsetY: (y - display.workArea.y) / availableY
    })
  }

  #sessionForInput(roster: PetRosterState, input: unknown): PetSessionState | undefined {
    if (input === undefined) {
      if (roster.items.length === 1) return roster.items[0]
      return undefined
    }
    if (typeof input !== 'string' || input.length === 0 || input.length > 256) return undefined
    return roster.items.find((item) => item.sessionId === input)
  }

  #recordForSender(event: IpcMainEvent | IpcMainInvokeEvent): PetWindowRecord {
    const record = this.#window
    const senderUrl = event.senderFrame?.url ?? ''
    if (record === null || record.window.webContents !== event.sender || !isTrustedRendererUrl(senderUrl, this.#trustedRendererUrl)) {
      throw new Error('Rejected pet IPC request from an untrusted renderer')
    }
    return record
  }
}

function validatePointer(value: unknown): PetPointerPosition {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('screenX' in value) ||
    !('screenY' in value) ||
    typeof value.screenX !== 'number' ||
    typeof value.screenY !== 'number' ||
    !Number.isFinite(value.screenX) ||
    !Number.isFinite(value.screenY) ||
    Math.abs(value.screenX) > 1_000_000 ||
    Math.abs(value.screenY) > 1_000_000
  ) throw new TypeError('Invalid pet pointer position')
  return { screenX: value.screenX, screenY: value.screenY }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}
