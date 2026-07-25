<script setup lang="ts">
import { PhDownloadSimple, PhFile, PhSpinnerGap, PhX } from '@phosphor-icons/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  fileId: string
  name: string
  mediaType: string
  size: number
}>()

const pending = ref(false)
const error = ref<string | null>(null)
const previewOpen = ref(false)
const previewKind = ref<'html' | 'text' | 'document' | null>(null)
const previewUrl = ref<string | null>(null)
const previewText = ref('')

async function activate(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || pending.value) return
  pending.value = true
  error.value = null
  try {
    const result = await api.readAttachment(props.fileId, props.mediaType)
    if (isHtml(props.name, props.mediaType)) {
      openUrlPreview('html', result.bytes, result.mediaType)
      return
    }
    if (isText(props.name, props.mediaType)) {
      previewKind.value = 'text'
      previewText.value = new TextDecoder().decode(result.bytes)
      previewOpen.value = true
      return
    }
    if (/^(image\/|application\/pdf$)/i.test(result.mediaType)) {
      openUrlPreview('document', result.bytes, result.mediaType)
      return
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: props.mediaType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = props.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    pending.value = false
  }
}

function openUrlPreview(kind: 'html' | 'document', bytes: Uint8Array, mediaType: string): void {
  closePreview()
  previewKind.value = kind
  previewUrl.value = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mediaType }))
  previewOpen.value = true
}

function closePreview(): void {
  previewOpen.value = false
  previewKind.value = null
  previewText.value = ''
  if (previewUrl.value !== null) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = null
}

function isHtml(name: string, mediaType: string): boolean {
  return /^text\/html$/i.test(mediaType) || /\.html?$/i.test(name)
}

function isText(name: string, mediaType: string): boolean {
  return /^text\//i.test(mediaType)
    || /(?:json|ya?ml|xml|csv|tsv|log|md|markdown|txt)$/i.test(name)
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !previewOpen.value) return
  event.preventDefault()
  closePreview()
}

function formattedSize(): string {
  if (props.size < 1_024) return `${props.size} B`
  if (props.size < 1_048_576) return `${Math.round(props.size / 1_024)} KB`
  return `${(props.size / 1_048_576).toFixed(1)} MB`
}

onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  closePreview()
})
</script>

<template>
  <div class="attachment-block" :title="error ?? `${name} · ${formattedSize()}`">
    <PhFile :size="18" />
    <span><strong>{{ name }}</strong><small>{{ formattedSize() }}</small></span>
    <button type="button" :aria-label="`打开或下载 ${name}`" :disabled="pending" @click="activate">
      <PhSpinnerGap v-if="pending" class="spin" :size="15" />
      <PhDownloadSimple v-else :size="15" />
    </button>
  </div>
  <Teleport to="body">
    <div v-if="previewOpen" class="attachment-preview-backdrop" @click.self="closePreview">
      <section class="attachment-preview-dialog" role="dialog" aria-modal="true" :aria-label="`预览 ${name}`">
        <header><strong>{{ name }}</strong><button type="button" aria-label="关闭文件预览" @click="closePreview"><PhX :size="16" /></button></header>
        <iframe v-if="previewKind === 'html'" :src="previewUrl ?? undefined" sandbox="" title="HTML 文件预览" />
        <iframe v-else-if="previewKind === 'document'" :src="previewUrl ?? undefined" :title="`${name} 预览`" />
        <pre v-else>{{ previewText }}</pre>
      </section>
    </div>
  </Teleport>
</template>
