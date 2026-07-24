import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { KimiUsageState } from '@shared/contracts'

export function useUsageBridge() {
  const state = ref<KimiUsageState>(emptyUsageState())
  const pending = ref(false)
  const error = ref<string | null>(null)
  let unsubscribe: (() => void) | undefined

  const load = async (): Promise<void> => {
    if (window.kimiAgent === undefined) return
    try {
      state.value = await window.kimiAgent.getKimiUsage()
    } catch (reason) {
      error.value = errorMessage(reason)
    }
  }

  const refresh = async (): Promise<void> => {
    if (window.kimiAgent === undefined || pending.value) return
    pending.value = true
    error.value = null
    try {
      state.value = await window.kimiAgent.refreshKimiUsage()
    } catch (reason) {
      error.value = errorMessage(reason)
    } finally {
      pending.value = false
    }
  }

  const onOnline = (): void => {
    void refresh()
  }

  onMounted(() => {
    unsubscribe = window.kimiAgent?.onKimiUsageStateChanged((next) => {
      state.value = next
    })
    window.addEventListener('online', onOnline)
    void load()
  })
  onBeforeUnmount(() => {
    unsubscribe?.()
    window.removeEventListener('online', onOnline)
  })

  return { state, pending, error, load, refresh }
}

function emptyUsageState(): KimiUsageState {
  return {
    phase: 'idle', summary: null, limits: [], extraUsage: null,
    updatedAt: null, nextRefreshAt: null, refreshing: false,
    source: 'kimi-oauth-usage', error: null,
    preferences: { infoThreshold: 0.5, warningThreshold: 0.8, criticalThreshold: 0.95, systemNotifications: true }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
