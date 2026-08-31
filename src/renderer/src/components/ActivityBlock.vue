<script setup lang="ts">
import {
  PhCaretDown,
  PhCheck,
  PhInfo,
  PhLightbulb,
  PhSparkle,
  PhTerminalWindow
} from '@phosphor-icons/vue'
import { computed, ref, watch } from 'vue'
import type { ChatActivity } from '../types'

const props = defineProps<{ activity: ChatActivity }>()
const emit = defineEmits<{
  'open-plan': [plan: import('@shared/contracts').PlanReview]
}>()
const expanded = ref(props.activity.status === 'error')
const hasDetails = computed(() =>
  (props.activity.detail?.length ?? 0) > 0 ||
  (props.activity.inputPreview?.length ?? 0) > 0 ||
  (props.activity.outputPreview?.length ?? 0) > 0 ||
  props.activity.toolDiff !== undefined
)
/* 状态不再以右侧文字呈现：思考完成不显示任何状态（随后会有工具/正文接上），
   工具完成改为句前 ✓；仅 running / error 保留紧跟句子的内联小字。 */
const statusLabel = computed(() =>
  props.activity.status === 'running' ? '运行中' : props.activity.status === 'error' ? '失败' : ''
)
const showDoneCheck = computed(() =>
  props.activity.kind === 'tool' && props.activity.status === 'done'
)
const isSkillActivity = computed(() => {
  if (props.activity.kind !== 'tool') return false
  return /skill|技能/i.test(props.activity.label.trim())
})

watch(
  () => props.activity.status,
  (status) => {
    if (status === 'error') expanded.value = true
  }
)

function toggle(): void {
  if (hasDetails.value) expanded.value = !expanded.value
}
</script>

<template>
  <div class="activity-block" :class="[`is-${activity.status}`, { 'is-expanded': expanded }]">
    <button
      class="activity-row"
      type="button"
      :aria-expanded="hasDetails ? expanded : undefined"
      :disabled="!hasDetails"
      @click="toggle"
    >
      <span class="activity-icon" aria-hidden="true">
        <PhCheck v-if="showDoneCheck" class="activity-check" :size="14" />
        <PhLightbulb v-else-if="activity.kind === 'thinking'" :size="16" />
        <PhSparkle v-else-if="isSkillActivity" :size="16" />
        <PhTerminalWindow v-else-if="activity.kind === 'tool'" :size="16" />
        <PhInfo v-else :size="16" />
      </span>
      <strong>{{ activity.label }}</strong>
      <span class="activity-desc">{{ activity.description }}</span>
      <span v-if="statusLabel" class="activity-meta" :class="`is-${activity.status}`">{{ statusLabel }}</span>
      <PhCaretDown v-if="hasDetails" class="activity-caret" :size="13" />
    </button>

    <div
      v-if="activity.status === 'running' && activity.progress !== undefined"
      class="activity-progress"
      role="progressbar"
      aria-label="工具执行进度"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="activity.progress"
    >
      <span :style="{ width: `${activity.progress}%` }" />
    </div>

    <div v-if="expanded && hasDetails" class="activity-details">
      <div v-if="activity.detail" class="thinking-detail">{{ activity.detail }}</div>
      <section v-if="activity.inputPreview" class="activity-detail-section">
        <header>输入</header>
        <pre>{{ activity.inputPreview }}</pre>
      </section>
      <section v-if="activity.outputPreview" class="activity-detail-section">
        <header>
          输出
          <span v-if="activity.outputStream">{{ activity.outputStream === 'mixed' ? 'stdout + stderr' : activity.outputStream }}</span>
        </header>
        <pre :class="{ 'is-stderr': activity.outputStream === 'stderr' }">{{ activity.outputPreview }}</pre>
      </section>
      <section v-if="activity.toolDiff" class="tool-diff-panel" :aria-label="`工具 Diff：${activity.toolDiff.path}`">
        <header>
          <span>工具 Diff</span>
          <code>{{ activity.toolDiff.path }}</code>
          <small v-if="activity.toolDiff.hunks !== null">{{ activity.toolDiff.hunks }} hunks</small>
        </header>
        <div class="tool-diff-columns">
          <section><h4>变更前</h4><pre>{{ activity.toolDiff.before }}</pre></section>
          <section><h4>变更后</h4><pre>{{ activity.toolDiff.after }}</pre></section>
        </div>
      </section>
    </div>

    <button
      v-if="activity.plan"
      class="activity-plan-open"
      type="button"
      aria-label="查看计划"
      @click="emit('open-plan', activity.plan!)"
    >查看计划</button>
  </div>
</template>
