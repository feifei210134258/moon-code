<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import type { PetVisualState } from '@shared/contracts'
import mimoAtlasUrl from '../assets/mimo-spritesheet.webp'
import {
  petAnimationFor,
  petLookCell,
  type PetDragDirection,
  type PetSpriteCell
} from '../utils/petSprite'

const props = withDefaults(defineProps<{
  status: PetVisualState
  dragging?: boolean
  dragDirection?: PetDragDirection
  lookDirection?: number | null
}>(), {
  dragging: false,
  dragDirection: 'right',
  lookDirection: null
})

const frame = ref(0)
const reducedMotion = ref(false)
const assetFailed = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
let media: MediaQueryList | null = null

const animation = computed(() => petAnimationFor(props.status, props.dragging, props.dragDirection))
const usesLookCell = computed(() => (
  !props.dragging &&
  props.lookDirection !== null &&
  (props.status === 'idle' || props.status === 'review')
))
const cell = computed<PetSpriteCell>(() => usesLookCell.value
  ? petLookCell(props.lookDirection ?? 0)
  : { row: animation.value.row, column: frame.value })
const atlasStyle = computed<CSSProperties>(() => ({
  '--mimo-row': String(cell.value.row),
  '--mimo-column': String(cell.value.column)
}))

function clearTimer(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

function scheduleNextFrame(): void {
  clearTimer()
  if (reducedMotion.value || usesLookCell.value) return
  const current = animation.value
  const duration = current.durations[Math.min(frame.value, current.durations.length - 1)] ?? 140
  timer = setTimeout(() => {
    if (frame.value + 1 >= current.frames) {
      if (!current.loop) return
      frame.value = 0
    } else {
      frame.value += 1
    }
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

watch(
  () => [props.status, props.dragging, props.dragDirection, props.lookDirection, reducedMotion.value],
  resetAnimation,
  { immediate: true }
)

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
    class="mimo-sprite"
    :class="{ 'is-fallback': assetFailed }"
    :data-row="cell.row"
    :data-column="cell.column"
    :data-reduced-motion="reducedMotion"
  >
    <img
      v-if="!assetFailed"
      class="mimo-sprite__atlas"
      :src="mimoAtlasUrl"
      alt=""
      draggable="false"
      :style="atlasStyle"
      @error="assetFailed = true"
    >
    <div v-else class="mimo-sprite__fallback">
      <i class="mimo-sprite__ear is-left" />
      <i class="mimo-sprite__ear is-right" />
      <span>M</span>
    </div>
  </div>
</template>

<style scoped>
.mimo-sprite {
  position: relative;
  width: 96px;
  height: 104px;
  overflow: hidden;
  filter: drop-shadow(0 7px 9px rgba(49, 69, 91, 0.15));
}

.mimo-sprite__atlas {
  position: absolute;
  top: calc(var(--mimo-row) * -104px);
  left: calc(var(--mimo-column) * -96px);
  width: 768px;
  height: 1144px;
  max-width: none;
  pointer-events: none;
  user-select: none;
}

.mimo-sprite__fallback {
  position: absolute;
  inset: 9px 6px 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(82, 105, 129, 0.2);
  border-radius: 42px 42px 34px 34px;
  color: #5f7892;
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.98), rgba(226, 238, 247, 0.96));
  font-size: 14px;
  font-weight: 760;
}

.mimo-sprite__ear {
  position: absolute;
  top: -4px;
  width: 30px;
  height: 31px;
  border: 1px solid rgba(82, 105, 129, 0.18);
  border-radius: 8px 20px 8px 17px;
  background: rgba(239, 247, 252, 0.98);
}

.mimo-sprite__ear.is-left { left: 8px; transform: rotate(-23deg); }
.mimo-sprite__ear.is-right { right: 8px; transform: scaleX(-1) rotate(-23deg); }
</style>

