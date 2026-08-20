<script setup lang="ts">
import {
  PhArchive,
  PhArrowClockwise,
  PhArrowCounterClockwise,
  PhSlidersHorizontal,
  PhX
} from '@phosphor-icons/vue'
import { computed, onMounted, ref, watch } from 'vue'
import type { KimiSessionManagerItem, KimiSessionManagerListInput } from '@shared/contracts'
import { useRuntimeBridge } from '../composables/useRuntimeBridge'
import { useWorkbenchStore } from '../stores/workbench'

const emit = defineEmits<{
  close: []
}>()

/* 会话管理面板 · 跨 workspace 会话列表。
   数据来自 Kimi `GET /api/v2/sessions`（main 侧投影），批量归档/恢复走 v2 批量接口。
   协议没有独立「标记为 done」概念（status 只有 running/approval/question/failed/idle），
   归档/archive 即终点操作，因此本面板只做「归档」与「恢复」两种操作。

   面板持有独立的 runtimeBridge 实例仅用于列表/批量操作；批量操作成功后把 main 侧
   刷新出的 workspace 树回灌进共享 workbench store，让侧边栏立即反映归档结果。 */
const bridge = useRuntimeBridge()
const store = useWorkbenchStore()

const items = ref<KimiSessionManagerItem[]>([])
const total = ref(0)
const pending = computed(() => bridge.sessionManagerPending.value)
const error = computed(() => bridge.sessionManagerError.value)
const selected = ref<Set<string>>(new Set())

interface SessionManagerFilters {
  workspaceId: string
  status: '' | 'running' | 'approval' | 'question' | 'failed' | 'idle'
  archived: 'true' | 'false' | 'all'
  /** 毫秒；0 表示不按时间过滤。 */
  updatedAfter: number
  sort: 'meta.updated_at_desc' | 'meta.updated_at_asc' | 'meta.created_at_desc'
}

const filters = ref<SessionManagerFilters>({
  workspaceId: '',
  status: '',
  archived: 'false',
  updatedAfter: 0,
  sort: 'meta.updated_at_desc'
})

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'running', label: '进行中' },
  { value: 'approval', label: '等待操作' },
  { value: 'question', label: '等待回答' },
  { value: 'failed', label: '失败' },
  { value: 'idle', label: '空闲' }
]

const timeOptions: { value: number; label: string }[] = [
  { value: 0, label: '全部时间' },
  { value: 24 * 60 * 60 * 1_000, label: '最近 24 小时' },
  { value: 7 * 24 * 60 * 60 * 1_000, label: '最近 7 天' },
  { value: 30 * 24 * 60 * 60 * 1_000, label: '最近 30 天' }
]

const workspaceOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const workspace of bridge.workspaceTree.value ?? []) seen.set(workspace.id, workspace.name)
  for (const item of items.value) {
    if (!seen.has(item.workspaceId)) seen.set(item.workspaceId, item.workspaceName)
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }))
})

const selectedItems = computed(() => {
  const byId = new Map(items.value.map((item) => [item.id, item]))
  return [...selected.value].map((id) => byId.get(id)).filter(
    (item): item is KimiSessionManagerItem => item !== undefined
  )
})
const canArchive = computed(() => selectedItems.value.some((item) => !item.archived))
const canRestore = computed(() => selectedItems.value.some((item) => item.archived))

let loadGeneration = 0

async function load(): Promise<void> {
  const generation = ++loadGeneration
  const filter = filters.value
  /* 选择器在选项缺失时可能把模型置为 undefined；归一化后按空处理。 */
  const workspaceId = filter.workspaceId ?? ''
  const status = filter.status ?? ''
  const archived = filter.archived ?? 'all'
  const updatedAfter = filter.updatedAfter ?? 0
  const sort = filter.sort ?? 'meta.updated_at_desc'
  const input: KimiSessionManagerListInput = {
    ...(workspaceId.length > 0 ? { workspaceId } : {}),
    ...(status !== '' ? { status } : {}),
    archived,
    ...(updatedAfter > 0 ? { updatedAfter: Date.now() - updatedAfter } : {}),
    sort
  }
  const page = await bridge.listSessionManagerPage(input)
  if (generation !== loadGeneration) return
  if (page === null) {
    items.value = []
    total.value = 0
    return
  }
  items.value = page.items
  total.value = page.total
  /* 过滤条件变化后面临的分页结果与勾选状态已不一致，清空勾选避免误操作。 */
  selected.value = new Set()
}

watch(filters, () => void load(), { deep: true })
/* useRuntimeBridge 是异步 bootstrap：等 runtime 真正 running 后再拉取列表，
   否则首次进入面板时列表会因「runtime 未就绪」守卫被跳过。 */
watch(() => bridge.runtime.value.status, (status) => {
  if (status === 'running') void load()
})
onMounted(() => {
  if (bridge.runtime.value.status === 'running') void load()
})

function toggle(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function archiveSelected(): Promise<void> {
  const ids = selectedItems.value.filter((item) => !item.archived).map((item) => item.id)
  if (ids.length === 0) return
  await runBatch(() => bridge.archiveSessionManager(ids))
}

async function restoreSelected(): Promise<void> {
  const ids = selectedItems.value.filter((item) => item.archived).map((item) => item.id)
  if (ids.length === 0) return
  await runBatch(() => bridge.restoreSessionManager(ids))
}

async function runBatch(action: () => Promise<{ results: { id: string; ok: boolean }[] } | null>): Promise<void> {
  const generation = loadGeneration
  const result = await action()
  if (generation !== loadGeneration) return
  if (result !== null) {
    /* 批量成功后把 main 侧刷新出的新树回灌共享 store，侧边栏立即生效。 */
    await bridge.refreshWorkspaceTree()
    if (bridge.workspaceTree.value !== null) {
      store.hydrateProjects(bridge.workspaceTree.value)
    }
    selected.value = new Set()
    await load()
  }
}

function statusLabel(status: KimiSessionManagerItem['status']): string {
  return ({
    running: '进行中',
    approval: '等待操作',
    question: '等待回答',
    failed: '失败',
    idle: '空闲'
  } as const)[status]
}

function formatRelativeTime(value: number | null): string {
  if (value === null) return '时间未知'
  const seconds = Math.max(0, Math.round((Date.now() - value) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
</script>

<template>
  <div class="session-manager-overlay" @click.self="emit('close')">
    <section
      class="session-manager-card"
      role="dialog"
      aria-modal="true"
      aria-label="会话管理"
    >
      <header class="session-manager-header">
        <div class="session-manager-title">
          <PhSlidersHorizontal :size="17" />
          <h2>会话管理</h2>
        </div>
        <button class="session-manager-close" type="button" aria-label="关闭" @click="emit('close')">
          <PhX :size="17" />
        </button>
      </header>

      <div class="session-manager-filters">
        <label class="session-manager-filter">
          <span>工作区</span>
          <select v-model="filters.workspaceId">
            <option value="">全部工作区</option>
            <option v-for="workspace in workspaceOptions" :key="workspace.id" :value="workspace.id">
              {{ workspace.name }}
            </option>
          </select>
        </label>
        <label class="session-manager-filter">
          <span>状态</span>
          <select v-model="filters.status">
            <option v-for="option in statusOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="session-manager-filter">
          <span>更新时间</span>
          <select v-model="filters.updatedAfter">
            <option v-for="option in timeOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <label class="session-manager-filter">
          <span>归档状态</span>
          <select v-model="filters.archived">
            <option value="false">仅未归档</option>
            <option value="true">仅已归档</option>
            <option value="all">全部</option>
          </select>
        </label>
        <button class="session-manager-refresh" type="button" title="刷新" :disabled="pending" @click="load">
          <PhArrowClockwise :class="{ spin: pending }" :size="15" />
        </button>
      </div>

      <div class="session-manager-summary">
        <span>会话总数 <b>{{ total }}</b></span>
        <span v-if="selected.size > 0">已选 <b>{{ selected.size }}</b></span>
        <span v-else-if="items.length === 0" class="session-manager-hint">无匹配的会话</span>
      </div>

      <div class="session-manager-list">
        <label
          v-for="item in items"
          :key="item.id"
          class="session-manager-row"
        >
          <input
            type="checkbox"
            :checked="selected.has(item.id)"
            :aria-label="item.title"
            @change="toggle(item.id)"
          />
          <span class="session-manager-status" :class="`is-${item.status}`" :title="statusLabel(item.status)">
            <i aria-hidden="true" />
          </span>
          <span class="session-manager-title" :title="item.lastPrompt ?? ''">{{ item.title }}</span>
          <span class="session-manager-workspace">{{ item.workspaceName }}</span>
          <span class="session-manager-time">{{ formatRelativeTime(item.updatedAt) }}</span>
          <span v-if="item.archived" class="session-manager-archived">已归档</span>
        </label>
        <div v-if="items.length === 0 && !pending" class="session-manager-empty">无匹配的会话</div>
        <div v-if="pending" class="session-manager-pending">正在加载…</div>
      </div>

      <footer class="session-manager-footer">
        <div v-if="error" class="session-manager-error" role="alert">{{ error }}</div>
        <div class="session-manager-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="!canRestore || pending"
            @click="restoreSelected"
          >
            <PhArrowCounterClockwise :size="14" />恢复
          </button>
          <button
            class="primary-button is-danger-action"
            type="button"
            :disabled="!canArchive || pending"
            @click="archiveSelected"
          >
            <PhArchive :size="14" />归档
          </button>
        </div>
      </footer>
    </section>
  </div>
</template>
