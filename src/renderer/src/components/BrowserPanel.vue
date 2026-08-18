<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowSquareOut,
  PhCursorClick,
  PhDesktop,
  PhDeviceMobile,
  PhDeviceTablet,
  PhGlobe,
  PhSpinnerGap,
  PhWarningCircle
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type {
  BrowserBounds,
  BrowserViewState,
  BrowserViewport
} from '@shared/contracts'

const props = withDefaults(defineProps<{
  state: BrowserViewState
  pending: boolean
  error: string | null
  elementPicking?: boolean
}>(), {
  elementPicking: false
})

const emit = defineEmits<{
  bounds: [bounds: BrowserBounds]
  viewport: [viewport: BrowserViewport]
  pickElements: []
  stopPicking: []
  reload: []
  openExternal: []
}>()

const surface = ref<HTMLElement | null>(null)
const viewportMode = ref<BrowserViewport['mode']>('auto')
const customWidth = ref(1024)
const customHeight = ref(768)
let observer: ResizeObserver | null = null

const visibleError = computed(() => props.error ?? props.state.error)

watch(() => props.state.viewport, (viewport) => {
  viewportMode.value = viewport.mode
  if (viewport.width !== null) customWidth.value = viewport.width
  if (viewport.height !== null) customHeight.value = viewport.height
}, { immediate: true })

function chooseViewport(): void {
  const presets: Record<Exclude<BrowserViewport['mode'], 'auto' | 'custom'>, BrowserViewport> = {
    desktop: { mode: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    tablet: { mode: 'tablet', width: 768, height: 1024, deviceScaleFactor: 2 },
    mobile: { mode: 'mobile', width: 390, height: 844, deviceScaleFactor: 3 }
  }
  if (viewportMode.value === 'auto') {
    emit('viewport', { mode: 'auto', width: null, height: null, deviceScaleFactor: 1 })
  } else if (viewportMode.value === 'custom') {
    emit('viewport', {
      mode: 'custom', width: customWidth.value, height: customHeight.value, deviceScaleFactor: 1
    })
  } else {
    emit('viewport', presets[viewportMode.value])
  }
}

function reportBounds(): void {
  const element = surface.value
  if (element === null) return
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  emit('bounds', {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  })
}

function toggleElementPicking(): void {
  if (props.elementPicking) {
    emit('stopPicking')
  } else {
    emit('pickElements')
  }
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(reportBounds)
    if (surface.value !== null) observer.observe(surface.value)
  }
  window.addEventListener('resize', reportBounds)
  void nextTick(reportBounds)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', reportBounds)
})
</script>

<template>
  <section class="browser-panel" aria-label="开发浏览器">
    <div class="browser-options">
      <label>
        <component :is="viewportMode === 'mobile' ? PhDeviceMobile : viewportMode === 'tablet' ? PhDeviceTablet : PhDesktop" :size="15" />
        <select v-model="viewportMode" aria-label="视口尺寸" @change="chooseViewport">
          <option value="auto">适应面板</option>
          <option value="desktop">桌面 · 1440 × 900</option>
          <option value="tablet">平板 · 768 × 1024</option>
          <option value="mobile">手机 · 390 × 844</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      <span v-if="viewportMode === 'custom'" class="browser-custom-size">
        <input v-model.number="customWidth" type="number" min="240" max="2560" aria-label="自定义视口宽度" @change="chooseViewport" />
        ×
        <input v-model.number="customHeight" type="number" min="240" max="2560" aria-label="自定义视口高度" @change="chooseViewport" />
      </span>
      <button
        type="button"
        aria-label="选择网页元素"
        :class="{ 'is-picking': elementPicking }"
        :disabled="state.url.length === 0"
        @click="toggleElementPicking"
      ><PhCursorClick :size="15" />{{ elementPicking ? '选择中…' : '选择元素' }}</button>
      <button
        type="button"
        aria-label="刷新页面"
        :disabled="state.url.length === 0 || pending"
        @click="emit('reload')"
      ><PhArrowClockwise :size="15" /></button>
      <button
        type="button"
        class="browser-open-external"
        aria-label="在默认浏览器中打开"
        :disabled="state.url.length === 0 || pending"
        @click="emit('openExternal')"
      ><PhArrowSquareOut :size="15" /><span>在默认浏览器中打开</span></button>
    </div>

    <div class="browser-surface">
      <div ref="surface" class="browser-guest-host">
        <div v-if="state.url.length === 0" class="browser-empty">
          <PhGlobe :size="34" weight="duotone" />
          <strong>从项目文件打开 HTML 预览</strong>
          <span>预览会通过 Workspace 隔离的本地服务加载。</span>
        </div>
        <div v-if="state.loading" class="browser-loading"><PhSpinnerGap class="spin" :size="17" /></div>
      </div>
    </div>

    <div v-if="visibleError" class="browser-error" role="alert"><PhWarningCircle :size="16" />{{ visibleError }}</div>
  </section>
</template>