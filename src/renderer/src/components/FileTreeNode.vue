<script setup lang="ts">
import {
  PhCaretRight,
  PhFile,
  PhFileCss,
  PhFileHtml,
  PhFileJs,
  PhFileTs,
  PhFolderOpen,
  PhSpinnerGap,
  PhWarningCircle
} from '@phosphor-icons/vue'
import { computed } from 'vue'
import type { WorkspaceFileEntry } from '@shared/contracts'
import type { WorkspaceFileTreeState } from '../types'

const props = defineProps<{
  fileTree: WorkspaceFileTreeState
  entry: WorkspaceFileEntry
  depth: number
  activePath: string | null
}>()

const emit = defineEmits<{
  openEntry: [entry: WorkspaceFileEntry]
  openContextMenu: [entry: WorkspaceFileEntry, event: MouseEvent]
}>()

const childrenLoaded = computed(() => props.fileTree.children[props.entry.path] !== undefined)
const children = computed<WorkspaceFileEntry[]>(() => props.fileTree.children[props.entry.path] ?? [])

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

function rowIndent(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${8 + depth * 14}px` }
}
</script>

<template>
  <div v-if="entry.kind === 'directory'" class="file-tree-node">
    <button
      type="button"
      class="file-row"
      :class="{ 'is-active': activePath === entry.path, 'is-expanded': fileTree.expanded[entry.path] === true }"
      :style="rowIndent(depth)"
      :data-path="entry.path"
      @click="emit('openEntry', entry)"
      @contextmenu.prevent.stop="emit('openContextMenu', entry, $event)"
    >
      <PhCaretRight class="file-caret" :size="13" />
      <component :is="fileIcon(entry)" :size="17" weight="regular" />
      <span>{{ entry.name }}</span>
      <PhSpinnerGap v-if="fileTree.pending[entry.path] === true" class="spin" :size="13" />
      <small
        v-else-if="entry.gitStatus && entry.gitStatus !== 'clean'"
        :class="`git-${entry.gitStatus}`"
      >{{ statusLabel(entry.gitStatus) }}</small>
    </button>
    <div v-if="fileTree.expanded[entry.path] === true" class="file-tree-children">
      <div v-if="fileTree.errors[entry.path]" class="extension-state is-error">
        <PhWarningCircle :size="16" />{{ fileTree.errors[entry.path] }}
      </div>
      <template v-else-if="childrenLoaded">
        <FileTreeNode
          v-for="child in children"
          :key="child.path"
          :file-tree="fileTree"
          :entry="child"
          :depth="depth + 1"
          :active-path="activePath"
          @open-entry="emit('openEntry', $event)"
          @open-context-menu="(childEntry, event) => emit('openContextMenu', childEntry, event)"
        />
        <div v-if="children.length === 0" class="extension-state">这个目录是空的。</div>
      </template>
    </div>
  </div>
  <button
    v-else
    type="button"
    class="file-row"
    :class="{ 'is-active': activePath === entry.path }"
    :style="rowIndent(depth)"
    :data-path="entry.path"
    @click="emit('openEntry', entry)"
    @contextmenu.prevent.stop="emit('openContextMenu', entry, $event)"
  >
    <span class="file-row-spacer" />
    <component
      :is="fileIcon(entry)"
      :size="17"
      weight="fill"
      :class="{ 'is-html-file': isHtmlFile(entry) }"
    />
    <span>{{ entry.name }}</span>
    <small
      v-if="entry.gitStatus && entry.gitStatus !== 'clean'"
      :class="`git-${entry.gitStatus}`"
    >{{ statusLabel(entry.gitStatus) }}</small>
  </button>
</template>