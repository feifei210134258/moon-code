<script setup lang="ts">
import {
  PhArchive,
  PhChatCircleText,
  PhCopy,
  PhDotsThree,
  PhDownloadSimple,
  PhFolderSimple,
  PhGearSix,
  PhGitFork,
  PhMagnifyingGlass,
  PhNotePencil,
  PhPencilSimple,
  PhPlus,
  PhSpinnerGap,
  PhTrash,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ProjectItem, SessionItem } from '../types'

const props = defineProps<{
  projects: ProjectItem[]
  activeWorkspaceId: string
  activeSessionId: string
  lifecyclePending: string | null
  lifecycleError: string | null
  sessionPageHasMore?: boolean
  sessionPagePending?: boolean
  sessionPageError?: string | null
  childrenPendingSessionId?: string | null
  childrenError?: string | null
}>()

const emit = defineEmits<{
  toggleProject: [projectId: string]
  selectSession: [sessionId: string]
  createSession: [workspaceId: string]
  renameWorkspace: [workspaceId: string, name: string]
  deleteWorkspace: [workspaceId: string]
  renameSession: [sessionId: string, title: string]
  archiveSession: [sessionId: string]
  forkSession: [sessionId: string]
  exportSession: [sessionId: string]
  loadMoreSessions: []
  loadSessionChildren: [sessionId: string]
  startSideChat: []
  openSettings: []
}>()

const searchQuery = ref('')
const menuKey = ref<string | null>(null)
/* Inline style needs explicit units — bare numbers are dropped as invalid CSS. */
const menuPosition = ref({ top: '0px', left: '0px' })
const editingKey = ref<string | null>(null)
const editingValue = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const filteredProjects = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  if (query.length === 0) return props.projects
  return props.projects
    .map((project) => {
      if (project.name.toLocaleLowerCase().includes(query)) return project
      return {
        ...project,
        sessions: project.sessions.filter((session) =>
          session.title.toLocaleLowerCase().includes(query)
        )
      }
    })
    .filter((project) => project.sessions.length > 0 || project.name.toLocaleLowerCase().includes(query))
})
const menuProject = computed(() => {
  const key = menuKey.value
  if (key === null || !key.startsWith('workspace:')) return null
  return props.projects.find((project) => project.id === key.slice('workspace:'.length)) ?? null
})
const menuSession = computed(() => {
  const key = menuKey.value
  if (key === null || !key.startsWith('session:')) return null
  const id = key.slice('session:'.length)
  return props.projects.flatMap((project) => project.sessions).find((session) => session.id === id) ?? null
})

function createSession(): void {
  const workspaceId = props.activeWorkspaceId || props.projects[0]?.id
  if (workspaceId !== undefined) emit('createSession', workspaceId)
}

function closeMenu(): void {
  menuKey.value = null
}

function sessionStatusLabel(session: SessionItem): string {
  return ({
    running: '进行中',
    completed: '已结束',
    attention: '等待操作',
    unread: '有新消息',
    neutral: '尚未开始'
  } as const)[session.tone ?? 'neutral']
}

function toggleMenu(key: string, event: MouseEvent): void {
  if (menuKey.value === key) {
    closeMenu()
    return
  }
  const trigger = event.currentTarget
  if (!(trigger instanceof HTMLElement)) return
  const rect = trigger.getBoundingClientRect()
  const menuWidth = 146
  const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 224))
  const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
  menuPosition.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
  menuKey.value = key
}

function beginWorkspaceRename(project: ProjectItem): void {
  menuKey.value = null
  editingKey.value = `workspace:${project.id}`
  editingValue.value = project.name
  void nextTick(() => editInput.value?.select())
}

function beginSessionRename(session: SessionItem): void {
  menuKey.value = null
  editingKey.value = `session:${session.id}`
  editingValue.value = session.title
  void nextTick(() => editInput.value?.select())
}

function commitEdit(): void {
  const key = editingKey.value
  const value = editingValue.value.trim()
  if (key === null) return
  editingKey.value = null
  if (value.length === 0) return
  if (key.startsWith('workspace:')) emit('renameWorkspace', key.slice('workspace:'.length), value)
  else emit('renameSession', key.slice('session:'.length), value)
}

function confirmDeleteWorkspace(project: ProjectItem): void {
  menuKey.value = null
  if (window.confirm(`从 Kimi 项目列表移除“${project.name}”？不会删除磁盘中的项目文件。`)) {
    emit('deleteWorkspace', project.id)
  }
}

function confirmArchiveSession(session: SessionItem): void {
  menuKey.value = null
  if (window.confirm(`归档任务“${session.title}”？之后可在设置中恢复。`)) {
    emit('archiveSession', session.id)
  }
}

function closeMenuOnOutsideClick(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest('.tree-action-area, .tree-menu-overlay')) closeMenu()
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || (menuKey.value === null && editingKey.value === null)) return
  event.preventDefault()
  closeMenu()
  editingKey.value = null
}

onMounted(() => {
  document.addEventListener('click', closeMenuOnOutsideClick)
  window.addEventListener('keydown', onWindowKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick)
  window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
  <aside class="project-sidebar">
    <div class="sidebar-actions">
      <button class="new-task-button" type="button" :disabled="lifecyclePending !== null || projects.length === 0" @click="createSession">
        <PhNotePencil :size="17" />
        <span>新建任务</span>
      </button>
    </div>

    <label class="session-search">
      <PhMagnifyingGlass :size="15" />
      <input v-model="searchQuery" type="search" placeholder="搜索任务" aria-label="搜索任务" />
      <button v-if="searchQuery" type="button" aria-label="清除搜索" @click="searchQuery = ''"><PhX :size="13" /></button>
    </label>

    <nav class="project-tree" aria-label="项目和任务">
      <section v-for="project in filteredProjects" :key="project.id" class="project-group">
        <div class="project-row-wrap" :class="{ 'is-active': activeWorkspaceId === project.id && activeSessionId.length === 0, 'is-menu-open': menuKey === `workspace:${project.id}` }">
          <button
            class="project-row"
            type="button"
            @click="$emit('toggleProject', project.id)"
          >
            <PhFolderSimple :size="17" />
            <span>{{ project.name }}</span>
          </button>
          <div class="tree-action-area project-action-area">
            <button class="tree-more-button" type="button" :aria-label="`${project.name} 项目操作`" @click.stop="toggleMenu(`workspace:${project.id}`, $event)">
              <PhDotsThree :size="17" weight="bold" />
            </button>
            <button class="tree-more-button" type="button" :aria-label="`${project.name} 新建任务`" title="新建任务" @click.stop="emit('createSession', project.id)">
              <PhPlus :size="16" weight="bold" />
            </button>
          </div>
        </div>
        <form v-if="editingKey === `workspace:${project.id}`" class="tree-inline-edit project-inline-edit" @submit.prevent="commitEdit">
          <input ref="editInput" v-model="editingValue" maxlength="120" aria-label="项目名称" @keydown.esc="editingKey = null" @blur="commitEdit" />
        </form>
        <div v-if="(project.expanded || searchQuery) && project.sessions.length > 0" class="session-list">
            <div v-for="session in project.sessions" :key="session.id" class="session-row-wrap" :class="{ 'is-menu-open': menuKey === `session:${session.id}` }">
            <form v-if="editingKey === `session:${session.id}`" class="tree-inline-edit" @submit.prevent="commitEdit">
              <input ref="editInput" v-model="editingValue" maxlength="200" aria-label="任务名称" @keydown.esc="editingKey = null" @blur="commitEdit" />
            </form>
            <template v-else>
              <button
                class="session-row"
                :class="{ 'is-active': activeSessionId === session.id, 'is-child': session.parentSessionId !== undefined }"
                type="button"
                @click="$emit('selectSession', session.id)"
              >
                <span class="session-title">
                  <span
                    v-if="session.tone !== undefined && session.tone !== 'neutral'"
                    class="session-status"
                    :class="`is-${session.tone ?? 'neutral'}`"
                    :title="sessionStatusLabel(session)"
                    :aria-label="sessionStatusLabel(session)"
                  >
                    <PhSpinnerGap v-if="session.tone === 'running'" class="spin" :size="13" />
                    <i v-else aria-hidden="true" />
                  </span>
                  <PhGitFork v-if="session.parentSessionId" :size="12" />
                  <span class="session-title-text">{{ session.title }}</span>
                </span>
                <span v-if="session.relativeTime" class="session-time">{{ session.relativeTime }}</span>
              </button>
              <div class="tree-action-area session-action-area">
                <button class="tree-more-button" type="button" :aria-label="`${session.title} 任务操作`" @click.stop="toggleMenu(`session:${session.id}`, $event)">
                  <PhDotsThree :size="16" weight="bold" />
                </button>
              </div>
            </template>
          </div>
        </div>
      </section>
      <div v-if="filteredProjects.length === 0" class="sidebar-empty">没有匹配的任务</div>
      <button
        v-if="sessionPageHasMore"
        class="session-load-more"
        type="button"
        :disabled="sessionPagePending"
        @click="emit('loadMoreSessions')"
      >{{ sessionPagePending ? '正在加载…' : '加载更早的任务' }}</button>
    </nav>

    <div v-if="sessionPageError || childrenError" class="sidebar-error" role="alert">{{ sessionPageError || childrenError }}</div>
    <div v-if="lifecycleError" class="sidebar-error" role="alert">{{ lifecycleError }}</div>
    <button class="sidebar-settings" type="button" @click="$emit('openSettings')">
      <PhGearSix :size="18" />
      <span>设置</span>
    </button>
  </aside>

  <Teleport to="body">
    <div v-if="menuProject" class="tree-menu tree-menu-overlay" :style="menuPosition" @click.stop>
      <button type="button" @click="emit('createSession', menuProject.id); closeMenu()"><PhNotePencil :size="14" />新建任务</button>
      <button type="button" @click="beginWorkspaceRename(menuProject)"><PhPencilSimple :size="14" />重命名</button>
      <button class="is-danger" type="button" @click="confirmDeleteWorkspace(menuProject)"><PhTrash :size="14" />移除项目</button>
    </div>
    <div v-else-if="menuSession" class="tree-menu tree-menu-overlay session-menu" :style="menuPosition" @click.stop>
      <button type="button" @click="beginSessionRename(menuSession)"><PhPencilSimple :size="14" />重命名</button>
      <button type="button" :disabled="childrenPendingSessionId != null" @click="emit('loadSessionChildren', menuSession.id); closeMenu()"><PhGitFork :size="14" />查看子任务</button>
      <button v-if="menuSession.id === activeSessionId" type="button" @click="emit('startSideChat'); closeMenu()"><PhChatCircleText :size="14" />BTW 侧边会话</button>
      <button type="button" @click="emit('forkSession', menuSession.id); closeMenu()"><PhCopy :size="14" />创建分叉</button>
      <button type="button" @click="emit('exportSession', menuSession.id); closeMenu()"><PhDownloadSimple :size="14" />导出 ZIP</button>
      <button class="is-danger" type="button" @click="confirmArchiveSession(menuSession)"><PhArchive :size="14" />归档</button>
    </div>
  </Teleport>
</template>
