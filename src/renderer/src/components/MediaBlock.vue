<script setup lang="ts">
import { PhArrowCounterClockwise, PhImage, PhMinus, PhPlus, PhSpinnerGap, PhWarningCircle, PhX } from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  mediaType: 'image' | 'video'
  sessionId: string | null
  fileId: string | null
  sourceMediaType: string | null
  base64Data: string | null
}>()

const source = ref<string | null>(null)
const error = ref<string | null>(null)
const previewOpen = ref(false)
const previewViewport = ref<HTMLElement | null>(null)
const zoom = ref(1)
const naturalSize = ref({ width: 0, height: 0 })
const viewportSize = ref({ width: 0, height: 0 })
let objectUrl: string | null = null
const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const ZOOM_STEP = 0.25

const fittedSize = computed(() => {
  const natural = naturalSize.value
  const viewport = viewportSize.value
  if (natural.width <= 0 || natural.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { width: 0, height: 0 }
  }
  const fit = Math.min(
    Math.max(1, viewport.width - 24) / natural.width,
    Math.max(1, viewport.height - 24) / natural.height,
    1
  )
  return {
    width: Math.max(1, Math.round(natural.width * fit * zoom.value)),
    height: Math.max(1, Math.round(natural.height * fit * zoom.value))
  }
})
const previewCanvasStyle = computed(() => ({
  width: `${Math.max(viewportSize.value.width, fittedSize.value.width)}px`,
  height: `${Math.max(viewportSize.value.height, fittedSize.value.height)}px`
}))
const previewImageStyle = computed(() => ({
  width: `${fittedSize.value.width}px`,
  height: `${fittedSize.value.height}px`
}))
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`)

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
    // 用户发送的图片/视频（prompt 附件）从会话历史持久化，走 0.37.2+ 的 session media 端点；
    // 无 sessionId 时回退旧的文件下载端点。
    const result = props.sessionId !== null
      ? await window.kimiAgent.readSessionMedia(props.sessionId, props.fileId, 'application/octet-stream')
      : await window.kimiAgent.readAttachment(props.fileId, 'application/octet-stream')
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

function closePreview(): void {
  previewOpen.value = false
  zoom.value = 1
}

function openPreview(): void {
  zoom.value = 1
  previewOpen.value = true
  void nextTick(() => {
    updateViewportSize()
    previewViewport.value?.focus()
  })
}

function updateViewportSize(): void {
  const viewport = previewViewport.value
  if (viewport === null) return
  viewportSize.value = { width: viewport.clientWidth, height: viewport.clientHeight }
}

function onPreviewImageLoad(event: Event): void {
  const image = event.currentTarget as HTMLImageElement
  naturalSize.value = { width: image.naturalWidth, height: image.naturalHeight }
  updateViewportSize()
}

function setZoom(value: number): void {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(value * 100) / 100))
  if (next === zoom.value) return
  const viewport = previewViewport.value
  const centerX = viewport === null ? 0.5 : (viewport.scrollLeft + viewport.clientWidth / 2) / Math.max(1, viewport.scrollWidth)
  const centerY = viewport === null ? 0.5 : (viewport.scrollTop + viewport.clientHeight / 2) / Math.max(1, viewport.scrollHeight)
  zoom.value = next
  void nextTick(() => {
    const current = previewViewport.value
    if (current === null) return
    current.scrollLeft = centerX * current.scrollWidth - current.clientWidth / 2
    current.scrollTop = centerY * current.scrollHeight - current.clientHeight / 2
  })
}

function zoomIn(): void {
  setZoom(zoom.value + ZOOM_STEP)
}

function zoomOut(): void {
  setZoom(zoom.value - ZOOM_STEP)
}

function resetZoom(): void {
  setZoom(1)
}

function onPreviewWheel(event: WheelEvent): void {
  if (!previewOpen.value || event.deltaY === 0) return
  setZoom(zoom.value + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (!previewOpen.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closePreview()
    return
  }
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
    event.preventDefault()
    zoomIn()
    return
  }
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
    event.preventDefault()
    zoomOut()
    return
  }
  if (event.key === '0' || event.code === 'Numpad0') {
    event.preventDefault()
    resetZoom()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('resize', updateViewportSize)
  void load()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('resize', updateViewportSize)
  if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <figure class="media-block">
    <button
      v-if="source && mediaType === 'image'"
      class="media-image-trigger"
      type="button"
      aria-label="放大查看图片"
      @click="openPreview"
    ><img :src="source" alt="Kimi 会话图片附件" /></button>
    <video v-else-if="source" :src="source" controls preload="metadata" />
    <div v-else-if="error" class="media-block-state is-error"><PhWarningCircle :size="18" />{{ error }}</div>
    <div v-else class="media-block-state"><PhSpinnerGap class="spin" :size="18" />正在读取媒体…</div>
    <figcaption><PhImage :size="14" />{{ mediaType === 'image' ? '图片附件' : '视频附件' }}</figcaption>
  </figure>
  <Teleport to="body">
    <div v-if="previewOpen && source" class="media-preview-backdrop" @click.self="closePreview">
      <section class="media-preview-dialog" role="dialog" aria-modal="true" aria-label="图片放大预览">
        <header class="media-preview-toolbar">
          <span>滚轮或 + / − 缩放 · 0 重置</span>
          <div>
            <button type="button" aria-label="缩小图片" :disabled="zoom <= MIN_ZOOM" @click="zoomOut"><PhMinus :size="17" /></button>
            <button type="button" aria-label="重置图片缩放" @click="resetZoom"><PhArrowCounterClockwise :size="16" />{{ zoomLabel }}</button>
            <button type="button" aria-label="放大图片" :disabled="zoom >= MAX_ZOOM" @click="zoomIn"><PhPlus :size="17" /></button>
            <button type="button" aria-label="关闭图片预览" @click="closePreview"><PhX :size="19" /></button>
          </div>
        </header>
        <div
          ref="previewViewport"
          class="media-preview-viewport"
          tabindex="0"
          :aria-label="`图片预览，当前缩放 ${zoomLabel}`"
          @wheel.prevent="onPreviewWheel"
        >
          <div class="media-preview-canvas" :style="previewCanvasStyle">
            <img
              :src="source"
              :style="previewImageStyle"
              alt="Kimi 会话图片放大预览"
              @load="onPreviewImageLoad"
            />
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
