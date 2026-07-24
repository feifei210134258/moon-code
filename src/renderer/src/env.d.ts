/// <reference types="vite/client" />

import type { KimiAgentDesktopApi, KimiPetWindowApi } from '../../shared/contracts'

declare global {
  interface Window {
    kimiAgent?: KimiAgentDesktopApi
    kimiPet?: KimiPetWindowApi
  }
}

export {}
