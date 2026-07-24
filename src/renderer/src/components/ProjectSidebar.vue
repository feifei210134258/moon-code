<script setup lang="ts">
import {
  PhArchive,
  PhCaretDown,
  PhCaretRight,
  PhCopy,
  PhDotsThree,
  PhDownloadSimple,
  PhFolderPlus,
  PhFolderSimple,
  PhGearSix,
  PhGitFork,
  PhMagnifyingGlass,
  PhNotePencil,
  PhPencilSimple,
  PhPlus,
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
  addWorkspace: []
  renameWorkspace: [workspaceId: string, name: string]
  deleteWorkspace: [workspaceId: string]
  renameSession: [sessionId: string, title: string]
  archiveSession: [sessionId: string]
  forkSession: [sessionId: string]
  exportSession: [sessionId: string]
  loadMoreSessions: []
  loadSessionChildren: [sessionId: string]
  openSettings: []
}>()

const searchQuery = ref('')
const menuKey = ref<string | null>(null)
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

function createSession(): void {
  const workspaceId = props.activeWorkspaceId || props.projects[0]?.id
  if (workspaceId !== undefined) emit('createSession', workspaceId)
}

function toggleMenu(key: string): void {
  menuKey.value = menuKey.value === key ? null : key
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

function closeMenu(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest('.tree-action-area')) menuKey.value = null
}

onMounted(() => document.addEventListener('click', closeMenu))
onBeforeUnmount(() => document.removeEventListener('click', closeMenu))
</script>

<template>
  <aside class="project-sidebar glass-panel">
    <div class="sidebar-actions">
      <button class="new-task-button" type="button" :disabled="lifecyclePending !== null || projects.length === 0" @click="createSession">
        <PhNotePencil :size="17" />
        <span>新建任务</span>
      </button>
      <button class="sidebar-icon-button" type="button" aria-label="添加项目" :disabled="lifecyclePending !== null" @click="$emit('addWorkspace')">
        <PhFolderPlus :size="17" />
      </button>
    </div>

    <label class="session-search">
      <PhMagnifyingGlass :size="15" />
      <input v-model="searchQuery" type="search" placeholder="搜索任务" aria-label="搜索任务" />
      <button v-if="searchQuery" type="button" aria-label="清除搜索" @click="searchQuery = ''"><PhX :size="13" /></button>
    </label>

    <div class="section-heading">
      <span>项目</span>
      <button type="button" aria-label="添加项目" :disabled="lifecyclePending !== null" @click="$emit('addWorkspace')"><PhPlus :size="14" /></button>
    </div>

    <nav class="project-tree" aria-label="项目和任务">
      <section v-for="project in filteredProjects" :key="project.id" class="project-group">
        <div class="project-row-wrap">
          <button
            class="project-row"
            :class="{ 'is-active': activeWorkspaceId === project.id }"
            type="button"
            @click="$emit('toggleProject', project.id)"
          >
            <component :is="project.expanded || searchQuery ? PhCaretDown : PhCaretRight" :size="13" />
            <PhFolderSimple :size="17" />
            <span>{{ project.name }}</span>
          </button>
          <div class="tree-action-area">
            <button class="tree-more-button" type="button" :aria-label="`${project.name} 项目操作`" @click.stop="toggleMenu(`workspace:${project.id}`)">
              <PhDotsThree :size="17" weight="bold" />
            </button>
            <div v-if="menuKey === `workspace:${project.id}`" class="tree-menu">
              <button type="button" @click="emit('createSession', project.id); menuKey = null"><PhNotePencil :size="14" />新建任务</button>
              <button type="button" @click="beginWorkspaceRename(project)"><PhPencilSimple :size="14" />重命名</button>
              <button class="is-danger" type="button" @click="confirmDeleteWorkspace(project)"><PhTrash :size="14" />移除项目</button>
            </div>
          </div>
        </div>
        <form v-if="editingKey === `workspace:${project.id}`" class="tree-inline-edit project-inline-edit" @submit.prevent="commitEdit">
          <input ref="editInput" v-model="editingValue" maxlength="120" aria-label="项目名称" @keydown.esc="editingKey = null" @blur="commitEdit" />
        </form>
        <div v-if="(project.expanded || searchQuery) && project.sessions.length > 0" class="session-list">
            <div v-for="session in project.sessions" :key="session.id" class="session-row-wrap">
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
                <span class="session-title"><PhGitFork v-if="session.parentSessionId" :size="12" />{{ session.title }}</span>
                <span v-if="session.relativeTime" class="session-time">{{ session.relativeTime }}</span>
              </button>
              <div class="tree-action-area session-action-area">
                <button class="tree-more-button" type="button" :aria-label="`${session.title} 任务操作`" @click.stop="toggleMenu(`session:${session.id}`)">
                  <PhDotsThree :size="16" weight="bold" />
                </button>
                <div v-if="menuKey === `session:${session.id}`" class="tree-menu session-menu">
                  <button type="button" @click="beginSessionRename(session)"><PhPencilSimple :size="14" />重命名</button>
                  <button type="button" :disabled="childrenPendingSessionId != null" @click="emit('loadSessionChildren', session.id); menuKey = null"><PhGitFork :size="14" />查看子任务</button>
                  <button type="button" @click="emit('forkSession', session.id); menuKey = null"><PhCopy :size="14" />创建分叉</button>
                  <button type="button" @click="emit('exportSession', session.id); menuKey = null"><PhDownloadSimple :size="14" />导出 ZIP</button>
                  <button class="is-danger" type="button" @click="confirmArchiveSession(session)"><PhArchive :size="14" />归档</button>
                </div>
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
</template>
