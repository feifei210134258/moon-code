<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowSquareOut,
  PhChatCircleText,
  PhFile,
  PhFolderOpen,
  PhMagnifyingGlass,
  PhSpinnerGap,
  PhTextT,
  PhTrash,
  PhWarningCircle
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  BrowserBounds,
  BrowserViewState,
  BrowserViewport,
  WorkspaceFileEntry,
  WorkspaceFilePreview,
  WorkspaceFileSearchResult,
  WorkspaceGrepResult
} from '@shared/contracts'
import type { ExtensionTab, WorkspaceFileTreeState } from '../types'
import BrowserPanel from './BrowserPanel.vue'
import ExplorerIcon from './icons/ExplorerIcon.vue'
import FileTreeNode from './FileTreeNode.vue'
import FinderIcon from './icons/FinderIcon.vue'

const props = withDefaults(defineProps<{
  width: number
  activeTab: ExtensionTab
  workspaceName: string
  platform?: string
  fileTree: WorkspaceFileTreeState
  fileTreeReveal?: string | null
  filePreview: WorkspaceFilePreview | null
  fileActionPending?: string | null
  fileActionError?: string | null
  fileActionNotice?: string | null
  fileSearch?: WorkspaceFileSearchResult | null
  fileSearchPending?: boolean
  fileSearchError?: string | null
  fileGrep?: WorkspaceGrepResult | null
  fileGrepPending?: boolean
  fileGrepError?: string | null
  browserState: BrowserViewState
  browserPending: boolean
  browserError: string | null
  browserElementPicking?: boolean
}>(), {
  platform: 'darwin',
  browserElementPicking: false,
  fileTreeReveal: null,
  fileSearch: null,
  fileSearchPending: false,
  fileSearchError: null,
  fileGrep: null,
  fileGrepPending: false,
  fileGrepError: null,
  fileActionPending: null,
  fileActionError: null,
  fileActionNotice: null
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
  browserPickElements: []
  browserStopPicking: []
  browserReload: []
  browserOpenExternal: []
}>()

const rootEntries = computed<WorkspaceFileEntry[]>(() => props.fileTree.children[props.fileTree.root] ?? [])
const rootLoaded = computed(() => props.fileTree.children[props.fileTree.root] !== undefined)
/* 打开工作区根目录的入口按平台区分：macOS 访达、Windows 文件资源管理器。 */
const isMacPlatform = computed(() => props.platform === 'darwin')
const openRootInFileManagerLabel = computed(() => isMacPlatform.value ? '在访达中打开项目文件夹' : '在文件资源管理器中打开项目文件夹')
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

/* 搜索结果跳转目录后，等树渲染完成再滚动到目标行的视口中央。 */
watch(() => props.fileTreeReveal, (path) => {
  if (path === null) return
  void nextTick(() => {
    const rows = document.querySelectorAll('.files-view .file-row')
    for (const row of rows) {
      if ((row as HTMLElement).dataset.path === path) {
        row.scrollIntoView?.({ block: 'nearest' })
        break
      }
    }
  })
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

    <div v-if="activeTab === 'files'" class="extension-content files-view">
      <header class="files-toolbar">
        <strong><PhFolderOpen :size="18" />{{ workspaceName }}</strong>
        <button
          class="icon-button"
          type="button"
          :title="openRootInFileManagerLabel"
          :aria-label="openRootInFileManagerLabel"
          :disabled="fileActionPending !== null"
          @click="emit('openSystem', '.')"
        ><FinderIcon v-if="isMacPlatform" :size="15" /><ExplorerIcon v-else :size="15" /></button>
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
      <div v-if="fileTree.rootPending" class="extension-state"><PhSpinnerGap class="spin" :size="17" />正在读取目录…</div>
      <div v-else-if="fileTree.rootError" class="extension-state is-error"><PhWarningCircle :size="17" />{{ fileTree.rootError }}</div>
      <template v-else-if="rootLoaded">
        <FileTreeNode
          v-for="entry in rootEntries"
          :key="entry.path"
          :file-tree="fileTree"
          :entry="entry"
          :depth="0"
          :active-path="filePreview?.path ?? null"
          @open-entry="emit('openEntry', $event)"
          @open-context-menu="openEntryContextMenu"
        />
        <div v-if="rootEntries.length === 0" class="extension-state">这个目录是空的。</div>
        <div v-if="fileTree.truncated" class="extension-state">目录内容已按 Kimi Server 限制截断。</div>
      </template>
    </div>

    <BrowserPanel
      v-else
      :state="browserState"
      :pending="browserPending"
      :error="browserError"
      :element-picking="browserElementPicking"
      @bounds="emit('browserBounds', $event)"
      @viewport="emit('browserViewport', $event)"
      @pick-elements="emit('browserPickElements')"
      @stop-picking="emit('browserStopPicking')"
      @reload="emit('browserReload')"
      @open-external="emit('browserOpenExternal')"
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
