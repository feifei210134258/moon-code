<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowSquareOut,
  PhArrowUp,
  PhCaretRight,
  PhChatCircleText,
  PhCheckCircle,
  PhFile,
  PhFileCss,
  PhFileHtml,
  PhFileJs,
  PhFileTs,
  PhFolderOpen,
  PhMagnifyingGlass,
  PhSpinnerGap,
  PhTextT,
  PhTrash,
  PhWarningCircle,
  PhX
} from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type {
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput,
  BrowserBounds,
  BrowserCaptureResult,
  BrowserViewState,
  BrowserViewport,
  KimiBackgroundTask,
  KimiTodoList,
  WorkspaceFileEntry,
  WorkspaceFileList,
  WorkspaceFilePreview,
  WorkspaceFileSearchResult,
  WorkspaceGrepResult,
  WorkspaceGitStatus
} from '@shared/contracts'
import type { ExtensionTab } from '../types'
import BrowserPanel from './BrowserPanel.vue'

const props = withDefaults(defineProps<{
  width: number
  activeTab: ExtensionTab
  workspaceName: string
  fileList: WorkspaceFileList | null
  fileListPending: boolean
  fileListError: string | null
  filePreview: WorkspaceFilePreview | null
  fileActionPending?: string | null
  fileActionError?: string | null
  fileActionNotice?: string | null
  gitStatus: WorkspaceGitStatus | null
  gitStatusPending: boolean
  gitStatusError: string | null
  fileSearch?: WorkspaceFileSearchResult | null
  fileSearchPending?: boolean
  fileSearchError?: string | null
  fileGrep?: WorkspaceGrepResult | null
  fileGrepPending?: boolean
  fileGrepError?: string | null
  browserState: BrowserViewState
  browserPending: boolean
  browserError: string | null
  browserCapture: BrowserCaptureResult | null
  browserAnnotationBackdrop?: BrowserCaptureResult | null
  browserAnnotationDrafts?: BrowserAnnotationDraft[]
  browserAnnotationPicking?: boolean
  browserAnnotationSubmitting?: boolean
  browserAnnotationError?: string | null
  todos?: KimiTodoList[]
  tasks?: KimiBackgroundTask[]
  tasksPending?: boolean
  tasksError?: string | null
  operationalActionPending?: string | null
}>(), {
  browserAnnotationDrafts: () => [],
  browserAnnotationBackdrop: null,
  browserAnnotationPicking: false,
  browserAnnotationSubmitting: false,
  browserAnnotationError: null,
  fileSearch: null,
  fileSearchPending: false,
  fileSearchError: null,
  fileGrep: null,
  fileGrepPending: false,
  fileGrepError: null,
  fileActionPending: null,
  fileActionError: null,
  fileActionNotice: null,
  todos: () => [],
  tasks: () => [],
  tasksPending: false,
  tasksError: null,
  operationalActionPending: null
})

const emit = defineEmits<{
  selectTab: [tab: ExtensionTab]
  openEntry: [entry: WorkspaceFileEntry]
  openFile: [path: string]
  openDirectory: [path: string]
  openSystem: [path: string]
  trashEntry: [path: string]
  attachToSession: [entry: WorkspaceFileEntry]
  searchFiles: [query: string]
  grepFiles: [pattern: string]
  refresh: []
  browserBounds: [bounds: BrowserBounds]
  browserViewport: [viewport: BrowserViewport]
  browserCapturePage: [fullPage: boolean]
  browserPickAnnotation: [mode: BrowserAnnotationMode]
  browserDeleteAnnotation: [draftId: string]
  browserSubmitAnnotation: [input: BrowserAnnotationSubmitInput]
  browserOverlay: [open: boolean]
  cancelTask: [taskId: string]
}>()

const changedFiles = computed(() => Object.entries(props.gitStatus?.entries ?? {})
  .filter(([, status]) => status !== 'clean' && status !== 'ignored')
  .map(([path, status]) => ({ path, status })))
const parentPath = computed(() => {
  const path = props.fileList?.path ?? '.'
  if (path === '.') return null
  const parts = path.split('/').filter((part) => part.length > 0 && part !== '.')
  parts.pop()
  return parts.length === 0 ? '.' : parts.join('/')
})
const activeTodo = computed(() => props.todos.at(-1) ?? null)
const todoItems = computed(() => activeTodo.value?.items ?? [])
const completedTodos = computed(() => todoItems.value.filter((item) => item.status === 'done').length)
const fileSearchQuery = ref('')
const grepPattern = ref('')
const contextEntry = ref<WorkspaceFileEntry | null>(null)
const contextMenuPosition = ref({ top: '0px', left: '0px' })

function submitFileSearch(): void {
  const query = fileSearchQuery.value.trim()
  if (query.length > 0) emit('searchFiles', query)
}

function submitGrep(): void {
  const pattern = grepPattern.value.trim()
  if (pattern.length > 0) emit('grepFiles', pattern)
}

function todoStatusLabel(status: 'pending' | 'in_progress' | 'done'): string {
  return status === 'done' ? '完成' : status === 'in_progress' ? '进行中' : '待处理'
}

function fileIcon(entry: WorkspaceFileEntry) {
  if (entry.kind === 'directory') return PhFolderOpen
  const extension = entry.name.split('.').pop()?.toLowerCase()
  if (extension === 'html' || extension === 'htm') return PhFileHtml
  if (extension === 'css' || extension === 'scss' || extension === 'less') return PhFileCss
  if (extension === 'ts' || extension === 'tsx') return PhFileTs
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs') return PhFileJs
  return PhFile
}

function isHtmlFile(entry: WorkspaceFileEntry): boolean {
  const extension = entry.name.split('.').pop()?.toLowerCase()
  return entry.kind === 'file' && (extension === 'html' || extension === 'htm')
}

function statusLabel(status: string): string {
  return ({
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: 'U',
    conflicted: '!'
  } as Record<string, string>)[status] ?? ''
}

function openEntryContextMenu(entry: WorkspaceFileEntry, event: MouseEvent): void {
  const menuWidth = 160
  const menuHeight = 114
  const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))
  contextMenuPosition.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
  contextEntry.value = entry
}

function closeEntryContextMenu(): void {
  contextEntry.value = null
}

function attachContextEntryToSession(): void {
  const entry = contextEntry.value
  closeEntryContextMenu()
  if (entry !== null) emit('attachToSession', entry)
}

function openContextEntryInSystem(): void {
  const entry = contextEntry.value
  closeEntryContextMenu()
  if (entry !== null) emit('openSystem', entry.path)
}

function confirmTrashContextEntry(): void {
  const entry = contextEntry.value
  closeEntryContextMenu()
  if (entry === null) return
  const kind = entry.kind === 'directory' ? '文件夹' : '文件'
  if (window.confirm(`将${kind}“${entry.name}”移到废纸篓？`)) emit('trashEntry', entry.path)
}

function closeContextMenuOnOutsideClick(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest('.file-context-menu')) closeEntryContextMenu()
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || contextEntry.value === null) return
  event.preventDefault()
  closeEntryContextMenu()
}

onMounted(() => {
  document.addEventListener('click', closeContextMenuOnOutsideClick)
  window.addEventListener('keydown', onWindowKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenuOnOutsideClick)
  window.removeEventListener('keydown', onWindowKeydown)
})

</script>

<template>
  <aside class="extensions-panel" :style="{ width: `${width}px` }">
    <header class="extensions-header">
      <span>扩展</span>
      <span class="extensions-header-actions">
        <button class="icon-button" type="button" aria-label="刷新文件和更改" @click="emit('refresh')">
          <PhArrowClockwise :size="17" />
        </button>
      </span>
    </header>

    <div class="extension-tabs" role="tablist" aria-label="扩展工作区">
      <button
        :class="{ 'is-active': activeTab === 'changes' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'changes'"
        @click="emit('selectTab', 'changes')"
      >更改</button>
      <button
        :class="{ 'is-active': activeTab === 'files' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'files'"
        @click="emit('selectTab', 'files')"
      >项目文件</button>
      <button
        :class="{ 'is-active': activeTab === 'browser' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'browser'"
        @click="emit('selectTab', 'browser')"
      >浏览器</button>
    </div>

    <div
      v-if="activeTab === 'changes'"
      class="extension-content changes-view"
    >
      <section class="changed-files-panel">
        <h2>
          {{ gitStatus?.available ? `${changedFiles.length} 个文件已更改` : '更改' }}
          <span v-if="gitStatus?.available" class="git-summary">{{ gitStatus.branch || 'detached' }} · <b class="diff-add">+{{ gitStatus.additions }}</b> <b class="diff-remove">-{{ gitStatus.deletions }}</b></span>
        </h2>
        <div v-if="!gitStatus && gitStatusPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取 Git 状态…</div>
        <div v-else-if="!gitStatus && gitStatusError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ gitStatusError }}</div>
        <div v-else-if="!gitStatus" class="extension-state">选择一个 Kimi Session 后读取更改。</div>
        <div v-else-if="!gitStatus.available" class="extension-state">当前工作区未检测到可用的 Git 仓库。</div>
        <div v-if="changedFiles.length > 0" class="changed-files-list" aria-label="已更改文件">
          <div v-for="file in changedFiles" :key="file.path" class="changed-file-row">
            <PhFile :size="16" />
            <span>{{ file.path }}</span>
            <strong :class="`git-${file.status}`">{{ statusLabel(file.status) }}</strong>
          </div>
        </div>
        <div v-if="gitStatus?.available && changedFiles.length === 0" class="extension-state">工作区没有未提交更改。</div>
      </section>

      <section class="todo-panel">
        <header>
          <h2>计划</h2>
          <span v-if="activeTodo">{{ completedTodos }}/{{ todoItems.length }}</span>
        </header>
        <ol v-if="todoItems.length > 0" aria-label="Kimi Todo 计划">
          <li v-for="(todo, index) in todoItems" :key="`${activeTodo?.todoId}:${index}:${todo.title}`" :class="`is-${todo.status}`">
            <PhCheckCircle v-if="todo.status === 'done'" class="todo-check" :size="14" weight="bold" aria-hidden="true" />
            <span v-else class="todo-status-dot" aria-hidden="true" />
            <span>{{ todo.title }}</span>
            <em v-if="todo.status !== 'done'">{{ todoStatusLabel(todo.status) }}</em>
          </li>
        </ol>
        <p v-else class="plan-empty">Kimi 生成计划后会在这里实时显示。</p>
      </section>

      <section class="plan-panel">
        <header><h2>后台任务</h2><span>{{ tasks.length }}</span></header>
        <div v-if="tasksPending && tasks.length === 0" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取 Kimi Tasks…</div>
        <div v-else-if="tasksError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ tasksError }}</div>
        <article v-for="task in tasks" :key="task.id" class="background-task-row" :class="`is-${task.status}`">
          <span class="task-status-dot" />
          <div>
            <header><strong>{{ task.description || task.kind }}</strong><em>{{ task.status }}</em></header>
            <code v-if="task.command">{{ task.command }}</code>
            <p v-if="task.outputPreview">{{ task.outputPreview }}</p>
          </div>
          <button
            v-if="task.status === 'running'"
            type="button"
            aria-label="取消后台任务"
            :disabled="operationalActionPending !== null"
            @click="emit('cancelTask', task.id)"
          ><PhX :size="14" /></button>
        </article>
        <p v-if="!tasksPending && !tasksError && tasks.length === 0" class="plan-empty">当前 Session 没有后台任务。</p>
      </section>
    </div>

    <div v-else-if="activeTab === 'files'" class="extension-content files-view">
      <header class="files-toolbar">
        <strong><PhFolderOpen :size="18" />{{ workspaceName }}</strong>
        <span>{{ fileList?.path ?? '.' }}</span>
      </header>
      <p v-if="fileActionError" class="files-action-message is-error" role="alert">{{ fileActionError }}</p>
      <p v-else-if="fileActionNotice" class="files-action-message">{{ fileActionNotice }}</p>
      <div class="files-search-tools">
        <form @submit.prevent="submitFileSearch">
          <input v-model="fileSearchQuery" type="search" maxlength="512" placeholder="搜索文件名…" aria-label="搜索文件名" />
          <button type="submit" aria-label="提交文件名搜索" title="搜索文件名" :disabled="fileSearchPending"><PhMagnifyingGlass :size="15" /></button>
        </form>
        <form @submit.prevent="submitGrep">
          <input v-model="grepPattern" type="search" maxlength="512" placeholder="搜索文件内容…" aria-label="搜索文件内容" />
          <button type="submit" aria-label="提交文件内容搜索" title="搜索文件内容" :disabled="fileGrepPending"><PhTextT :size="15" /></button>
        </form>
      </div>
      <section v-if="fileSearchPending || fileSearchError || fileSearch" class="file-search-results">
        <header><strong>文件搜索</strong><span v-if="fileSearch">{{ fileSearch.items.length }} 项</span></header>
        <div v-if="fileSearchPending" class="extension-state"><PhSpinnerGap class="spin" :size="16" />正在搜索文件…</div>
        <div v-else-if="fileSearchError" class="extension-state is-error"><PhWarningCircle :size="16" />{{ fileSearchError }}</div>
        <template v-else-if="fileSearch">
          <button
            v-for="item in fileSearch.items"
            :key="item.path"
            type="button"
            @click="item.kind === 'directory' ? emit('openDirectory', item.path) : emit('openFile', item.path)"
          >
            <PhFolderOpen v-if="item.kind === 'directory'" :size="14" />
            <PhFile v-else :size="14" />
            <span>{{ item.path }}</span><small>{{ Math.round(item.score * 100) }}%</small>
          </button>
          <div v-if="fileSearch.items.length === 0" class="extension-state">没有匹配的文件。</div>
          <div v-if="fileSearch.truncated" class="diff-context">结果已按 Kimi Server 限制截断。</div>
        </template>
      </section>
      <section v-if="fileGrepPending || fileGrepError || fileGrep" class="file-search-results grep-results">
        <header><strong>内容搜索</strong><span v-if="fileGrep">{{ fileGrep.filesScanned }} 个文件</span></header>
        <div v-if="fileGrepPending" class="extension-state"><PhSpinnerGap class="spin" :size="16" />正在搜索内容…</div>
        <div v-else-if="fileGrepError" class="extension-state is-error"><PhWarningCircle :size="16" />{{ fileGrepError }}</div>
        <template v-else-if="fileGrep">
          <button v-for="file in fileGrep.files" :key="file.path" type="button" @click="emit('openFile', file.path)">
            <PhFile :size="14" /><span>{{ file.path }}</span><small>{{ file.matches.length }} 处</small>
          </button>
          <div v-for="file in fileGrep.files" :key="`${file.path}:matches`" class="grep-match-list">
            <button v-for="match in file.matches.slice(0, 5)" :key="`${file.path}:${match.line}:${match.column}`" type="button" @click="emit('openFile', file.path)">
              <span>{{ file.path }}:{{ match.line }}</span><code>{{ match.text }}</code>
            </button>
          </div>
          <div v-if="fileGrep.files.length === 0" class="extension-state">没有匹配的内容。</div>
          <div v-if="fileGrep.truncated" class="diff-context">结果已按 Kimi Server 限制截断。</div>
        </template>
      </section>
      <button v-if="parentPath" type="button" class="file-row file-parent-row" @click="emit('openDirectory', parentPath)">
        <PhArrowUp :size="16" /><span>返回上一级</span>
      </button>
      <div v-if="fileListPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取目录…</div>
      <div v-else-if="fileListError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ fileListError }}</div>
      <button
        v-for="entry in fileList?.items ?? []"
        :key="entry.path"
        type="button"
        class="file-row"
        :class="{ 'is-active': filePreview?.path === entry.path }"
        @click="emit('openEntry', entry)"
        @contextmenu.prevent.stop="openEntryContextMenu(entry, $event)"
      >
        <PhCaretRight v-if="entry.kind === 'directory'" :size="13" />
        <span v-else class="file-row-spacer" />
        <component
          :is="fileIcon(entry)"
          :size="17"
          :weight="entry.kind === 'file' ? 'fill' : 'regular'"
          :class="{ 'is-html-file': isHtmlFile(entry) }"
        />
        <span>{{ entry.name }}</span>
        <small v-if="entry.gitStatus && entry.gitStatus !== 'clean'" :class="`git-${entry.gitStatus}`">{{ statusLabel(entry.gitStatus) }}</small>
      </button>
      <div v-if="fileList?.truncated" class="extension-state">目录内容已按 Kimi Server 限制截断。</div>
      <div v-if="fileList && fileList.items.length === 0" class="extension-state">这个目录是空的。</div>

    </div>

    <BrowserPanel
      v-else
      :state="browserState"
      :pending="browserPending"
      :error="browserError"
      :capture="browserCapture"
      :annotation-backdrop="browserAnnotationBackdrop"
      :annotation-drafts="browserAnnotationDrafts"
      :annotation-picking="browserAnnotationPicking"
      :annotation-submitting="browserAnnotationSubmitting"
      :annotation-error="browserAnnotationError"
      @bounds="emit('browserBounds', $event)"
      @viewport="emit('browserViewport', $event)"
      @capture-page="emit('browserCapturePage', $event)"
      @pick-annotation="emit('browserPickAnnotation', $event)"
      @delete-annotation="emit('browserDeleteAnnotation', $event)"
      @submit-annotation="emit('browserSubmitAnnotation', $event)"
      @overlay="emit('browserOverlay', $event)"
    />
  </aside>

  <Teleport to="body">
    <div
      v-if="contextEntry"
      class="tree-menu tree-menu-overlay file-context-menu"
      :style="contextMenuPosition"
      @click.stop
    >
      <button type="button" @click="attachContextEntryToSession">
        <PhChatCircleText :size="14" />添加至会话
      </button>
      <button type="button" :disabled="fileActionPending !== null" @click="openContextEntryInSystem">
        <PhArrowSquareOut :size="14" />系统打开
      </button>
      <button class="is-danger" type="button" :disabled="fileActionPending !== null" @click="confirmTrashContextEntry">
        <PhTrash :size="14" />删除
      </button>
    </div>
  </Teleport>
</template>
