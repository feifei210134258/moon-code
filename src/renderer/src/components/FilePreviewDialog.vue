<script setup lang="ts">
import {
  PhArrowSquareOut,
  PhDownloadSimple,
  PhFile,
  PhFolderOpen,
  PhSpinnerGap,
  PhWarningCircle,
  PhX
} from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { WorkspaceFilePreview } from '@shared/contracts'

const props = defineProps<{
  preview: WorkspaceFilePreview | null
  pending: boolean
  error: string | null
  actionPending: string | null
  actionError: string | null
  actionNotice: string | null
}>()

const emit = defineEmits<{
  close: []
  download: [path: string]
  openExternal: [path: string]
  reveal: [path: string]
}>()

const open = computed(() => props.pending || props.error !== null || props.preview !== null)
const previewLines = computed(() => (props.preview?.content ?? '').split('\n').slice(0, 400))
const previewClipped = computed(() => (
  (props.preview?.lineCount ?? previewLines.value.length) > previewLines.value.length
))
const previewMeta = computed(() => {
  const preview = props.preview
  if (preview === null) return '正在读取文件内容'
  const details = [preview.languageId ?? (preview.mime.length > 0 ? preview.mime : null) ?? '文本文件']
  if (!preview.isBinary) details.push(`${preview.lineCount} 行`)
  details.push(formatBytes(preview.size))
  return details.join(' · ')
})

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  emit('close')
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`
  return `${Math.round(value / (102.4 * 1024)) / 10} MB`
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="file-preview-backdrop" @click.self="emit('close')">
      <section
        class="file-preview-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="preview ? `预览 ${preview.path}` : '文件预览'"
      >
        <header>
          <div class="file-preview-identity">
            <PhFile :size="18" weight="fill" />
            <span>
              <strong>{{ preview?.path ?? '文件预览' }}</strong>
              <small>{{ previewMeta }}</small>
            </span>
          </div>
          <div v-if="preview" class="file-preview-toolbar" aria-label="文件操作">
            <button type="button" :disabled="actionPending !== null" @click="emit('download', preview.path)">
              <PhDownloadSimple :size="15" /><span>下载</span>
            </button>
            <button type="button" :disabled="actionPending !== null" @click="emit('openExternal', preview.path)">
              <PhArrowSquareOut :size="15" /><span>系统打开</span>
            </button>
            <button type="button" :disabled="actionPending !== null" @click="emit('reveal', preview.path)">
              <PhFolderOpen :size="15" /><span>Finder</span>
            </button>
          </div>
          <button class="file-preview-close" type="button" aria-label="关闭文件预览" @click="emit('close')">
            <PhX :size="17" />
          </button>
        </header>

        <p v-if="actionError" class="file-preview-message is-error" role="alert">{{ actionError }}</p>
        <p v-else-if="actionNotice" class="file-preview-message">{{ actionNotice }}</p>

        <div class="file-preview-body">
          <div v-if="pending" class="file-preview-state"><PhSpinnerGap class="spin" :size="19" />正在读取文件…</div>
          <div v-else-if="error" class="file-preview-state is-error"><PhWarningCircle :size="19" />{{ error }}</div>
          <div v-else-if="preview?.isBinary" class="file-preview-state">
            <PhFile :size="22" />二进制文件不会作为文本载入 Moon Code，可使用上方操作在其他应用中查看。
          </div>
          <pre v-else-if="preview" class="workspace-file-preview-code"><code v-for="(line, index) in previewLines" :key="index"><span>{{ index + 1 }}</span>{{ line }}
</code></pre>
        </div>
        <footer v-if="preview?.truncated || previewClipped">文件较大，当前仅显示前 {{ previewLines.length }} 行</footer>
      </section>
    </div>
  </Teleport>
</template>
