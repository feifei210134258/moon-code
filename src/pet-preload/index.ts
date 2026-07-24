import { contextBridge, ipcRenderer } from 'electron'
import type { KimiPetWindowApi, PetSessionState } from '../shared/contracts.js'

// Keep these minimal channels local so Rollup does not create a shared preload
// chunk. Electron's sandbox preload loader only accepts the entry bundle and
// built-in modules when the app is inside asar.
const petChannels = {
  bootstrap: 'pet:bootstrap',
  openSession: 'pet:open-session',
  stateChanged: 'pet:state-changed',
  dragStart: 'pet:drag-start',
  dragMove: 'pet:drag-move',
  dragEnd: 'pet:drag-end'
} as const

const api: KimiPetWindowApi = {
  getState: () => ipcRenderer.invoke(petChannels.bootstrap),
  openSession: () => ipcRenderer.send(petChannels.openSession),
  beginDrag: (position) => ipcRenderer.send(petChannels.dragStart, position),
  moveDrag: (position) => ipcRenderer.send(petChannels.dragMove, position),
  endDrag: (position) => ipcRenderer.send(petChannels.dragEnd, position),
  onStateChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: PetSessionState): void => listener(state)
    ipcRenderer.on(petChannels.stateChanged, handler)
    return () => ipcRenderer.removeListener(petChannels.stateChanged, handler)
  }
}

contextBridge.exposeInMainWorld('kimiPet', api)
