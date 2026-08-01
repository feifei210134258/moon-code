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
const dragging = ref(false)
let startPointer: PetPointerPosition | null = null
let lastPointer: PetPointerPosition | null = null
let stopStateListener: (() => void) | null = null

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

// 最需要关注的会话：与宠物本体聚合状态取同一个优先级。
const primaryItem = computed(() => {
  let best: PetSessionState | null = null
  for (const item of items.value) {
    if (best === null || STATUS_PRIORITY[item.status] > STATUS_PRIORITY[best.status]) best = item
  }
  return best
})

// 宠物本体展示聚合状态：任一待交互优先于运行中，其余按固定优先级。
const bodyStatus = computed<PetVisualState>(() => {
  if (roster.value === null) return 'disconnected'
  return primaryItem.value?.status ?? 'idle'
})

const waitingInteraction = computed<'question' | 'approval' | 'none'>(() => {
  const waiting = items.value.filter((item) => item.status === 'waiting')
  if (waiting.some((item) => item.pendingInteraction === 'question')) return 'question'
  if (waiting.some((item) => item.pendingInteraction === 'approval')) return 'approval'
  return 'none'
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
  // 点击本体打开最需要关注的会话（与本体聚合状态一致）。
  else if (primaryItem.value !== null) window.kimiPet.openSession(primaryItem.value.sessionId)
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
})

onBeforeUnmount(() => {
  stopStateListener?.()
})
</script>

<template>
  <main
    class="pet-root"
    :class="[`is-${bodyStatus}`, { 'is-dragging': dragging }]"
    :aria-label="rootLabel"
    @contextmenu.prevent
  >
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
      <!-- 移入宠物时通过 :hover 显示的会话数量徽标 -->
      <div v-if="items.length > 0" class="pet-badge" aria-hidden="true">{{ items.length }}</div>
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

.pet-body {
  position: relative;
  width: 96px;
  height: 104px;
  cursor: grab;
}

.pet-badge {
  position: absolute;
  top: -3px;
  right: -5px;
  display: grid;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  color: #ffffff;
  background: var(--pet-accent);
  font-size: var(--type-micro-size);
  font-weight: 760;
  box-shadow: 0 2px 8px rgba(55, 72, 90, 0.22);
  opacity: 0;
  transform: translateY(3px);
  transition: opacity 140ms ease, transform 140ms ease;
  pointer-events: none;
}

.pet-root:hover .pet-badge {
  opacity: 1;
  transform: translateY(0);
}

.pet-overflow { position: absolute; left: -1px; bottom: 1px; display: grid; min-width: 20px; height: 17px; padding: 0 3px; place-items: center; border: 1px solid rgba(255,255,255,0.92); border-radius: 999px; color: #536273; background: rgba(247,250,252,0.96); font-size: var(--type-micro-size); font-weight: 760; }
</style>
