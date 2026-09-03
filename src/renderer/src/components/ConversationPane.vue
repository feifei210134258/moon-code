<script setup lang="ts">
import { PhArrowClockwise, PhArrowCounterClockwise, PhArrowSquareOut, PhCube, PhSpinnerGap, PhTrash } from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChatTurn, ProjectItem } from '../types'
import { rendererLocale } from '../i18n/rendererLocale'
import { useTurnHealth } from '../composables/useTurnHealth'
import type {
  ApprovalRequestView,
  BrowserPickedElement,
  KimiModelCatalogItem,
  KimiAgentTranscript,
  KimiBackgroundTask,
  KimiPromptQueueState,
  KimiTodoList,
  KimiSideChatView,
  KimiPromptControls,
  KimiPromptSkill,
  KimiSessionGoal,
  KimiSessionWarning,
  KimiSkill,
  KimiUploadedFile,
  QuestionAnswerInput,
  QuestionRequestView,
  SessionAgentView,
  SessionRetryStatus,
  SessionTranscriptMarker,
  WorkspaceFileSearchItem
} from '@shared/contracts'
import ApprovalCard from './ApprovalCard.vue'
import ActivityBlock from './ActivityBlock.vue'
import ComposerBar from './ComposerBar.vue'
import DraftProjectPicker from './DraftProjectPicker.vue'
import QuestionCard from './QuestionCard.vue'
import TerminalDrawer from './TerminalDrawer.vue'
import AgentRoster from './AgentRoster.vue'
import GoalStrip from './GoalStrip.vue'
import PromptQueueDock from './PromptQueueDock.vue'
import AttachmentBlock from './AttachmentBlock.vue'
import MediaBlock from './MediaBlock.vue'
import MarkdownBlock from './MarkdownBlock.vue'
import SessionWarnings from './SessionWarnings.vue'
import SideChatPanel from './SideChatPanel.vue'
import AgentDetailPanel from './AgentDetailPanel.vue'
import TurnChangesCard from './TurnChangesCard.vue'
import DotMatrixBrand from './DotMatrixBrand.vue'
import type { LocalPromptDraft } from '../utils/localPromptQueue'

const props = withDefaults(defineProps<{
  turns: ChatTurn[]
  steeredPromptIds?: ReadonlySet<string>
  phase: 'idle' | 'loading' | 'ready' | 'resyncing' | 'reconnecting' | 'error'
  error: string | null
  composerEnabled: boolean
  draftActive?: boolean
  draftWorkspaceId?: string
  projects?: ProjectItem[]
  promptPending: boolean
  promptError: string | null
  promptRunning: boolean
  sessionId: string
  terminalEnabled: boolean
  terminalOpen: boolean
  pendingApprovals: ApprovalRequestView[]
  pendingQuestions: QuestionRequestView[]
  interactionPendingKey: string | null
  interactionError: string | null
  agents: SessionAgentView[]
  todos?: KimiTodoList[]
  tasks?: KimiBackgroundTask[]
  tasksPending?: boolean
  tasksError?: string | null
  skills: KimiSkill[]
  skillsPending: boolean
  skillsError: string | null
  skillActivationPending: boolean
  skillActivationError: string | null
  models: KimiModelCatalogItem[]
  promptControls: KimiPromptControls | null
  controlsPending: boolean
  controlsError: string | null
  goal: KimiSessionGoal | null
  promptQueue: KimiPromptQueueState | null
  operationalActionPending: string | null
  operationalError: string | null
  goalMode: boolean
  localPromptQueue: LocalPromptDraft[]
  warnings: KimiSessionWarning[]
  warningsError: string | null
  markers: SessionTranscriptMarker[]
  conversationActionPending: 'compact' | 'undo' | null
  conversationActionError: string | null
  recallableTurnId?: string | null
  sideChat?: KimiSideChatView | null
  sideChatPending?: boolean
  sideChatError?: string | null
  agentDetail?: SessionAgentView | null
  agentTranscript?: KimiAgentTranscript | null
  agentTranscriptPending?: boolean
  agentTranscriptError?: string | null
  lastTurnReason?: 'completed' | 'cancelled' | 'failed' | null
  lastTurnError?: string | null
  retry?: SessionRetryStatus | null
  mentionSearch?: (query: string) => Promise<WorkspaceFileSearchItem[]>
}>(), {
  draftActive: false,
  draftWorkspaceId: '',
  projects: () => [],
  todos: () => [],
  tasks: () => [],
  tasksPending: false,
  tasksError: null,
  sideChat: null,
  sideChatPending: false,
  sideChatError: null,
  agentDetail: null,
  agentTranscript: null,
  agentTranscriptPending: false,
  agentTranscriptError: null,
  recallableTurnId: null,
  lastTurnReason: null,
  lastTurnError: null,
  retry: null
})

const emit = defineEmits<{
  submit: [
    text: string,
    attachments: KimiUploadedFile[],
    controls: KimiPromptControls,
    goalMode: boolean,
    deliveryMode: 'queue' | 'steer',
    webElements: BrowserPickedElement[],
    skills: KimiPromptSkill[]
  ]
  abort: []
  selectDraftWorkspace: [workspaceId: string]
  openDraftWorkspaceFolder: []
  respondApproval: [approvalId: string, response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session'; feedback?: string; selectedLabel?: string }]
  respondQuestion: [questionId: string, answers: Record<string, QuestionAnswerInput>]
  dismissQuestion: [questionId: string]
  openFile: [path: string]
  openLink: [url: string]
  openLinkExternal: [url: string]
  openSystem: [path: string]
  trashEntry: [path: string]
  closeTerminal: []
  updatePromptControls: [controls: KimiPromptControls]
  controlGoal: [control: 'pause' | 'resume' | 'cancel']
  steerPrompt: [promptId: string]
  abortPrompt: [promptId: string]
  updateGoalMode: [enabled: boolean]
  editLocalPrompt: [draftId: string]
  removeLocalPrompt: [draftId: string]
  moveLocalPrompt: [draftId: string, direction: -1 | 1]
  sendSideChat: [agentId: string, text: string]
  closeSideChat: [agentId: string]
  openAgent: [agent: SessionAgentView]
  closeAgent: []
  cancelAgentTask: [taskId: string]
  openPlan: [plan: import('@shared/contracts').PlanReview]
  undo: []
  retryFailedTurn: [text: string]
}>()

/* 底部状态面板分段：计划 / Agents / 任务。胶囊即切换器——点击已打开的胶囊关闭面板；
   null 表示面板关闭。agents 段由胶囊直开名册，点「追踪」后在同一面板内切换到转录视图。 */
type DetailSegment = 'agents' | 'todos' | 'tasks'
const detailSegment = ref<DetailSegment | null>(null)

/* 条带胶囊的激活段命名（plan）与面板段命名（todos）对齐。 */
const stripActiveSegment = computed(() => (detailSegment.value === 'todos' ? 'plan' : detailSegment.value))

function onStripSelect(segment: 'plan' | 'agents' | 'tasks'): void {
  const next = segment === 'plan' ? 'todos' : segment
  if (detailSegment.value === next) closeDetail()
  else detailSegment.value = next
}

function closeDetail(): void {
  detailSegment.value = null
  emit('closeAgent')
}

/* 失败 Turn 常驻卡片与自动重试 loading 指示：全部判定逻辑在 composable 里，
   组件只负责把 store 已 hydrate 的字段喂进去并渲染结果。 */
const {
  failedTurn,
  failedReason,
  canResume,
  resumeText,
  retryActive,
  retryLabel,
  retryError
} = useTurnHealth({
  turns: props.turns,
  phase: props.phase,
  lastTurnReason: props.lastTurnReason,
  lastTurnError: props.lastTurnError,
  retry: props.retry,
  /* 主 turn 正在执行/等待操作时隐藏失败卡片。 */
  sessionBusy: props.promptRunning,
  draftActive: props.draftActive
})

const transcriptScroll = ref<HTMLElement | null>(null)
const interactionDock = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const composer = ref<InstanceType<typeof ComposerBar> | null>(null)
const contextFilePath = ref<string | null>(null)
const contextMenuPosition = ref({ top: '0px', left: '0px' })
const tocItems = computed(() => props.turns.flatMap((turn) => {
  if (turn.role !== 'user') return []
  const text = turn.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  const content = text.length > 0 ? text : '附件消息'
  return [{
    id: turn.id,
    title: compactTocTitle(content),
    preview: compactTocLabel(content),
    time: turn.time
  }]
}))

/* 会话中工具真正写入/编辑过的文件路径：正文里命中这些路径保持亮蓝，
   其余只是被文字提及的路径降为弱色（is-mention）。 */
const artifactPaths = computed<ReadonlySet<string>>(() => {
  const paths = new Set<string>()
  for (const turn of props.turns) {
    for (const block of turn.blocks) {
      if (block.type !== 'activity' || block.activity.status !== 'done') continue
      const path = block.activity.writtenPath?.trim().replace(/^\.\//, '')
      if (path !== undefined && path.length > 0) paths.add(path)
    }
  }
  return paths
})

/* steer 发出的消息先落队再被立即引导，转录里与排队消息同为 pending；
   用 promptId 命中 steer 记录时显示「已引导」。 */
function isSteeredTurn(turn: ChatTurn): boolean {
  return turn.promptId != null && props.steeredPromptIds?.has(turn.promptId) === true
}

/* Codex 式左侧刻度轨：每个 user 回合一枚紧凑刻度，
   横向长度反映回合高度，当前视口所在回合高亮。 */
interface TocMeasurement {
  railTop: number
  railHeight: number
  scrollHeight: number
  ticks: {
    id: string
    title: string
    preview: string
    time: string
    contentTop: number
    turnHeight: number
  }[]
}
const tocMeasure = ref<TocMeasurement>({ railTop: 0, railHeight: 0, scrollHeight: 0, ticks: [] })
const transcriptScrollTop = ref(0)
let railObserver: ResizeObserver | null = null

const tocRailLayout = computed(() => ({ top: tocMeasure.value.railTop, height: tocMeasure.value.railHeight }))
const tocTicks = computed(() => {
  const { railHeight, scrollHeight, ticks } = tocMeasure.value
  if (railHeight < 1 || scrollHeight < 1) return []
  const activeId = activeTocId.value
  /* 刻度命中区高 8px：回合太多轨道放不下时按间隔抽稀，避免相邻刻度
     命中区互相重叠导致 hover/点击串位；当前所在回合的刻度始终保留。 */
  const maxTicks = Math.max(2, Math.floor((railHeight - 12) / 9))
  let visible = ticks
  if (ticks.length > maxTicks) {
    const stride = Math.ceil(ticks.length / maxTicks)
    visible = ticks.filter((tick, index) => index % stride === 0 || tick.id === activeId)
  }
  const availableHeight = Math.max(0, railHeight - 24)
  const step = visible.length <= 1 ? 0 : Math.min(14, availableHeight / (visible.length - 1))
  return visible.map((tick, index) => ({
    ...tick,
    // 目录是一组紧凑导航，不应按全文高度把相邻回合拉到视口两端。
    // 刻度等长，仅当前回合的刻度由 CSS 加长为最长条。
    top: Math.min(railHeight - 8, 10 + index * step),
    length: 8,
    active: tick.id === activeId
  }))
})
const activeTocId = computed(() => {
  const { ticks } = tocMeasure.value
  if (ticks.length === 0) return null
  const threshold = transcriptScrollTop.value + 56
  let active = ticks[0]!.id
  for (const tick of ticks) {
    if (tick.contentTop <= threshold) active = tick.id
    else break
  }
  return active
})

function measureTocRail(): void {
  const element = transcriptScroll.value
  if (element === null) return
  const railStart = Math.round(element.clientHeight / 3)
  const railHeight = Math.max(0, element.clientHeight - railStart)
  const scrollHeight = element.scrollHeight
  const containerTop = element.getBoundingClientRect().top
  const ticks = tocItems.value.flatMap((item) => {
    const node = document.getElementById(turnDomId(item.id))
    if (node === null) return []
    const rect = node.getBoundingClientRect()
    return [{
      id: item.id,
      title: item.title,
      preview: item.preview,
      time: item.time,
      contentTop: rect.top - containerTop + element.scrollTop,
      turnHeight: rect.height
    }]
  })
  tocMeasure.value = { railTop: element.offsetTop + railStart, railHeight, scrollHeight, ticks }
}

function onTranscriptScroll(): void {
  const element = transcriptScroll.value
  if (element === null) return
  transcriptScrollTop.value = element.scrollTop
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  const element = transcriptScroll.value
  if (element !== null) element.scrollTop = element.scrollHeight
}

async function focusFromPet(target: 'interaction' | 'unread' | 'latest'): Promise<void> {
  await nextTick()
  if (target === 'interaction' && interactionDock.value !== null) {
    interactionDock.value.scrollIntoView({ block: 'nearest' })
    interactionDock.value.querySelector<HTMLElement>('button:not(:disabled), [tabindex="0"]')?.focus()
    return
  }
  await scrollToBottom()
  transcriptScroll.value?.focus({ preventScroll: true })
}

async function loadPromptDraft(text: string, attachments: KimiUploadedFile[] = []): Promise<void> {
  await composer.value?.loadDraft(text, attachments)
}

function insertFileMention(path: string): void {
  composer.value?.insertFileMention(path)
}

function attachFiles(files: KimiUploadedFile[]): void {
  composer.value?.addAttachments(files)
}

function addWebElements(elements: BrowserPickedElement[]): void {
  composer.value?.addWebElements(elements)
}

function scrollToTurn(turnId: string): void {
  document.getElementById(turnDomId(turnId))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function turnDomId(turnId: string): string {
  return `conversation-turn-${encodeURIComponent(turnId)}`
}

function compactTocLabel(text: string): string {
  return text.length > 110 ? `${text.slice(0, 107)}…` : text
}

function compactTocTitle(text: string): string {
  const sentence = text.split(/[\n。！？!?]/, 1)[0]?.trim() ?? text
  return sentence.length > 34 ? `${sentence.slice(0, 31)}…` : sentence
}

function markerLabel(marker: SessionTranscriptMarker): string {
  return /compact|history/i.test(marker.marker) ? '上下文已压缩' : marker.marker
}

function compactTokenSummary(marker: SessionTranscriptMarker): string | null {
  if (!/compact|history/i.test(marker.marker) || marker.payload === null || typeof marker.payload !== 'object') return null
  const payload = marker.payload as Record<string, unknown>
  const result = payload.result !== null && typeof payload.result === 'object'
    ? payload.result as Record<string, unknown>
    : payload
  const before = result.tokensBefore
  const after = result.tokensAfter
  if (
    typeof before !== 'number' || !Number.isFinite(before) || before < 0 ||
    typeof after !== 'number' || !Number.isFinite(after) || after < 0
  ) return null
  return `${formatTokenCount(before)} → ${formatTokenCount(after)} tokens`
}

function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(rendererLocale(), { maximumFractionDigits: 0 }).format(value)
}

function openOutputFileContextMenu(path: string, event: MouseEvent): void {
  const menuWidth = 160
  const menuHeight = 76
  const top = Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  const left = Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))
  contextMenuPosition.value = { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` }
  contextFilePath.value = path
}

function closeOutputFileContextMenu(): void {
  contextFilePath.value = null
}

function openOutputFileInSystem(): void {
  const path = contextFilePath.value
  closeOutputFileContextMenu()
  if (path !== null) emit('openSystem', path)
}

function trashOutputFile(): void {
  const path = contextFilePath.value
  closeOutputFileContextMenu()
  if (path === null) return
  const filePath = path.replace(/:\d+(?::\d+)?$/, '')
  const name = filePath.split('/').filter(Boolean).at(-1) ?? filePath
  if (window.confirm(`将文件“${name}”移到废纸篓？`)) emit('trashEntry', path)
}

function closeOutputMenuOnOutsideClick(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest('.output-file-context-menu')) closeOutputFileContextMenu()
}

function closeOutputMenuOnEscape(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || contextFilePath.value === null) return
  event.preventDefault()
  closeOutputFileContextMenu()
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    railObserver = new ResizeObserver(() => measureTocRail())
    if (transcriptScroll.value !== null) railObserver.observe(transcriptScroll.value)
  }
  window.addEventListener('resize', measureTocRail)
  document.addEventListener('click', closeOutputMenuOnOutsideClick)
  window.addEventListener('keydown', closeOutputMenuOnEscape)
  void nextTick(measureTocRail)
})
onBeforeUnmount(() => {
  railObserver?.disconnect()
  window.removeEventListener('resize', measureTocRail)
  document.removeEventListener('click', closeOutputMenuOnOutsideClick)
  window.removeEventListener('keydown', closeOutputMenuOnEscape)
})

defineExpose({ focusFromPet, loadPromptDraft, insertFileMention, attachFiles, addWebElements })

watch(
  () => props.phase,
  (phase, previous) => {
    if (phase === 'loading') stickToBottom.value = true
    if (phase === 'ready' && previous !== 'ready') void scrollToBottom()
  }
)

watch(
  () => {
    const last = props.turns.at(-1)
    const lastBlock = last?.blocks.at(-1)
    const blockLength = lastBlock?.type === 'text'
      ? lastBlock.text.length
      : lastBlock?.type === 'activity'
        ? (lastBlock.activity.detail?.length ?? 0) +
          (lastBlock.activity.outputPreview?.length ?? 0) +
          (lastBlock.activity.progress ?? 0)
        : lastBlock?.type === 'file'
          ? lastBlock.name.length
          : lastBlock?.type === 'attachment'
            ? lastBlock.name.length
            : lastBlock?.type === 'media'
              ? lastBlock.fileId?.length ?? 0
          : 0
    return [
      props.turns.length,
      last?.id ?? '',
      last?.blocks.length ?? 0,
      blockLength
    ].join(':')
  },
  () => {
    if (stickToBottom.value) void scrollToBottom()
    void nextTick(measureTocRail)
  }
)

</script>

<template>
  <section class="conversation-pane">
    <div class="conversation-header-stack">
      <div v-if="conversationActionError" class="conversation-action-error" role="alert">{{ conversationActionError }}</div>
      <GoalStrip
        v-if="goal"
        :goal="goal"
        :pending-key="operationalActionPending"
        @control="emit('controlGoal', $event)"
      />
      <SessionWarnings :warnings="warnings" :error="warningsError" />
    </div>
    <div ref="transcriptScroll" class="transcript-scroll" tabindex="-1" @scroll="onTranscriptScroll">
      <div v-if="markers.length > 0" class="transcript-marker-list" aria-label="Kimi 会话标记">
        <div v-for="marker in markers" :key="marker.markerId" class="transcript-marker">
          <span>{{ markerLabel(marker) }}</span>
          <small v-if="compactTokenSummary(marker)">{{ compactTokenSummary(marker) }}</small>
          <time v-if="marker.at">{{ marker.at }}</time>
        </div>
      </div>
      <div v-if="turns.length === 0" class="transcript-empty">
        <template v-if="phase === 'ready' && !error">
          <DotMatrixBrand />
          <strong class="transcript-brand-title">Moon Code</strong>
          <span>这个会话还没有消息，从下方输入框开始一个新任务。</span>
        </template>
        <template v-else>
          <strong v-if="phase === 'loading'">正在读取 Kimi 会话…</strong>
          <strong v-else-if="phase === 'resyncing' || phase === 'reconnecting'">正在恢复实时会话…</strong>
          <strong v-else-if="phase === 'error'">会话读取失败</strong>
          <strong v-else>这个会话还没有消息</strong>
          <span v-if="error">{{ error }}</span>
        </template>
      </div>
      <article :id="turnDomId(turn.id)" v-for="turn in turns" :key="turn.id" class="turn" :class="`is-${turn.role}`">
        <div class="turn-body">
          <!-- 新版 Kimi web 端：无头像，助手回合头只留 muted 小字时间戳。 -->
          <header class="turn-header">
            <strong v-if="turn.role === 'user'">{{ turn.author }}</strong>
            <span>{{ turn.time }}</span>
            <span v-if="turn.queued" class="queued-chip">{{ isSteeredTurn(turn) ? '已引导' : '已排队' }}</span>
            <span
              v-if="turn.role === 'user' && (turn.skillNames?.length ?? 0) > 0"
              class="turn-skill-pill"
              :aria-label="'使用了 ' + turn.skillNames!.join('、')"
              :title="'使用了 ' + turn.skillNames!.join('、')"
            >
              <PhCube :size="11" />
              <span>使用了</span>
              <span class="turn-skill-names">{{ turn.skillNames!.join('、') }}</span>
            </span>
          </header>
          <div class="turn-content">
            <div
              v-if="turn.role === 'assistant' && turn.pending === true && turn.blocks.length === 0"
              class="turn-pending-response"
              role="status"
              aria-live="polite"
            >
              <span class="turn-pending-dots" aria-hidden="true"><i /><i /><i /></span>
              <span v-if="retryActive">{{ retryLabel }}</span>
              <span v-else>Kimi 已接收任务，正在生成回复…</span>
              <span v-if="retryActive && retryError" class="turn-pending-retry-error">{{ retryError }}</span>
            </div>
            <template v-for="block in turn.blocks" :key="block.id">
              <MarkdownBlock
                v-if="block.type === 'text'"
                :text="block.text"
                :session-id="sessionId"
                :artifact-paths="artifactPaths"
                @open-file="emit('openFile', $event)"
                @file-context="openOutputFileContextMenu"
                @open-link="emit('openLink', $event)"
                @open-link-external="emit('openLinkExternal', $event)"
              />
              <ActivityBlock
                v-else-if="block.type === 'activity'"
                :activity="block.activity"
                @open-plan="emit('openPlan', $event)"
              />
              <button
                v-else-if="block.type === 'file'"
                class="linked-file"
                type="button"
                @click="emit('openFile', block.name)"
                @contextmenu.prevent.stop="openOutputFileContextMenu(block.name, $event)"
              >{{ block.name }}</button>
              <AttachmentBlock
                v-else-if="block.type === 'attachment'"
                :file-id="block.fileId"
                :name="block.name"
                :media-type="block.mediaType"
                :size="block.size"
              />
              <MediaBlock
                v-else
                :media-type="block.mediaType"
                :session-id="sessionId"
                :file-id="block.fileId"
                :source-media-type="block.sourceMediaType"
                :base64-data="block.base64Data"
              />
            </template>
          </div>
          <TurnChangesCard
          v-if="turn.role === 'assistant' && turn.writtenFiles !== undefined"
          :files="turn.writtenFiles"
          @open-file="emit('openFile', $event)"
        />
        <div v-if="turn.role === 'user' && turn.id === recallableTurnId" class="turn-recall-action">
            <button
              type="button"
              aria-label="撤回最后一条消息并放回输入框"
              :disabled="conversationActionPending !== null"
              @click="emit('undo')"
            >
              <PhSpinnerGap v-if="conversationActionPending === 'undo'" class="spin" :size="13" />
              <PhArrowCounterClockwise v-else :size="13" />
              {{ conversationActionPending === 'undo' ? '正在撤回…' : '撤回并编辑' }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="tocTicks.length > 0"
      class="toc-rail"
      :style="{ top: `${tocRailLayout.top}px`, height: `${tocRailLayout.height}px` }"
      aria-label="会话目录"
    >
      <button
        v-for="tick in tocTicks"
        :key="tick.id"
        type="button"
        class="toc-tick"
        :class="{ 'is-active': tick.active }"
        :style="{ top: `${tick.top}px`, width: `${tick.length}px` }"
        :aria-label="`跳转到：${tick.title}`"
        @click="scrollToTurn(tick.id)"
      >
        <span class="toc-preview-card" role="tooltip">
          <strong>{{ tick.title }}</strong>
          <span>{{ tick.preview }}</span>
          <small><i aria-hidden="true" />用户消息<span v-if="tick.time">· {{ tick.time }}</span></small>
        </span>
      </button>
    </div>

    <div class="status-dock">
      <AgentRoster
        :agents="agents"
        :todos="todos"
        :tasks="tasks"
        :active-segment="stripActiveSegment"
        @select="onStripSelect"
      />

    <SideChatPanel
      :side-chat="sideChat"
      :pending="sideChatPending"
      :error="sideChatError"
      @send="(agentId, text) => emit('sendSideChat', agentId, text)"
      @close="emit('closeSideChat', $event)"
    />

    <AgentDetailPanel
      v-if="detailSegment !== null"
      :segment="detailSegment ?? 'agents'"
      :agents="agents"
      :agent="agentDetail"
      :transcript="agentTranscript"
      :pending="agentTranscriptPending"
      :error="agentTranscriptError"
      :todos="todos"
      :tasks="tasks"
      :tasks-pending="tasksPending"
      :tasks-error="tasksError"
      @open-agent="emit('openAgent', $event)"
      @clear-agent="emit('closeAgent')"
      @cancel-task="emit('cancelAgentTask', $event)"
      @close="closeDetail"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="contextFilePath"
        class="tree-menu tree-menu-overlay file-context-menu output-file-context-menu"
        :style="contextMenuPosition"
        @click.stop
      >
        <button type="button" @click="openOutputFileInSystem">
          <PhArrowSquareOut :size="14" />系统打开
        </button>
        <button class="is-danger" type="button" @click="trashOutputFile">
          <PhTrash :size="14" />删除
        </button>
      </div>
    </Teleport>

    <TerminalDrawer
      :session-id="sessionId"
      :enabled="terminalEnabled"
      :open="terminalOpen"
      @close="emit('closeTerminal')"
    />

    <div v-if="failedTurn" class="turn-failed-card" role="alert">
      <span class="turn-failed-icon" aria-hidden="true">!</span>
      <div class="turn-failed-body">
        <strong>任务执行失败</strong>
        <span v-if="failedReason" class="turn-failed-reason">失败原因：<span class="turn-failed-detail">{{ failedReason }}</span></span>
      </div>
      <button
        class="turn-failed-resume"
        type="button"
        :disabled="!canResume || promptPending || promptControls === null"
        :aria-label="canResume ? '重新运行最近一次任务' : '最近一次消息无法重新发送'"
        @click="emit('retryFailedTurn', resumeText)"
      >
        <PhSpinnerGap v-if="promptPending" class="spin" :size="14" />
        <PhArrowClockwise v-else :size="14" />
        {{ promptPending ? '正在重新运行…' : '重新运行' }}
      </button>
    </div>

    <div class="composer-stack">
      <PromptQueueDock
        v-if="(promptQueue?.queued.length ?? 0) > 0 || localPromptQueue.length > 0"
        :queue="promptQueue"
        :local-queue="localPromptQueue"
        :pending-key="operationalActionPending"
        @steer="emit('steerPrompt', $event)"
        @abort="emit('abortPrompt', $event)"
        @edit-local="emit('editLocalPrompt', $event)"
        @remove-local="emit('removeLocalPrompt', $event)"
        @move-local="(draftId, direction) => emit('moveLocalPrompt', draftId, direction)"
      />
      <div
        v-if="pendingApprovals.length > 0 || pendingQuestions.length > 0"
        ref="interactionDock"
        class="interaction-dock"
        aria-label="Kimi 等待你的操作"
      >
        <ApprovalCard
          v-for="approval in pendingApprovals"
          :key="approval.approvalId"
          :approval="approval"
          :pending="interactionPendingKey === `approval:${approval.approvalId}`"
          :disabled="interactionPendingKey !== null && interactionPendingKey !== `approval:${approval.approvalId}`"
          @respond="emit('respondApproval', approval.approvalId, $event)"
        />
        <QuestionCard
          v-for="question in pendingQuestions"
          :key="question.questionId"
          :request="question"
          :pending="interactionPendingKey?.startsWith(`question:${question.questionId}:`) === true"
          :disabled="interactionPendingKey !== null && interactionPendingKey?.startsWith(`question:${question.questionId}:`) !== true"
          @answer="emit('respondQuestion', question.questionId, $event)"
          @dismiss="emit('dismissQuestion', question.questionId)"
        />
      </div>
      <div v-if="interactionError" class="composer-error interaction-error" role="alert">{{ interactionError }}</div>
      <div v-if="promptError" class="composer-error">{{ promptError }}</div>
      <div v-if="skillsError" class="composer-error">{{ skillsError }}</div>
      <div v-if="skillActivationError" class="composer-error">{{ skillActivationError }}</div>
      <div v-if="controlsError" class="composer-error">{{ controlsError }}</div>
      <div v-if="operationalError" class="composer-error">{{ operationalError }}</div>
      <DraftProjectPicker
        v-if="draftActive"
        :projects="projects"
        :workspace-id="draftWorkspaceId"
        @select="emit('selectDraftWorkspace', $event)"
        @open-folder="emit('openDraftWorkspaceFolder')"
      />
      <ComposerBar
        ref="composer"
        :disabled="!composerEnabled || promptControls === null"
        :pending="promptPending"
        :running="promptRunning"
        :skills="skills"
        :skills-pending="skillsPending"
        :activation-pending="skillActivationPending"
        :models="models"
        :controls="promptControls"
        :controls-pending="controlsPending"
        :goal-mode="goalMode"
        :mention-search="mentionSearch"
        :disabled-reason="controlsPending ? '正在读取 Kimi 会话控制…' : '连接 Kimi 并选择一个会话后即可输入'"
        @submit="(text, attachments, controls, goalMode, deliveryMode, webElements, skills) => emit('submit', text, attachments, controls, goalMode, deliveryMode, webElements, skills)"
        @abort="emit('abort')"
        @update-controls="emit('updatePromptControls', $event)"
        @update-goal-mode="emit('updateGoalMode', $event)"
      />
    </div>
  </section>
</template>
