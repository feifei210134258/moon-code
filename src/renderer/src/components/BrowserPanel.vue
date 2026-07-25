<script setup lang="ts">
import {
  PhCamera,
  PhChatTeardropText,
  PhCornersOut,
  PhDesktop,
  PhDeviceMobile,
  PhDeviceTablet,
  PhGlobe,
  PhSpinnerGap,
  PhWarningCircle,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue'
import type {
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput,
  BrowserBounds,
  BrowserCaptureResult,
  BrowserViewState,
  BrowserViewport
} from '@shared/contracts'

const props = withDefaults(defineProps<{
  state: BrowserViewState
  pending: boolean
  error: string | null
  capture: BrowserCaptureResult | null
  annotationBackdrop?: BrowserCaptureResult | null
  annotationDrafts?: BrowserAnnotationDraft[]
  annotationPicking?: boolean
  annotationSubmitting?: boolean
  annotationError?: string | null
}>(), {
  annotationDrafts: () => [],
  annotationBackdrop: null,
  annotationPicking: false,
  annotationSubmitting: false,
  annotationError: null
})

const emit = defineEmits<{
  bounds: [bounds: BrowserBounds]
  viewport: [viewport: BrowserViewport]
  capturePage: [fullPage: boolean]
  pickAnnotation: [mode: BrowserAnnotationMode]
  deleteAnnotation: [draftId: string]
  submitAnnotation: [input: BrowserAnnotationSubmitInput]
  overlay: [open: boolean]
}>()

const surface = ref<HTMLElement | null>(null)
const annotationEditors = reactive<Record<string, BrowserAnnotationSubmitInput>>({})
const viewportMode = ref<BrowserViewport['mode']>('auto')
const customWidth = ref(1024)
const customHeight = ref(768)
const annotationOpen = ref(false)
const captureOpen = ref(false)
const surfaceSize = ref({ width: 0, height: 0 })
let observer: ResizeObserver | null = null

const visibleError = computed(() => props.error ?? props.state.error)
const activeAnnotation = computed(() => props.annotationDrafts.at(-1) ?? null)
/* 原生 guest 视图永远盖在 DOM 之上：批注草稿存在或截图预览打开时，
   让主进程暂时摘下 guest，弹层才能看得见、点得到。选择（pick）期间不能摘，
   否则用户无法在页面上点选元素/拖框。 */
const overlayOpen = computed(() =>
  !props.annotationPicking &&
  (props.annotationDrafts.length > 0 || (props.capture !== null && captureOpen.value))
)
const annotationPopoverStyle = computed<CSSProperties>(() => {
  const annotation = activeAnnotation.value
  const { width: surfaceWidth, height: surfaceHeight } = surfaceSize.value
  if (annotation === null || surfaceWidth < 1 || surfaceHeight < 1) return {}

  const pageViewport = annotation.annotation.page.viewport
  const rect = annotation.annotation.target.rect
  const scaleX = surfaceWidth / Math.max(1, pageViewport.width)
  const scaleY = surfaceHeight / Math.max(1, pageViewport.height)
  const popoverWidth = Math.min(340, Math.max(220, surfaceWidth - 24))
  const targetLeft = rect.x * scaleX
  const targetTop = rect.y * scaleY
  const targetRight = targetLeft + rect.width * scaleX
  const rightCandidate = targetRight + 12
  const leftCandidate = targetLeft - popoverWidth - 12
  const desiredLeft = rightCandidate + popoverWidth <= surfaceWidth - 12 ? rightCandidate : leftCandidate
  const left = Math.max(12, Math.min(desiredLeft, Math.max(12, surfaceWidth - popoverWidth - 12)))
  const top = Math.max(12, Math.min(targetTop, Math.max(12, surfaceHeight - 220)))
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.round(popoverWidth)}px` }
})
const annotationTargetStyle = computed<CSSProperties>(() => {
  const annotation = activeAnnotation.value
  const { width: surfaceWidth, height: surfaceHeight } = surfaceSize.value
  if (annotation === null || surfaceWidth < 1 || surfaceHeight < 1) return {}
  const pageViewport = annotation.annotation.page.viewport
  const rect = annotation.annotation.target.rect
  const scaleX = surfaceWidth / Math.max(1, pageViewport.width)
  const scaleY = surfaceHeight / Math.max(1, pageViewport.height)
  return {
    left: `${Math.round(rect.x * scaleX)}px`,
    top: `${Math.round(rect.y * scaleY)}px`,
    width: `${Math.max(4, Math.round(rect.width * scaleX))}px`,
    height: `${Math.max(4, Math.round(rect.height * scaleY))}px`
  }
})

watch(() => props.state.viewport, (viewport) => {
  viewportMode.value = viewport.mode
  if (viewport.width !== null) customWidth.value = viewport.width
  if (viewport.height !== null) customHeight.value = viewport.height
}, { immediate: true })

watch(() => props.capture, (capture) => { if (capture !== null) captureOpen.value = true }, { immediate: true })

watch(overlayOpen, (open) => emit('overlay', open), { immediate: true })

watch(() => props.annotationDrafts, (drafts) => {
  const ids = new Set(drafts.map((draft) => draft.id))
  for (const id of Object.keys(annotationEditors)) {
    if (!ids.has(id)) delete annotationEditors[id]
  }
  for (const draft of drafts) {
    annotationEditors[draft.id] ??= {
      draftId: draft.id,
      comment: draft.annotation.comment,
      pageUrl: draft.annotation.page.url,
      includeSelector: true,
      includeText: true,
      includeScreenshot: true
    }
  }
  if (drafts.length > 0) annotationOpen.value = true
}, { immediate: true, deep: true })

function annotationEditor(draft: BrowserAnnotationDraft): BrowserAnnotationSubmitInput {
  return annotationEditors[draft.id] ?? {
    draftId: draft.id,
    comment: '',
    pageUrl: draft.annotation.page.url,
    includeSelector: true,
    includeText: true,
    includeScreenshot: true
  }
}

function updateAnnotationText(
  draft: BrowserAnnotationDraft,
  field: 'comment' | 'pageUrl',
  event: Event
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
  annotationEditors[draft.id] = { ...annotationEditor(draft), [field]: target.value }
}

function submitAnnotation(draft: BrowserAnnotationDraft): void {
  emit('submitAnnotation', { ...annotationEditor(draft) })
}

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
  surfaceSize.value = { width: rect.width, height: rect.height }
  emit('bounds', {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  })
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || (!annotationOpen.value && !captureOpen.value)) return
  event.preventDefault()
  annotationOpen.value = false
  captureOpen.value = false
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(reportBounds)
    if (surface.value !== null) observer.observe(surface.value)
  }
  window.addEventListener('resize', reportBounds)
  window.addEventListener('keydown', onWindowKeydown)
  void nextTick(reportBounds)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', reportBounds)
  window.removeEventListener('keydown', onWindowKeydown)
  if (overlayOpen.value) emit('overlay', false)
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
      <button type="button" aria-label="窗口截图" :disabled="state.url.length === 0 || pending" @click="emit('capturePage', false)"><PhCamera :size="15" />窗口截图</button>
      <button
        type="button"
        aria-label="批注元素"
        :disabled="state.url.length === 0 || annotationPicking"
        @click="emit('pickAnnotation', 'element')"
      ><PhChatTeardropText :size="15" />{{ annotationPicking ? '选择中…' : '批注' }}</button>
      <button
        type="button"
        aria-label="框选区域"
        :disabled="state.url.length === 0 || annotationPicking"
        @click="emit('pickAnnotation', 'region')"
      ><PhCornersOut :size="15" />框选区域</button>
    </div>

    <div class="browser-surface">
      <div ref="surface" class="browser-guest-host">
        <div v-if="state.url.length === 0" class="browser-empty">
          <PhGlobe :size="34" weight="duotone" />
          <strong>从项目文件打开 HTML 预览</strong>
          <span>预览会通过 Workspace 隔离的本地服务加载。</span>
        </div>
        <img
          v-else-if="overlayOpen && activeAnnotation && annotationBackdrop"
          class="browser-overlay-backdrop"
          :src="annotationBackdrop.dataUrl"
          alt="当前批注页面快照"
        />
        <img
          v-else-if="overlayOpen && capture && captureOpen"
          class="browser-overlay-backdrop"
          :src="capture.dataUrl"
          alt="当前浏览器截图"
        />
        <div v-else-if="overlayOpen" class="browser-empty">
          <PhChatTeardropText :size="30" weight="duotone" />
          <strong>正在准备页面快照</strong>
          <span>快照将在操作卡片后保持可见。</span>
        </div>
        <span
          v-if="overlayOpen && activeAnnotation && annotationBackdrop"
          class="browser-annotation-target"
          :class="`is-${activeAnnotation.annotation.target.kind}`"
          :style="annotationTargetStyle"
          aria-hidden="true"
        />
        <div v-if="state.loading" class="browser-loading"><PhSpinnerGap class="spin" :size="17" /></div>
      </div>
      <section v-if="activeAnnotation && annotationOpen" class="browser-annotation-popover" :style="annotationPopoverStyle" aria-label="正在编辑批注">
        <header>
          <strong><PhChatTeardropText :size="15" />{{ activeAnnotation.annotation.target.kind === 'element' ? '元素批注' : '区域批注' }}</strong>
          <button type="button" aria-label="收起批注" @click="annotationOpen = false"><PhX :size="14" /></button>
        </header>
        <p>{{ Math.round(activeAnnotation.annotation.target.rect.width) }} × {{ Math.round(activeAnnotation.annotation.target.rect.height) }}</p>
        <textarea
          :value="annotationEditor(activeAnnotation).comment"
          rows="2"
          placeholder="描述需要调整的地方…"
          @input="updateAnnotationText(activeAnnotation, 'comment', $event)"
        />
        <footer>
          <button type="button" @click="emit('deleteAnnotation', activeAnnotation.id)">取消</button>
          <button
            class="is-primary"
            type="button"
            :disabled="annotationSubmitting || annotationEditor(activeAnnotation).comment.trim().length === 0"
            @click="submitAnnotation(activeAnnotation)"
          >{{ annotationSubmitting ? '发送中…' : '发送给 Kimi' }}</button>
        </footer>
      </section>
      <button
        v-else-if="annotationDrafts.length > 0"
        class="browser-annotation-reopen"
        type="button"
        :style="annotationPopoverStyle"
        @click="annotationOpen = true"
      ><PhChatTeardropText :size="15" />{{ annotationDrafts.length }} 条批注</button>
      <figure v-if="capture && captureOpen" class="browser-capture-popover">
        <figcaption><span>窗口截图 · {{ capture.width }} × {{ capture.height }}</span><button type="button" aria-label="关闭截图预览" @click="captureOpen = false"><PhX :size="14" /></button></figcaption>
        <img :src="capture.dataUrl" alt="浏览器窗口截图" />
      </figure>
    </div>

    <div v-if="visibleError" class="browser-error" role="alert"><PhWarningCircle :size="16" />{{ visibleError }}</div>
    <div v-if="annotationError" class="browser-error" role="alert"><PhWarningCircle :size="16" />{{ annotationError }}</div>
  </section>
</template>
