<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PetPointerPosition, PetSessionState } from '@shared/contracts'
import MimoSprite from './components/MimoSprite.vue'
import { petLookDirectionIndex, type PetDragDirection } from './utils/petSprite'

const state = ref<PetSessionState | null>(null)
const now = ref(Date.now())
const dragging = ref(false)
const dragDirection = ref<PetDragDirection>('right')
const lookDirection = ref<number | null>(null)
let startPointer: PetPointerPosition | null = null
let lastPointer: PetPointerPosition | null = null
let stopStateListener: (() => void) | null = null
let clock: ReturnType<typeof setInterval> | null = null

const statusLabel = computed(() => {
  const value = state.value
  if (value === null) return '正在连接'
  if (value.status === 'waiting') return value.pendingInteraction === 'question' ? '等待回答' : '等待授权'
  if (value.status === 'running') return value.backgroundActivity ? '后台执行' : '正在工作'
  if (value.status === 'completed') return '已完成'
  if (value.status === 'failed') return '运行失败'
  if (value.status === 'review') return '等待查看'
  if (value.status === 'disconnected') return '连接中断'
  return '空闲'
})

const elapsed = computed(() => {
  const startedAt = state.value?.startedAt
  if (startedAt === null || startedAt === undefined) return ''
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return ''
  const seconds = Math.max(0, Math.floor((now.value - started) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
})

function pointer(event: PointerEvent): PetPointerPosition {
  return { screenX: event.screenX, screenY: event.screenY }
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || window.kimiPet === undefined) return
  startPointer = pointer(event)
  lastPointer = startPointer
  dragging.value = false
  lookDirection.value = null
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (startPointer === null || window.kimiPet === undefined) return
  const current = pointer(event)
  if (!dragging.value) {
    if (Math.hypot(current.screenX - startPointer.screenX, current.screenY - startPointer.screenY) < 5) return
    dragging.value = true
    window.kimiPet.beginDrag(startPointer)
  }
  const deltaX = current.screenX - (lastPointer?.screenX ?? startPointer.screenX)
  if (deltaX < 0) dragDirection.value = 'left'
  else if (deltaX > 0) dragDirection.value = 'right'
  lastPointer = current
  window.kimiPet.moveDrag(current)
}

function onPointerUp(event: PointerEvent): void {
  if (startPointer === null || window.kimiPet === undefined) return
  if (dragging.value) window.kimiPet.endDrag(pointer(event))
  else window.kimiPet.openSession()
  startPointer = null
  lastPointer = null
  dragging.value = false
}

function onPointerCancel(event: PointerEvent): void {
  if (startPointer !== null && dragging.value) window.kimiPet?.endDrag(pointer(event))
  startPointer = null
  lastPointer = null
  dragging.value = false
}

function onPointerHover(event: PointerEvent): void {
  if (startPointer !== null || dragging.value || !(event.currentTarget instanceof HTMLElement)) return
  const bounds = event.currentTarget.getBoundingClientRect()
  lookDirection.value = petLookDirectionIndex(
    event.clientX - (bounds.left + bounds.width / 2),
    event.clientY - (bounds.top + bounds.height * 0.62)
  )
}

function onPointerLeave(): void {
  if (!dragging.value) lookDirection.value = null
}

onMounted(async () => {
  const api = window.kimiPet
  if (api === undefined) return
  stopStateListener = api.onStateChanged((next) => { state.value = next })
  state.value = await api.getState()
  clock = setInterval(() => { now.value = Date.now() }, 1_000)
})

onBeforeUnmount(() => {
  stopStateListener?.()
  if (clock !== null) clearInterval(clock)
})
</script>

<template>
  <main
    class="pet-root"
    :class="[`is-${state?.status ?? 'disconnected'}`, { 'is-dragging': dragging }]"
    :aria-label="state === null ? 'Kimi 桌宠' : `${state.title}，${statusLabel}`"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointermove.capture="onPointerHover"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @pointerleave="onPointerLeave"
    @contextmenu.prevent
  >
    <div class="pet-tooltip" role="status">
      <strong>{{ state?.title ?? 'Moon Code' }}</strong>
      <span>{{ state?.workspaceName ?? '正在连接' }}</span>
      <small>{{ statusLabel }}<template v-if="elapsed"> · {{ elapsed }}</template></small>
    </div>

    <div class="pet-character" aria-hidden="true">
      <MimoSprite
        :status="state?.status ?? 'disconnected'"
        :dragging="dragging"
        :drag-direction="dragDirection"
        :look-direction="lookDirection"
      />
      <div class="pet-status-dot" />
      <div v-if="state?.pendingInteraction !== 'none'" class="pet-attention">!</div>
      <div v-if="(state?.overflowCount ?? 0) > 0" class="pet-overflow">+{{ state?.overflowCount }}</div>
    </div>
    <div class="pet-status-label">{{ statusLabel }}</div>
  </main>
</template>

<style scoped>
:global(html.pet-window),
:global(html.pet-window body),
:global(html.pet-window #app) {
  background: transparent !important;
  color: #25303b;
  user-select: none;
}

.pet-root {
  --pet-accent: #7c93ad;
  --pet-soft: rgba(124, 147, 173, 0.18);
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 8px 8px 10px;
  cursor: grab;
  touch-action: none;
}

.pet-root.is-dragging { cursor: grabbing; }
.pet-root.is-running { --pet-accent: #2563eb; --pet-soft: rgba(37, 99, 235, 0.18); }
.pet-root.is-waiting { --pet-accent: #d58b25; --pet-soft: rgba(213, 139, 37, 0.2); }
.pet-root.is-completed { --pet-accent: #16a36a; --pet-soft: rgba(22, 163, 106, 0.2); }
.pet-root.is-failed { --pet-accent: #e25555; --pet-soft: rgba(226, 85, 85, 0.2); }
.pet-root.is-review { --pet-accent: #7c5ce7; --pet-soft: rgba(124, 92, 231, 0.18); }
.pet-root.is-disconnected { --pet-accent: #9aa4b1; --pet-soft: rgba(154, 164, 177, 0.16); filter: saturate(0.45); }

.pet-tooltip {
  position: absolute;
  top: 3px;
  left: 4px;
  right: 4px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 11px;
  background: rgba(250, 253, 255, 0.82);
  box-shadow: 0 9px 24px rgba(55, 72, 90, 0.14);
  backdrop-filter: blur(16px) saturate(1.08);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
  pointer-events: none;
}

.pet-root:hover .pet-tooltip,
.pet-root:focus-within .pet-tooltip { opacity: 1; transform: translateY(0); }
.pet-tooltip strong, .pet-tooltip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pet-tooltip strong { font-size: 10px; font-weight: 700; }
.pet-tooltip span { color: #687386; font-size: 9px; }
.pet-tooltip small { color: var(--pet-accent); font-size: 9px; font-weight: 650; }

.pet-character {
  position: relative;
  width: 96px;
  height: 104px;
}
.pet-status-dot { position: absolute; right: 2px; bottom: 4px; width: 13px; height: 13px; border: 3px solid rgba(247,250,252,0.95); border-radius: 50%; background: var(--pet-accent); }
.pet-attention { position: absolute; top: 2px; right: -2px; display: grid; width: 20px; height: 20px; place-items: center; border: 2px solid rgba(255,255,255,0.9); border-radius: 50%; color: white; background: var(--pet-accent); font-size: 12px; font-weight: 800; }
.pet-overflow { position: absolute; left: -2px; bottom: 2px; display: grid; min-width: 25px; height: 20px; padding: 0 5px; place-items: center; border: 2px solid rgba(255,255,255,0.92); border-radius: 999px; color: #536273; background: rgba(247,250,252,0.96); font-size: 9px; font-weight: 760; }
.pet-status-label { margin-top: 5px; padding: 3px 8px; border: 1px solid rgba(255,255,255,0.76); border-radius: 999px; color: var(--pet-accent); background: rgba(250,253,255,0.78); box-shadow: 0 4px 12px rgba(55,72,90,0.08); backdrop-filter: blur(10px); font-size: 9px; font-weight: 680; }
</style>
