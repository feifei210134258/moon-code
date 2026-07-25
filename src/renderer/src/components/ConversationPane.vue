<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ChatTurn } from '../types'
import { rendererLocale } from '../i18n/rendererLocale'
import type {
  ApprovalRequestView,
  KimiModelCatalogItem,
  KimiAgentTranscript,
  KimiPromptQueueState,
  KimiSideChatView,
  KimiPromptControls,
  KimiSessionGoal,
  KimiSessionWarning,
  KimiSkill,
  KimiUploadedFile,
  QuestionAnswerInput,
  QuestionRequestView,
  SessionAgentView,
  SessionTranscriptMarker,
  WorkspaceFileSearchItem
} from '@shared/contracts'
import ApprovalCard from './ApprovalCard.vue'
import ActivityBlock from './ActivityBlock.vue'
import ComposerBar from './ComposerBar.vue'
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
import type { LocalPromptDraft } from '../utils/localPromptQueue'

const props = withDefaults(defineProps<{
  turns: ChatTurn[]
  phase: 'idle' | 'loading' | 'ready' | 'resyncing' | 'reconnecting' | 'error'
  error: string | null
  composerEnabled: boolean
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
  sideChat?: KimiSideChatView | null
  sideChatPending?: boolean
  sideChatError?: string | null
  agentDetail?: SessionAgentView | null
  agentTranscript?: KimiAgentTranscript | null
  agentTranscriptPending?: boolean
  agentTranscriptError?: string | null
  mentionSearch?: (query: string) => Promise<WorkspaceFileSearchItem[]>
}>(), {
  sideChat: null,
  sideChatPending: false,
  sideChatError: null,
  agentDetail: null,
  agentTranscript: null,
  agentTranscriptPending: false,
  agentTranscriptError: null
})

const emit = defineEmits<{
  submit: [text: string, attachments: KimiUploadedFile[], controls: KimiPromptControls, goalMode: boolean]
  abort: []
  respondApproval: [approvalId: string, response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session' }]
  respondQuestion: [questionId: string, answers: Record<string, QuestionAnswerInput>]
  dismissQuestion: [questionId: string]
  openFile: [path: string]
  closeTerminal: []
  toggleTerminal: []
  activateSkill: [skillName: string, args?: string]
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
}>()

const transcriptScroll = ref<HTMLElement | null>(null)
const interactionDock = ref<HTMLElement | null>(null)
const stickToBottom = ref(true)
const composer = ref<InstanceType<typeof ComposerBar> | null>(null)
const tocItems = computed(() => props.turns.flatMap((turn) => {
  if (turn.role !== 'user') return []
  const text = turn.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [{ id: turn.id, label: text.length > 0 ? compactTocLabel(text) : '附件消息', time: turn.time }]
}))

/* Codex 式左侧刻度轨：每个 user 回合一枚刻度，纵向位置 ∝ 回合在全文中的位置，
   横向长度 ∝ 回合高度；当前视口所在回合高亮。 */
interface TocMeasurement {
  railTop: number
  railHeight: number
  scrollHeight: number
  ticks: { id: string; label: string; contentTop: number; turnHeight: number }[]
}
const tocMeasure = ref<TocMeasurement>({ railTop: 0, railHeight: 0, scrollHeight: 0, ticks: [] })
const transcriptScrollTop = ref(0)
let railObserver: ResizeObserver | null = null

const tocRailLayout = computed(() => ({ top: tocMeasure.value.railTop, height: tocMeasure.value.railHeight }))
const tocTicks = computed(() => {
  const { railHeight, scrollHeight, ticks } = tocMeasure.value
  if (railHeight < 1 || scrollHeight < 1) return []
  const activeId = activeTocId.value
  return ticks.map((tick) => ({
    id: tick.id,
    label: tick.label,
    top: Math.max(0, Math.min(railHeight - 6, (tick.contentTop / scrollHeight) * railHeight)),
    length: Math.max(6, Math.min(15, (tick.turnHeight / scrollHeight) * railHeight * 2.4)),
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
  const railHeight = element.clientHeight
  const scrollHeight = element.scrollHeight
  const containerTop = element.getBoundingClientRect().top
  const ticks = tocItems.value.flatMap((item) => {
    const node = document.getElementById(turnDomId(item.id))
    if (node === null) return []
    const rect = node.getBoundingClientRect()
    return [{
      id: item.id,
      label: item.label,
      contentTop: rect.top - containerTop + element.scrollTop,
      turnHeight: rect.height
    }]
  })
  tocMeasure.value = { railTop: element.offsetTop, railHeight, scrollHeight, ticks }
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

function scrollToTurn(turnId: string): void {
  document.getElementById(turnDomId(turnId))?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

function turnDomId(turnId: string): string {
  return `conversation-turn-${encodeURIComponent(turnId)}`
}

function compactTocLabel(text: string): string {
  return text.length > 72 ? `${text.slice(0, 69)}…` : text
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

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    railObserver = new ResizeObserver(() => measureTocRail())
    if (transcriptScroll.value !== null) railObserver.observe(transcriptScroll.value)
  }
  window.addEventListener('resize', measureTocRail)
  void nextTick(measureTocRail)
})
onBeforeUnmount(() => {
  railObserver?.disconnect()
  window.removeEventListener('resize', measureTocRail)
})

defineExpose({ focusFromPet, loadPromptDraft })

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
        <strong v-if="phase === 'loading'">正在读取 Kimi 会话…</strong>
        <strong v-else-if="phase === 'resyncing' || phase === 'reconnecting'">正在恢复实时会话…</strong>
        <strong v-else-if="phase === 'error'">会话读取失败</strong>
        <strong v-else>这个会话还没有消息</strong>
        <span v-if="error">{{ error }}</span>
        <span v-else-if="phase === 'ready'">从下方输入框开始一个新任务。</span>
      </div>
      <article :id="turnDomId(turn.id)" v-for="turn in turns" :key="turn.id" class="turn" :class="`is-${turn.role}`">
        <div class="turn-avatar" :class="`is-${turn.role}`">{{ turn.role === 'assistant' ? 'K' : 'U' }}</div>
        <div class="turn-body">
          <header class="turn-header">
            <strong>{{ turn.author }}</strong>
            <span>{{ turn.time }}</span>
            <span v-if="turn.queued" class="queued-chip">已排队</span>
          </header>
          <div class="turn-content">
            <template v-for="block in turn.blocks" :key="block.id">
              <MarkdownBlock
                v-if="block.type === 'text'"
                :text="block.text"
                :session-id="sessionId"
                @open-file="emit('openFile', $event)"
              />
              <ActivityBlock v-else-if="block.type === 'activity'" :activity="block.activity" />
              <button v-else-if="block.type === 'file'" class="linked-file" type="button" @click="emit('openFile', block.name)">{{ block.name }}</button>
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
                :file-id="block.fileId"
                :source-media-type="block.sourceMediaType"
                :base64-data="block.base64Data"
              />
            </template>
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
        :style="{ top: `${tick.top - 4}px`, width: `${tick.length}px` }"
        :title="tick.label"
        :aria-label="`跳转到：${tick.label}`"
        @click="scrollToTurn(tick.id)"
      />
    </div>

    <AgentRoster :agents="agents" @open="emit('openAgent', $event)" />

    <SideChatPanel
      :side-chat="sideChat"
      :pending="sideChatPending"
      :error="sideChatError"
      @send="(agentId, text) => emit('sendSideChat', agentId, text)"
      @close="emit('closeSideChat', $event)"
    />

    <AgentDetailPanel
      :agent="agentDetail"
      :transcript="agentTranscript"
      :pending="agentTranscriptPending"
      :error="agentTranscriptError"
      @close="emit('closeAgent')"
    />

    <TerminalDrawer
      :session-id="sessionId"
      :enabled="terminalEnabled"
      :open="terminalOpen"
      @close="emit('closeTerminal')"
    />

    <div class="composer-stack">
      <PromptQueueDock
        v-if="promptQueue !== null || localPromptQueue.length > 0"
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
        @submit="(text, attachments, controls, goalMode) => emit('submit', text, attachments, controls, goalMode)"
        @abort="emit('abort')"
        @toggle-terminal="emit('toggleTerminal')"
        @activate-skill="(skillName, args) => emit('activateSkill', skillName, args)"
        @update-controls="emit('updatePromptControls', $event)"
        @update-goal-mode="emit('updateGoalMode', $event)"
      />
    </div>
  </section>
</template>
