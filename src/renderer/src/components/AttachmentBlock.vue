<script setup lang="ts">
import { PhDownloadSimple, PhFile, PhSpinnerGap } from '@phosphor-icons/vue'
import { ref } from 'vue'

const props = defineProps<{
  fileId: string
  name: string
  mediaType: string
  size: number
}>()

const pending = ref(false)
const error = ref<string | null>(null)

async function activate(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || pending.value) return
  pending.value = true
  error.value = null
  try {
    const result = await api.readAttachment(props.fileId, props.mediaType)
    const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: props.mediaType }))
    const anchor = document.createElement('a')
    anchor.href = url
    if (isPreviewable(props.name, props.mediaType)) {
      anchor.target = '_blank'
      anchor.rel = 'noopener noreferrer'
    } else {
      anchor.download = props.name
    }
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    pending.value = false
  }
}

function isPreviewable(name: string, mediaType: string): boolean {
  return /^(image\/|video\/|audio\/|application\/pdf$|text\/)/i.test(mediaType)
    || /\.(?:md|markdown|json|ya?ml|csv|tsv|log)$/i.test(name)
}

function formattedSize(): string {
  if (props.size < 1_024) return `${props.size} B`
  if (props.size < 1_048_576) return `${Math.round(props.size / 1_024)} KB`
  return `${(props.size / 1_048_576).toFixed(1)} MB`
}
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
</template>
