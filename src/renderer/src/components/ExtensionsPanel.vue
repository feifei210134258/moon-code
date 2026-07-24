<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowUp,
  PhCaretRight,
  PhCopy,
  PhFile,
  PhFileCss,
  PhFileHtml,
  PhFileJs,
  PhFileTs,
  PhFolderOpen,
  PhSidebarSimple,
  PhSpinnerGap,
  PhWarningCircle,
  PhX
} from '@phosphor-icons/vue'
import { computed } from 'vue'
import type {
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput,
  BrowserBounds,
  BrowserCaptureResult,
  BrowserNetworkDetails,
  BrowserViewState,
  BrowserViewport,
  KimiBackgroundTask,
  WorkspaceFileDiff,
  WorkspaceFileEntry,
  WorkspaceFileList,
  WorkspaceFilePreview,
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
  fileDiff: WorkspaceFileDiff | null
  fileDiffPending: boolean
  fileDiffError: string | null
  browserState: BrowserViewState
  browserPending: boolean
  browserError: string | null
  browserNetworkDetails: BrowserNetworkDetails | null
  browserNetworkDetailsPending: boolean
  browserCapture: BrowserCaptureResult | null
  browserLocalServers: string[]
  browserLocalServersPending: boolean
  browserAnnotationDrafts?: BrowserAnnotationDraft[]
  browserAnnotationPicking?: boolean
  browserAnnotationSubmitting?: boolean
  browserAnnotationError?: string | null
  tasks?: KimiBackgroundTask[]
  tasksPending?: boolean
  tasksError?: string | null
  operationalActionPending?: string | null
}>(), {
  browserAnnotationDrafts: () => [],
  browserAnnotationPicking: false,
  browserAnnotationSubmitting: false,
  browserAnnotationError: null,
  tasks: () => [],
  tasksPending: false,
  tasksError: null,
  operationalActionPending: null
})

const emit = defineEmits<{
  selectTab: [tab: ExtensionTab]
  collapse: []
  openEntry: [entry: WorkspaceFileEntry]
  openDirectory: [path: string]
  selectDiff: [path: string]
  refresh: []
  browserBounds: [bounds: BrowserBounds]
  browserNavigate: [url: string]
  browserBack: []
  browserForward: []
  browserReload: []
  browserStop: []
  browserViewport: [viewport: BrowserViewport]
  browserClearConsole: []
  browserClearNetwork: []
  browserNetworkDetails: [requestId: string]
  browserCapturePage: [fullPage: boolean]
  browserPickAnnotation: [mode: BrowserAnnotationMode]
  browserDeleteAnnotation: [draftId: string]
  browserSubmitAnnotation: [input: BrowserAnnotationSubmitInput]
  browserOpenExternal: []
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
const diffLines = computed(() => parseDiff(props.fileDiff?.diff ?? '').slice(0, 600))
const diffClipped = computed(() => (props.fileDiff?.diff.split('\n').length ?? 0) > diffLines.value.length)

function fileIcon(entry: WorkspaceFileEntry) {
  if (entry.kind === 'directory') return PhFolderOpen
  const extension = entry.name.split('.').pop()?.toLowerCase()
  if (extension === 'html' || extension === 'htm') return PhFileHtml
  if (extension === 'css' || extension === 'scss' || extension === 'less') return PhFileCss
  if (extension === 'ts' || extension === 'tsx') return PhFileTs
  if (extension === 'js' || extension === 'jsx' || extension === 'mjs') return PhFileJs
  return PhFile
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

async function copyDiff(): Promise<void> {
  if (props.fileDiff === null || navigator.clipboard === undefined) return
  await navigator.clipboard.writeText(props.fileDiff.diff)
}

interface RenderedDiffLine {
  key: string
  text: string
  kind: 'context' | 'added' | 'removed' | 'meta'
  oldLine: number | null
  newLine: number | null
}

function parseDiff(diff: string): RenderedDiffLine[] {
  let oldLine = 0
  let newLine = 0
  return diff.split('\n').map((text, index) => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk !== null) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      return { key: `${index}:meta`, text, kind: 'meta', oldLine: null, newLine: null }
    }
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('diff ') || text.startsWith('index ')) {
      return { key: `${index}:meta`, text, kind: 'meta', oldLine: null, newLine: null }
    }
    if (text.startsWith('+')) {
      const line = { key: `${index}:add`, text, kind: 'added' as const, oldLine: null, newLine }
      newLine += 1
      return line
    }
    if (text.startsWith('-')) {
      const line = { key: `${index}:remove`, text, kind: 'removed' as const, oldLine, newLine: null }
      oldLine += 1
      return line
    }
    const line = { key: `${index}:context`, text, kind: 'context' as const, oldLine, newLine }
    oldLine += 1
    newLine += 1
    return line
  })
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

    <div v-if="activeTab === 'changes'" class="extension-content changes-view">
      <section class="changed-files-panel">
        <h2 v-if="gitStatus">
          {{ changedFiles.length }} 个文件已更改
          <span class="git-summary">{{ gitStatus.branch || 'detached' }} · <b class="diff-add">+{{ gitStatus.additions }}</b> <b class="diff-remove">-{{ gitStatus.deletions }}</b></span>
        </h2>
        <div v-else-if="gitStatusPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取 Git 状态…</div>
        <div v-else-if="gitStatusError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ gitStatusError }}</div>
        <div v-else class="extension-state">选择一个 Kimi Session 后读取更改。</div>
        <button
          v-for="file in changedFiles"
          :key="file.path"
          type="button"
          class="changed-file-row"
          :class="{ 'is-active': fileDiff?.path === file.path }"
          @click="emit('selectDiff', file.path)"
        >
          <PhFile :size="16" />
          <span>{{ file.path }}</span>
          <strong :class="`git-${file.status}`">{{ statusLabel(file.status) }}</strong>
        </button>
        <div v-if="gitStatus && changedFiles.length === 0" class="extension-state">工作区没有未提交更改。</div>
      </section>

      <section class="diff-panel">
        <header>
          <strong>{{ fileDiff?.path ?? '选择文件查看 Diff' }}</strong>
          <button v-if="fileDiff" type="button" aria-label="复制 Diff" @click="copyDiff"><PhCopy :size="16" /></button>
        </header>
        <div v-if="fileDiffPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取 Diff…</div>
        <div v-else-if="fileDiffError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ fileDiffError }}</div>
        <div v-else-if="fileDiff && diffLines.length > 0" class="diff-code" aria-label="代码差异">
          <div v-for="line in diffLines" :key="line.key" :class="line.kind">
            <span>{{ line.oldLine ?? '' }}</span>
            <span>{{ line.newLine ?? '' }}</span>
            <code>{{ line.text }}</code>
          </div>
        </div>
        <div v-else class="extension-state">{{ fileDiff ? '这个文件没有可显示的文本 Diff。' : '从上方 Changed Files 选择一个文件。' }}</div>
        <div v-if="fileDiff?.truncated || diffClipped" class="diff-context">Diff 较大，当前仅显示前 {{ diffLines.length }} 行</div>
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
      <button v-if="parentPath" type="button" class="file-row" @click="emit('openDirectory', parentPath)">
        <PhArrowUp :size="16" /><span>上一级</span>
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
        <component :is="fileIcon(entry)" :size="17" :weight="entry.kind === 'file' ? 'fill' : 'regular'" />
        <span>{{ entry.name }}</span>
        <small v-if="entry.gitStatus && entry.gitStatus !== 'clean'" :class="`git-${entry.gitStatus}`">{{ statusLabel(entry.gitStatus) }}</small>
      </button>
      <div v-if="fileList?.truncated" class="extension-state">目录内容已按 Kimi Server 限制截断。</div>
      <div v-if="fileList && fileList.items.length === 0" class="extension-state">这个目录是空的。</div>

      <section v-if="filePreviewPending || filePreviewError || filePreview" class="file-preview-panel">
        <header><strong>{{ filePreview?.path ?? '文件预览' }}</strong></header>
        <div v-if="filePreviewPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取文件…</div>
        <div v-else-if="filePreviewError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ filePreviewError }}</div>
        <div v-else-if="filePreview?.isBinary" class="extension-state">二进制文件不会作为文本载入 Renderer。</div>
        <pre v-else-if="filePreview" class="file-preview-code"><code v-for="(line, index) in previewLines" :key="index"><span>{{ index + 1 }}</span>{{ line }}
</code></pre>
        <div v-if="filePreview?.truncated || previewClipped" class="diff-context">文件较大，当前仅显示前 {{ previewLines.length }} 行</div>
      </section>
    </div>

    <BrowserPanel
      v-else
      :state="browserState"
      :pending="browserPending"
      :error="browserError"
      :network-details="browserNetworkDetails"
      :network-details-pending="browserNetworkDetailsPending"
      :capture="browserCapture"
      :local-servers="browserLocalServers"
      :local-servers-pending="browserLocalServersPending"
      :annotation-drafts="browserAnnotationDrafts"
      :annotation-picking="browserAnnotationPicking"
      :annotation-submitting="browserAnnotationSubmitting"
      :annotation-error="browserAnnotationError"
      @bounds="emit('browserBounds', $event)"
      @navigate="emit('browserNavigate', $event)"
      @back="emit('browserBack')"
      @forward="emit('browserForward')"
      @reload="emit('browserReload')"
      @stop="emit('browserStop')"
      @viewport="emit('browserViewport', $event)"
      @clear-console="emit('browserClearConsole')"
      @clear-network="emit('browserClearNetwork')"
      @network-details="emit('browserNetworkDetails', $event)"
      @capture-page="emit('browserCapturePage', $event)"
      @pick-annotation="emit('browserPickAnnotation', $event)"
      @delete-annotation="emit('browserDeleteAnnotation', $event)"
      @submit-annotation="emit('browserSubmitAnnotation', $event)"
      @open-external="emit('browserOpenExternal')"
    />
  </aside>
</template>
