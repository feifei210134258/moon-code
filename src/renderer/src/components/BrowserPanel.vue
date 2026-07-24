<script setup lang="ts">
import {
  PhArrowClockwise,
  PhArrowLeft,
  PhArrowRight,
  PhArrowSquareOut,
  PhCamera,
  PhDesktop,
  PhDeviceMobile,
  PhDeviceTablet,
  PhGlobe,
  PhSpinnerGap,
  PhStop,
  PhTrash,
  PhWarningCircle
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type {
  BrowserAnnotationDraft,
  BrowserAnnotationMode,
  BrowserAnnotationSubmitInput,
  BrowserBounds,
  BrowserCaptureResult,
  BrowserNetworkDetails,
  BrowserViewState,
  BrowserViewport
} from '@shared/contracts'

const props = withDefaults(defineProps<{
  state: BrowserViewState
  pending: boolean
  error: string | null
  networkDetails: BrowserNetworkDetails | null
  networkDetailsPending: boolean
  capture: BrowserCaptureResult | null
  localServers: string[]
  localServersPending: boolean
  annotationDrafts?: BrowserAnnotationDraft[]
  annotationPicking?: boolean
  annotationSubmitting?: boolean
  annotationError?: string | null
}>(), {
  annotationDrafts: () => [],
  annotationPicking: false,
  annotationSubmitting: false,
  annotationError: null
})

const emit = defineEmits<{
  bounds: [bounds: BrowserBounds]
  navigate: [url: string]
  back: []
  forward: []
  reload: []
  stop: []
  viewport: [viewport: BrowserViewport]
  clearConsole: []
  clearNetwork: []
  networkDetails: [requestId: string]
  capturePage: [fullPage: boolean]
  pickAnnotation: [mode: BrowserAnnotationMode]
  deleteAnnotation: [draftId: string]
  submitAnnotation: [input: BrowserAnnotationSubmitInput]
  openExternal: []
}>()

const surface = ref<HTMLElement | null>(null)
const address = ref('')
const addressFocused = ref(false)
const diagnosticsTab = ref<'console' | 'network' | 'capture' | 'annotations'>('console')
const annotationEditors = reactive<Record<string, BrowserAnnotationSubmitInput>>({})
const viewportMode = ref<BrowserViewport['mode']>('auto')
const customWidth = ref(1024)
const customHeight = ref(768)
let observer: ResizeObserver | null = null

const visibleError = computed(() => props.error ?? props.state.error)
const selectedRequest = computed(() => props.networkDetails === null
  ? null
  : props.state.networkEntries.find((entry) => entry.requestId === props.networkDetails?.requestId) ?? null)

watch(() => props.state.url, (url) => {
  if (!addressFocused.value) address.value = url
}, { immediate: true })

watch(() => props.state.viewport, (viewport) => {
  viewportMode.value = viewport.mode
  if (viewport.width !== null) customWidth.value = viewport.width
  if (viewport.height !== null) customHeight.value = viewport.height
}, { immediate: true })

watch(() => props.capture, (capture) => {
  if (capture !== null) diagnosticsTab.value = 'capture'
}, { immediate: true })

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
  if (drafts.length > 0) diagnosticsTab.value = 'annotations'
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

function updateAnnotationFlag(
  draft: BrowserAnnotationDraft,
  field: 'includeSelector' | 'includeText' | 'includeScreenshot',
  event: Event
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  annotationEditors[draft.id] = { ...annotationEditor(draft), [field]: target.checked }
}

function submitAnnotation(draft: BrowserAnnotationDraft): void {
  emit('submitAnnotation', { ...annotationEditor(draft) })
}

function submitAddress(): void {
  const value = address.value.trim()
  if (value.length > 0 && !value.startsWith('preview://')) emit('navigate', value)
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
  emit('bounds', {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  })
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
    <header class="browser-toolbar">
      <button type="button" aria-label="后退" :disabled="!state.canGoBack" @click="emit('back')"><PhArrowLeft :size="16" /></button>
      <button type="button" aria-label="前进" :disabled="!state.canGoForward" @click="emit('forward')"><PhArrowRight :size="16" /></button>
      <button v-if="state.loading" type="button" aria-label="停止加载" @click="emit('stop')"><PhStop :size="15" /></button>
      <button v-else type="button" aria-label="刷新" :disabled="state.url.length === 0" @click="emit('reload')"><PhArrowClockwise :size="16" /></button>
      <form class="browser-address" @submit.prevent="submitAddress">
        <PhGlobe :size="14" />
        <input
          v-model="address"
          aria-label="浏览器地址"
          spellcheck="false"
          placeholder="localhost:5173 或 https://…"
          list="browser-local-servers"
          @focus="addressFocused = true"
          @blur="addressFocused = false"
        />
        <datalist id="browser-local-servers"><option v-for="server in localServers" :key="server" :value="server" /></datalist>
      </form>
      <button type="button" aria-label="在系统浏览器打开" :disabled="state.url.length === 0" @click="emit('openExternal')">
        <PhArrowSquareOut :size="16" />
      </button>
    </header>

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
      <button type="button" :disabled="state.url.length === 0 || pending" @click="emit('capturePage', false)"><PhCamera :size="15" />视口</button>
      <button type="button" :disabled="state.url.length === 0 || pending" @click="emit('capturePage', true)">整页</button>
      <button
        type="button"
        :disabled="state.url.length === 0 || annotationPicking"
        @click="emit('pickAnnotation', 'element')"
      >{{ annotationPicking ? '选择中…' : '批注元素' }}</button>
      <button
        type="button"
        :disabled="state.url.length === 0 || annotationPicking"
        @click="emit('pickAnnotation', 'region')"
      >框选区域</button>
      <button
        v-if="localServersPending || localServers.length > 0"
        type="button"
        :disabled="localServersPending || localServers.length === 0"
        aria-label="打开已发现的本地服务"
        @click="emit('navigate', localServers[0]!)"
      ><PhSpinnerGap v-if="localServersPending" class="spin" :size="14" /><template v-else>Local {{ localServers.length }}</template></button>
    </div>

    <div ref="surface" class="browser-surface">
      <div v-if="state.url.length === 0" class="browser-empty">
        <PhGlobe :size="34" weight="duotone" />
        <strong>打开 HTML 或 localhost</strong>
        <span>HTML 会通过 Workspace 隔离的本地预览服务加载，不使用 file://。</span>
      </div>
      <div v-if="state.loading" class="browser-loading"><PhSpinnerGap class="spin" :size="17" /></div>
    </div>

    <div v-if="visibleError" class="browser-error" role="alert"><PhWarningCircle :size="16" />{{ visibleError }}</div>

    <section class="browser-diagnostics">
      <header>
        <button :class="{ 'is-active': diagnosticsTab === 'console' }" type="button" @click="diagnosticsTab = 'console'">
          Console <span>{{ state.consoleEntries.length }}</span>
        </button>
        <button :class="{ 'is-active': diagnosticsTab === 'network' }" type="button" @click="diagnosticsTab = 'network'">
          Network <span>{{ state.networkEntries.length }}</span>
        </button>
        <button v-if="capture" :class="{ 'is-active': diagnosticsTab === 'capture' }" type="button" @click="diagnosticsTab = 'capture'">
          Screenshot
        </button>
        <button :class="{ 'is-active': diagnosticsTab === 'annotations' }" type="button" @click="diagnosticsTab = 'annotations'">
          Annotations <span>{{ annotationDrafts.length }}</span>
        </button>
        <button
          v-if="diagnosticsTab === 'console' || diagnosticsTab === 'network'"
          class="browser-clear"
          type="button"
          aria-label="清空当前诊断"
          @click="diagnosticsTab === 'console' ? emit('clearConsole') : emit('clearNetwork')"
        ><PhTrash :size="14" /></button>
      </header>
      <div v-if="diagnosticsTab === 'console'" class="browser-console">
        <div v-for="entry in state.consoleEntries" :key="entry.id" :class="`is-${entry.level}`">
          <span>{{ entry.level }}</span><code>{{ entry.text }}</code><small>{{ entry.source }}<template v-if="entry.line > 0">:{{ entry.line }}</template></small>
        </div>
        <p v-if="state.consoleEntries.length === 0">暂无 Console 输出</p>
      </div>
      <div v-else-if="diagnosticsTab === 'network'" class="browser-network">
        <button
          v-for="entry in state.networkEntries"
          :key="entry.id"
          type="button"
          :class="{ 'is-active': networkDetails?.requestId === entry.requestId, 'is-failed': entry.failed }"
          @click="emit('networkDetails', entry.requestId)"
        >
          <b>{{ entry.status ?? (entry.failed ? 'ERR' : '…') }}</b>
          <span>{{ entry.method }}</span>
          <code>{{ entry.url }}</code>
          <small>{{ entry.durationMs === null ? '' : `${entry.durationMs} ms` }}</small>
        </button>
        <p v-if="state.networkEntries.length === 0">暂无 Network 请求</p>
        <div v-if="networkDetailsPending" class="browser-detail-state"><PhSpinnerGap class="spin" :size="15" />读取安全预览…</div>
        <article v-else-if="networkDetails" class="browser-network-detail">
          <strong>{{ selectedRequest?.method }} {{ selectedRequest?.url }}</strong>
          <details><summary>Request Headers</summary><pre>{{ networkDetails.requestHeaders }}</pre></details>
          <details><summary>Response Headers</summary><pre>{{ networkDetails.responseHeaders }}</pre></details>
          <pre v-if="networkDetails.body !== null">{{ networkDetails.body }}</pre>
          <p v-else>{{ networkDetails.bodyUnavailableReason ?? '没有可预览的正文' }}</p>
        </article>
      </div>
      <div v-else-if="diagnosticsTab === 'annotations'" class="browser-annotations">
        <div v-if="annotationError" class="browser-detail-state is-error"><PhWarningCircle :size="15" />{{ annotationError }}</div>
        <article v-for="draft in annotationDrafts" :key="draft.id" class="browser-annotation-card">
          <header>
            <strong>{{ draft.annotation.target.kind === 'element' ? draft.annotation.target.tag || '元素' : '框选区域' }}</strong>
            <span>{{ Math.round(draft.annotation.target.rect.width) }} × {{ Math.round(draft.annotation.target.rect.height) }}</span>
          </header>
          <img
            v-if="annotationEditor(draft).includeScreenshot"
            :src="draft.screenshot.dataUrl"
            alt="批注区域截图"
          />
          <label>
            页面
            <input
              :value="annotationEditor(draft).pageUrl"
              aria-label="批注页面 URL"
              @input="updateAnnotationText(draft, 'pageUrl', $event)"
            />
          </label>
          <code v-if="annotationEditor(draft).includeSelector && draft.annotation.target.selector">{{ draft.annotation.target.selector }}</code>
          <p v-if="annotationEditor(draft).includeText && draft.annotation.target.textSnippet">{{ draft.annotation.target.textSnippet }}</p>
          <label>
            反馈
            <textarea
              :value="annotationEditor(draft).comment"
              rows="3"
              placeholder="告诉 Kimi 这里需要怎么调整…"
              @input="updateAnnotationText(draft, 'comment', $event)"
            />
          </label>
          <div class="browser-annotation-options">
            <label><input type="checkbox" :checked="annotationEditor(draft).includeScreenshot" @change="updateAnnotationFlag(draft, 'includeScreenshot', $event)" />截图</label>
            <label><input type="checkbox" :checked="annotationEditor(draft).includeSelector" @change="updateAnnotationFlag(draft, 'includeSelector', $event)" />定位信息</label>
            <label><input type="checkbox" :checked="annotationEditor(draft).includeText" @change="updateAnnotationFlag(draft, 'includeText', $event)" />页面文字</label>
          </div>
          <footer>
            <button type="button" @click="emit('deleteAnnotation', draft.id)">删除</button>
            <button
              class="is-primary"
              type="button"
              :disabled="annotationSubmitting || annotationEditor(draft).comment.trim().length === 0"
              @click="submitAnnotation(draft)"
            >{{ annotationSubmitting ? '发送中…' : '发送给 Kimi' }}</button>
          </footer>
        </article>
        <p v-if="annotationDrafts.length === 0">选择页面元素或框选区域后，批注草稿会显示在这里。</p>
      </div>
      <div v-else-if="capture" class="browser-capture-preview">
        <header><strong>{{ capture.fullPage ? '整页截图' : '视口截图' }}</strong><span>{{ capture.width }} × {{ capture.height }}</span></header>
        <img :src="capture.dataUrl" alt="浏览器截图预览" />
      </div>
    </section>
  </section>
</template>
