<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  PetExpandedGeometry,
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
// 展开窗口后折叠态窗口的相对矩形：宠物本体按它钉在原地，浮层锚在本体上方。
const petRect = ref<PetExpandedGeometry | null>(null)
const expandedSize = ref<{ width: number; height: number } | null>(null)
let startPointer: PetPointerPosition | null = null
let lastPointer: PetPointerPosition | null = null
let hoverTimer: ReturnType<typeof setTimeout> | null = null
let hoverGeneration = 0
let hoverPending = false
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

// 展开窗口由主进程完成并把折叠态矩形带回来（IPC 返回时窗口已放大），
// 浮层晚一拍再淡入，避免被旧窗口尺寸的渲染帧裁切。
async function onMouseEnter(): Promise<void> {
  const api = window.kimiPet
  if (api === undefined || petRect.value !== null || hoverPending) return
  hoverPending = true
  const generation = ++hoverGeneration
  try {
    const geometry = await api.setHovered(true)
    // 等 IPC 期间鼠标可能已移出：丢弃过期几何，避免本体在折叠窗口里错位。
    if (generation !== hoverGeneration || geometry === null) return
    petRect.value = geometry
    expandedSize.value = { width: window.innerWidth, height: window.innerHeight }
    if (hoverTimer !== null) clearTimeout(hoverTimer)
    hoverTimer = setTimeout(() => {
      if (generation === hoverGeneration) overlayOpen.value = true
    }, 50)
  } finally {
    hoverPending = false
  }
}

function onMouseLeave(): void {
  collapse()
}

function collapse(): void {
  hoverGeneration += 1
  if (hoverTimer !== null) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
  overlayOpen.value = false
  if (petRect.value !== null) {
    petRect.value = null
    expandedSize.value = null
    void window.kimiPet?.setHovered(false)
  }
}

const anchorStyle = computed(() => {
  const rect = petRect.value
  if (rect === null) return undefined
  return {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  }
})

// 浮层底边贴着折叠态窗口顶边，水平以宠物本体为中心并夹取在窗口内。
const overlayStyle = computed(() => {
  const rect = petRect.value
  const size = expandedSize.value
  if (rect === null || size === null) return undefined
  const overlayWidth = 224
  const center = rect.x + rect.width / 2
  const left = Math.min(
    Math.max(center - overlayWidth / 2, 8),
    Math.max(8, size.width - overlayWidth - 8)
  )
  return {
    left: `${Math.round(left)}px`,
    bottom: `${Math.round(size.height - rect.y + 6)}px`
  }
})

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
      v-if="petRect !== null"
      class="pet-overlay"
      :class="{ 'is-open': overlayOpen }"
      :style="overlayStyle"
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

    <div class="pet-anchor" :class="{ 'is-anchored': petRect !== null }" :style="anchorStyle">
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
  position: relative;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.pet-root.is-dragging .pet-body { cursor: grabbing; }
.pet-root.is-running { --pet-accent: #2563eb; --pet-soft: rgba(37, 99, 235, 0.18); }
.pet-root:not(.is-running) { --pet-accent: #16a36a; --pet-soft: rgba(22, 163, 106, 0.18); }

.pet-anchor {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 5px 5px 7px;
}

/* 展开后锚在折叠态窗口原矩形内：宠物本体在屏幕上保持纹丝不动。 */
.pet-anchor.is-anchored {
  position: absolute;
}

.pet-overlay {
  position: absolute;
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
  transform: translateY(4px);
  transition: opacity 140ms ease, transform 140ms ease;
}

.pet-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
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
