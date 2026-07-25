<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PetPointerPosition, PetSessionState } from '@shared/contracts'
import LumiSprite from './components/LumiSprite.vue'

const state = ref<PetSessionState | null>(null)
const fixtureStatus = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('pet-fixture')
  : null
const now = ref(Date.now())
const dragging = ref(false)
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

onMounted(async () => {
  if (fixtureStatus === 'running' || fixtureStatus === 'completed') {
    state.value = {
      serverId: 'fixture-server',
      workspaceId: 'fixture-workspace',
      workspaceName: 'Moon Code',
      sessionId: 'fixture-session',
      title: fixtureStatus === 'running' ? '正在构建月狐宠物' : '月狐宠物已完成',
      status: fixtureStatus,
      pendingInteraction: 'none',
      backgroundActivity: false,
      unread: fixtureStatus === 'completed',
      startedAt: fixtureStatus === 'running' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(),
      latestTool: null,
      overflowCount: 0
    }
    return
  }
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
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
    @contextmenu.prevent
  >
    <div class="pet-tooltip" role="status">
      <strong>{{ state?.title ?? 'Moon Code' }}</strong>
      <span>{{ state?.workspaceName ?? '正在连接' }}</span>
      <small>{{ statusLabel }}<template v-if="elapsed"> · {{ elapsed }}</template></small>
    </div>

    <div class="pet-character" aria-hidden="true">
      <LumiSprite
        :status="state?.status ?? 'disconnected'"
      />
      <div v-if="(state?.overflowCount ?? 0) > 0" class="pet-overflow">+{{ state?.overflowCount }}</div>
    </div>
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
  padding: 5px 5px 7px;
  cursor: grab;
  touch-action: none;
}

.pet-root.is-dragging { cursor: grabbing; }
.pet-root.is-running { --pet-accent: #2563eb; --pet-soft: rgba(37, 99, 235, 0.18); }
.pet-root:not(.is-running) { --pet-accent: #16a36a; --pet-soft: rgba(22, 163, 106, 0.18); }

.pet-tooltip {
  position: absolute;
  top: 2px;
  left: 3px;
  right: 3px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 6px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 8px;
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
.pet-overflow { position: absolute; left: -1px; bottom: 1px; display: grid; min-width: 17px; height: 14px; padding: 0 3px; place-items: center; border: 1px solid rgba(255,255,255,0.92); border-radius: 999px; color: #536273; background: rgba(247,250,252,0.96); font-size: 7px; font-weight: 760; }
</style>
