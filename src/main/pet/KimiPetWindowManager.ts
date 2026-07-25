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
  state: PetSessionState
  drag: DragState | null
}

export interface KimiPetWindowManagerOptions {
  trustedRendererUrl: string
  positionStore: PetPositionStore
  onOpenSession: (intent: PetOpenSessionIntent) => void
  preloadPath?: string
  windowSize?: { width: number; height: number }
}

const DEFAULT_SIZE = { width: 112, height: 140 }
const EDGE_MARGIN = 8

export class KimiPetWindowManager {
  readonly #service: KimiPetService
  readonly #trustedRendererUrl: string
  readonly #positionStore: PetPositionStore
  readonly #onOpenSession: (intent: PetOpenSessionIntent) => void
  readonly #preloadPath: string
  readonly #windowSize: { width: number; height: number }
  readonly #windows = new Map<string, PetWindowRecord>()
  readonly #creating = new Set<string>()
  #started = false
  #enabled = false
  #latestRoster: PetRosterState | null = null

  readonly #onRosterChanged = (roster: PetRosterState): void => {
    this.#latestRoster = roster
    void this.#reconcile(roster)
  }

  readonly #onBootstrap = (event: IpcMainInvokeEvent): PetSessionState => {
    const record = this.#recordForSender(event)
    return { ...record.state }
  }

  readonly #onOpen = (event: IpcMainEvent): void => {
    const record = this.#recordForSender(event)
    this.#onOpenSession({
      serverId: record.state.serverId,
      workspaceId: record.state.workspaceId,
      sessionId: record.state.sessionId,
      focus: record.state.pendingInteraction !== 'none'
        ? 'interaction'
        : record.state.unread
          ? 'unread'
          : 'latest'
    })
  }

  readonly #onDragStart = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    const pointer = validatePointer(input)
    record.drag = { pointer, bounds: record.window.getBounds() }
  }

  readonly #onDragMove = (event: IpcMainEvent, input?: unknown): void => {
    const record = this.#recordForSender(event)
    if (record.drag === null) return
    const pointer = validatePointer(input)
    const display = screen.getDisplayNearestPoint({ x: Math.round(pointer.screenX), y: Math.round(pointer.screenY) })
    const x = record.drag.bounds.x + Math.round(pointer.screenX - record.drag.pointer.screenX)
    const y = record.drag.bounds.y + Math.round(pointer.screenY - record.drag.pointer.screenY)
    record.window.setPosition(
      clamp(x, display.workArea.x, display.workArea.x + display.workArea.width - this.#windowSize.width),
      clamp(y, display.workArea.y, display.workArea.y + display.workArea.height - this.#windowSize.height),
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
    for (const record of this.#windows.values()) record.window.destroy()
    this.#windows.clear()
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
    for (const record of this.#windows.values()) record.window.destroy()
    this.#windows.clear()
    this.#creating.clear()
  }

  async #reconcile(roster: PetRosterState): Promise<void> {
    if (!this.#started || !this.#enabled) return
    const desired = new Map(roster.items.map((state) => [state.sessionId, state]))
    for (const [sessionId, record] of this.#windows) {
      const state = desired.get(sessionId)
      if (state === undefined) {
        this.#windows.delete(sessionId)
        record.window.destroy()
        continue
      }
      record.state = state
      if (!record.window.isDestroyed()) record.window.webContents.send(ipcChannels.petStateChanged, state)
    }

    for (const [index, state] of roster.items.entries()) {
      if (this.#windows.has(state.sessionId) || this.#creating.has(state.sessionId)) continue
      this.#creating.add(state.sessionId)
      try {
        await this.#createWindow(state, index)
      } finally {
        this.#creating.delete(state.sessionId)
      }
    }
  }

  async #createWindow(state: PetSessionState, index: number): Promise<void> {
    if (!this.#started || !this.#enabled || this.#windows.has(state.sessionId)) return
    const bounds = await this.#initialBounds(state.sessionId, index)
    const currentState = this.#latestRoster?.items.find((item) => item.sessionId === state.sessionId)
    if (!this.#started || !this.#enabled || currentState === undefined) return
    state = currentState
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
    const record: PetWindowRecord = { window, state, drag: null }
    this.#windows.set(state.sessionId, record)

    window.setAlwaysOnTop(true, process.platform === 'darwin' ? 'floating' : 'normal')
    if (process.platform === 'darwin') window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event, url) => {
      if (!isTrustedRendererUrl(url, this.#trustedRendererUrl)) event.preventDefault()
    })
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.on('closed', () => {
      const current = this.#windows.get(state.sessionId)
      if (current?.window === window) this.#windows.delete(state.sessionId)
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

  async #initialBounds(sessionId: string, index: number): Promise<Rectangle> {
    const stored = await this.#positionStore.get(sessionId)
    const displays = screen.getAllDisplays()
    const display = displays.find((candidate) => String(candidate.id) === stored?.displayId)
      ?? screen.getPrimaryDisplay()
    const edge = stored?.edge ?? 'right'
    const x = edge === 'left'
      ? display.workArea.x + EDGE_MARGIN
      : display.workArea.x + display.workArea.width - this.#windowSize.width - EDGE_MARGIN
    const defaultY = display.workArea.y + 28 + index * (this.#windowSize.height + 8)
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
    await this.#positionStore.set(record.state.sessionId, {
      displayId: String(display.id),
      edge,
      offsetY: (y - display.workArea.y) / availableY
    })
  }

  #recordForSender(event: IpcMainEvent | IpcMainInvokeEvent): PetWindowRecord {
    const record = [...this.#windows.values()].find((candidate) => candidate.window.webContents === event.sender)
    const senderUrl = event.senderFrame?.url ?? ''
    if (record === undefined || !isTrustedRendererUrl(senderUrl, this.#trustedRendererUrl)) {
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
