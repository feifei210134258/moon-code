<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import type { PetVisualState } from '@shared/contracts'
import lumiAtlasUrl from '../assets/lumi-spritesheet.webp'
import { petAnimationFor } from '../utils/petSprite'

const props = defineProps<{
  status: PetVisualState
}>()

const frame = ref(0)
const reducedMotion = ref(false)
const assetFailed = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let media: MediaQueryList | null = null

const animation = computed(() => petAnimationFor(props.status))
const column = computed(() => animation.value.columns?.[frame.value] ?? frame.value)
const atlasStyle = computed<CSSProperties>(() => ({
  '--lumi-row': String(animation.value.row),
  '--lumi-column': String(column.value)
}))

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function scheduleNextFrame(): void {
  clearTimer()
  const current = animation.value
  if (reducedMotion.value || !current.loop || current.frames < 2) return
  const duration = current.durations[Math.min(frame.value, current.durations.length - 1)] ?? 150
  timer = setTimeout(() => {
    frame.value = (frame.value + 1) % current.frames
    scheduleNextFrame()
  }, duration)
}

function resetAnimation(): void {
  frame.value = 0
  scheduleNextFrame()
}

function onMotionPreference(event: MediaQueryListEvent): void {
  reducedMotion.value = event.matches
}

watch(() => [props.status, reducedMotion.value], resetAnimation, { immediate: true })

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = media.matches
  media.addEventListener('change', onMotionPreference)
})

onBeforeUnmount(() => {
  clearTimer()
  media?.removeEventListener('change', onMotionPreference)
})
</script>

<template>
  <div
    class="lumi-sprite"
    :class="{ 'is-failed': assetFailed }"
    :data-row="animation.row"
    :data-column="column"
    :data-frame="frame"
    :data-reduced-motion="reducedMotion"
  >
    <img
      v-if="!assetFailed"
      class="lumi-sprite__atlas"
      :src="lumiAtlasUrl"
      alt=""
      draggable="false"
      :style="atlasStyle"
      @error="assetFailed = true"
    >
  </div>
</template>

<style scoped>
.lumi-sprite {
  position: relative;
  width: 96px;
  height: 104px;
  overflow: hidden;
  filter: drop-shadow(0 7px 10px rgba(54, 72, 95, 0.14));
}

.lumi-sprite__atlas {
  position: absolute;
  top: calc(var(--lumi-row) * -104px);
  left: calc(var(--lumi-column) * -96px);
  width: 768px;
  height: 208px;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

.lumi-sprite.is-failed {
  opacity: 0;
}
</style>
