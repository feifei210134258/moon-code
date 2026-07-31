<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  PetPointerPosition,
  PetRosterState,
  PetSessionState,
  PetVisualState
} from '@shared/contracts'
import LumiSprite from './components/LumiSprite.vue'

const roster = ref<PetRosterState | null>(null)
const fixtureStatus = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get('pet-fixture')
  : null
const now = ref(Date.now())
const dragging = ref(false)
const overlayOpen = ref(false)
const windowExpanded = ref(false)
let startPointer: PetPointerPosition | null = null
let lastPointer: PetPointerPosition | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let stopStateListener: (() => void) | null = null
let clock: ReturnType<typeof setInterval> | null = null

const STATUS_PRIORITY: Record<PetVisualState, number> = {
  disconnected: 7,
  waiting: 6,
  failed: 5,
  running: 4,
  completed: 3,
  review: 2,
  idle: 1
}

const items = computed(() => roster.value?.items ?? [])

// 宠物本体展示聚合状态：任一待交互优先于运行中，其余按 reducer 的固定优先级。
const bodyStatus = computed<PetVisualState>(() => {
  if (roster.value === null) return 'disconnected'
  let best: PetVisualState = 'idle'
  for (const item of items.value) {
    if (STATUS_PRIORITY[item.status] > STATUS_PRIORITY[best]) best = item.status
  }
  return best
})

const bodyLabel = computed(() => {
  if (items.value.length === 0) return '正在连接'
  const pending = waitingInteraction.value
  const status = bodyStatus.value
  if (status === 'waiting') return pending === 'question' ? '等待回答' : '等待授权'
  if (status === 'running') return items.value.some((item) => item.backgroundActivity) ? '后台执行' : '正在工作'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '运行失败'
  if (status === 'review') return '等待查看'
  if (status === 'disconnected') return '连接中断'
  return '空闲'
})

const rootLabel = computed(() => {
  if (items.value.length === 0) return 'Kimi 桌宠，正在连接'
  const title = items.value.length === 1
    ? items.value[0]!.title
    : `${items.value.length} 个任务`
  return `${title}，${bodyLabel.value}`
})

function statusLabelFor(item: Pick<PetSessionState, 'status' | 'pendingInteraction' | 'backgroundActivity'>): string {
  if (item.status === 'waiting') return item.pendingInteraction === 'question' ? '等待回答' : '等待授权'
  if (item.status === 'running') return item.backgroundActivity ? '后台执行' : '正在工作'
  if (item.status === 'completed') return '已完成'
  if (item.status === 'failed') return '运行失败'
  if (item.status === 'review') return '等待查看'
  if (item.status === 'disconnected') return '连接中断'
  return '空闲'
}

const waitingInteraction = computed<'question' | 'approval' | 'none'>(() => {
  const waiting = items.value.filter((item) => item.status === 'waiting')
  if (waiting.some((item) => item.pendingInteraction === 'question')) return 'question'
  if (waiting.some((item) => item.pendingInteraction === 'approval')) return 'approval'
  return 'none'
})

function elapsedFor(item: PetSessionState): string {
  const startedAt = item.startedAt
  if (startedAt === null || startedAt === undefined) return ''
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return ''
  const seconds = Math.max(0, Math.floor((now.value - started) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function pointer(event: PointerEvent): PetPointerPosition {
  return { screenX: event.screenX, screenY: event.screenY }
}

// 展开窗口先于浮层展示（窗口放大的 IPC 与重绘需要几毫秒），
// 避免浮层先被折叠窗口裁切出闪烁。
function onMouseEnter(): void {
  const api = window.kimiPet
  if (api === undefined) return
  if (!windowExpanded.value) {
    windowExpanded.value = true
    api.setHovered(true)
  }
  if (hoverTimer !== null) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => { overlayOpen.value = true }, 60)
}

function onMouseLeave(): void {
  collapse()
}

function collapse(): void {
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  overlayOpen.value = false
  if (windowExpanded.value) {
    windowExpanded.value = false
    window.kimiPet?.setHovered(false)
  }
}

function onEntryClick(item: PetSessionState): void {
  const api = window.kimiPet
  if (api === undefined) return
  api.openSession(item.sessionId)
  collapse()
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || window.kimiPet === undefined) return
  collapse()
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
  // 仅单个会话时点击本体直接打开；多会话由悬停浮层选择。
  else if (items.value.length === 1) window.kimiPet.openSession()
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
    roster.value = {
      connected: true,
      items: [{
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
      }],
      overflow: 0,
      updatedAt: new Date().toISOString()
    }
    return
  }
  const api = window.kimiPet
  if (api === undefined) return
  stopStateListener = api.onStateChanged((next) => { roster.value = next })
  roster.value = await api.getState()
  clock = setInterval(() => { now.value = Date.now() }, 1_000)
})

onBeforeUnmount(() => {
  if (hoverTimer !== null) clearTimeout(hoverTimer)
  stopStateListener?.()
  if (clock !== null) clearInterval(clock)
})
</script>

<template>
  <main
    class="pet-root"
    :class="[`is-${bodyStatus}`, { 'is-dragging': dragging }]"
    :aria-label="rootLabel"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    @contextmenu.prevent
  >
    <div
      class="pet-overlay"
      :class="{ 'is-open': overlayOpen }"
      role="list"
      aria-label="进行中的任务会话"
    >
      <button
        v-for="item in items"
        :key="item.sessionId"
        type="button"
        class="pet-entry"
        @click="onEntryClick(item)"
      >
        <strong class="pet-entry__title">{{ item.title }}</strong>
        <span class="pet-entry__workspace">{{ item.workspaceName }}</span>
        <small class="pet-entry__status">
          {{ statusLabelFor(item) }}<template v-if="elapsedFor(item)"> · {{ elapsedFor(item) }}</template>
        </small>
      </button>
    </div>

    <div
      class="pet-body"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    >
      <LumiSprite
        :status="bodyStatus"
      />
      <div v-if="(roster?.overflow ?? 0) > 0" class="pet-overflow">+{{ roster?.overflow }}</div>
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
  touch-action: none;
}

.pet-root.is-dragging .pet-body { cursor: grabbing; }
.pet-root.is-running { --pet-accent: #2563eb; --pet-soft: rgba(37, 99, 235, 0.18); }
.pet-root:not(.is-running) { --pet-accent: #16a36a; --pet-soft: rgba(22, 163, 106, 0.18); }

.pet-overlay {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  z-index: 5;
  width: 224px;
  max-height: 196px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 10px;
  background: rgba(250, 253, 255, 0.9);
  box-shadow: 0 9px 24px rgba(55, 72, 90, 0.14);
  backdrop-filter: blur(16px) saturate(1.08);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
}

.pet-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.pet-entry {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.pet-entry:hover { background: var(--pet-soft); }
.pet-entry + .pet-entry { border-top: 1px solid rgba(124, 147, 173, 0.18); }
.pet-entry strong, .pet-entry span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pet-entry__title { font-size: var(--type-caption-size); font-weight: 700; }
.pet-entry__workspace { color: #687386; font-size: var(--type-micro-size); }
.pet-entry__status { color: var(--pet-accent); font-size: var(--type-micro-size); font-weight: 650; }

.pet-body {
  position: relative;
  width: 96px;
  height: 104px;
  cursor: grab;
}
.pet-overflow { position: absolute; left: -1px; bottom: 1px; display: grid; min-width: 20px; height: 17px; padding: 0 3px; place-items: center; border: 1px solid rgba(255,255,255,0.92); border-radius: 999px; color: #536273; background: rgba(247,250,252,0.96); font-size: var(--type-micro-size); font-weight: 760; }
</style>
