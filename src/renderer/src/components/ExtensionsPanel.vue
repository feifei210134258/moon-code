<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowUp,
  PhCaretRight,
  PhDownloadSimple,
  PhFile,
  PhFileCss,
  PhFileHtml,
  PhFileJs,
  PhFileTs,
  PhFolderOpen,
  PhMagnifyingGlass,
  PhSidebarSimple,
  PhSpinnerGap,
  PhTextT,
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
  filePreviewPending: boolean
  filePreviewError: string | null
  gitStatus: WorkspaceGitStatus | null
  gitStatusPending: boolean
  gitStatusError: string | null
  fileSearch?: WorkspaceFileSearchResult | null
  fileSearchPending?: boolean
  fileSearchError?: string | null
  fileGrep?: WorkspaceGrepResult | null
  fileGrepPending?: boolean
  fileGrepError?: string | null
  fileActionPending?: string | null
  fileActionError?: string | null
  fileActionNotice?: string | null
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
  collapse: []
  openEntry: [entry: WorkspaceFileEntry]
  openFile: [path: string]
  openDirectory: [path: string]
  searchFiles: [query: string]
  grepFiles: [pattern: string]
  downloadFile: [path: string]
  openExternalFile: [path: string]
  openFileIn: [appId: 'cursor' | 'vscode', path: string]
  revealFile: [path: string]
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
const previewLines = computed(() => (props.filePreview?.content ?? '').split('\n').slice(0, 400))
const previewClipped = computed(() => (props.filePreview?.lineCount ?? previewLines.value.length) > previewLines.value.length)
const activeTodo = computed(() => props.todos.at(-1) ?? null)
const todoItems = computed(() => activeTodo.value?.items ?? [])
const completedTodos = computed(() => todoItems.value.filter((item) => item.status === 'done').length)
const fileSearchQuery = ref('')
const grepPattern = ref('')
const filePreviewActions = ref<HTMLDetailsElement | null>(null)

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || filePreviewActions.value?.open !== true) return
  event.preventDefault()
  filePreviewActions.value.open = false
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))

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

</script>

<template>
  <aside class="extensions-panel glass-panel" :style="{ width: `${width}px` }">
    <header class="extensions-header">
      <span>EXTENSIONS</span>
      <span class="extensions-header-actions">
        <button class="icon-button" type="button" aria-label="刷新文件和更改" @click="emit('refresh')">
          <PhArrowClockwise :size="17" />
        </button>
        <button class="icon-button" type="button" aria-label="收起扩展栏" @click="emit('collapse')">
          <PhSidebarSimple :size="18" />
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
      >Changes</button>
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
        <h2 v-if="gitStatus">
          {{ changedFiles.length }} 个文件已更改
          <span class="git-summary">{{ gitStatus.branch || 'detached' }} · <b class="diff-add">+{{ gitStatus.additions }}</b> <b class="diff-remove">-{{ gitStatus.deletions }}</b></span>
        </h2>
        <div v-else-if="gitStatusPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取 Git 状态…</div>
        <div v-else-if="gitStatusError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ gitStatusError }}</div>
        <div v-else class="extension-state">选择一个 Kimi Session 后读取更改。</div>
        <div v-if="changedFiles.length > 0" class="changed-files-list" aria-label="已更改文件">
          <div v-for="file in changedFiles" :key="file.path" class="changed-file-row">
            <PhFile :size="16" />
            <span>{{ file.path }}</span>
            <strong :class="`git-${file.status}`">{{ statusLabel(file.status) }}</strong>
          </div>
        </div>
        <div v-if="gitStatus && changedFiles.length === 0" class="extension-state">工作区没有未提交更改。</div>
      </section>

      <section class="todo-panel">
        <header>
          <h2>计划</h2>
          <span v-if="activeTodo">{{ completedTodos }}/{{ todoItems.length }}</span>
        </header>
        <ol v-if="todoItems.length > 0" aria-label="Kimi Todo 计划">
          <li v-for="(todo, index) in todoItems" :key="`${activeTodo?.todoId}:${index}:${todo.title}`" :class="`is-${todo.status}`">
            <span class="todo-status-dot" aria-hidden="true" />
            <span>{{ todo.title }}</span>
            <em>{{ todoStatusLabel(todo.status) }}</em>
          </li>
        </ol>
        <p v-else class="plan-empty">Kimi 生成计划后会在这里实时显示。</p>
      </section>

      <section class="plan-panel">
        <header><h2>Background Tasks</h2><span>{{ tasks.length }}</span></header>
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

      <section v-if="filePreviewPending || filePreviewError || filePreview" class="file-preview-panel">
        <header>
          <strong>{{ filePreview?.path ?? '文件预览' }}</strong>
          <details v-if="filePreview" ref="filePreviewActions" class="file-preview-actions">
            <summary aria-label="文件操作">⋯</summary>
            <div>
              <button type="button" :disabled="fileActionPending !== null" @click="emit('downloadFile', filePreview.path)"><PhDownloadSimple :size="14" />下载</button>
              <button type="button" :disabled="fileActionPending !== null" @click="emit('openExternalFile', filePreview.path)">系统打开</button>
              <button type="button" :disabled="fileActionPending !== null" @click="emit('openFileIn', 'cursor', filePreview.path)">Cursor 打开</button>
              <button type="button" :disabled="fileActionPending !== null" @click="emit('openFileIn', 'vscode', filePreview.path)">VS Code 打开</button>
              <button type="button" :disabled="fileActionPending !== null" @click="emit('revealFile', filePreview.path)">在 Finder 中显示</button>
            </div>
          </details>
        </header>
        <div v-if="filePreviewPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取文件…</div>
        <div v-else-if="filePreviewError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ filePreviewError }}</div>
        <div v-else-if="filePreview?.isBinary" class="extension-state">二进制文件不会作为文本载入 Renderer。</div>
        <pre v-else-if="filePreview" class="file-preview-code"><code v-for="(line, index) in previewLines" :key="index"><span>{{ index + 1 }}</span>{{ line }}
</code></pre>
        <div v-if="filePreview?.truncated || previewClipped" class="diff-context">文件较大，当前仅显示前 {{ previewLines.length }} 行</div>
      </section>
      <p v-if="fileActionError" class="file-action-message is-error" role="alert">{{ fileActionError }}</p>
      <p v-else-if="fileActionNotice" class="file-action-message">{{ fileActionNotice }}</p>
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
</template>
