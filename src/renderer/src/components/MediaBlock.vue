<script setup lang="ts">
import { PhImage, PhSpinnerGap, PhWarningCircle } from '@phosphor-icons/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  mediaType: 'image' | 'video'
  fileId: string | null
  sourceMediaType: string | null
  base64Data: string | null
}>()

const source = ref<string | null>(null)
const error = ref<string | null>(null)
let objectUrl: string | null = null

async function load(): Promise<void> {
  if (props.base64Data !== null) {
    source.value = `data:${props.sourceMediaType ?? defaultMediaType()};base64,${props.base64Data}`
    return
  }
  if (props.fileId === null || window.kimiAgent === undefined) {
    error.value = '该媒体来源无法安全预览'
    return
  }
  try {
    const result = await window.kimiAgent.readAttachment(props.fileId, 'application/octet-stream')
    const bytes = new Uint8Array(result.bytes)
    objectUrl = URL.createObjectURL(new Blob([bytes], {
      type: props.sourceMediaType ?? defaultMediaType()
    }))
    source.value = objectUrl
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

function defaultMediaType(): string {
  return props.mediaType === 'image' ? 'image/png' : 'video/mp4'
}

onMounted(() => void load())
onBeforeUnmount(() => {
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <figure class="media-block">
    <img v-if="source && mediaType === 'image'" :src="source" alt="Kimi 会话图片附件" />
    <video v-else-if="source" :src="source" controls preload="metadata" />
    <div v-else-if="error" class="media-block-state is-error"><PhWarningCircle :size="18" />{{ error }}</div>
    <div v-else class="media-block-state"><PhSpinnerGap class="spin" :size="18" />正在读取媒体…</div>
    <figcaption><PhImage :size="14" />{{ mediaType === 'image' ? '图片附件' : '视频附件' }}</figcaption>
  </figure>
</template>
