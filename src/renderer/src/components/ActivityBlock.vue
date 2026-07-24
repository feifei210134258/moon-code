<script setup lang="ts">
import {
  PhCaretDown,
  PhInfo,
  PhLightbulb,
  PhTerminalWindow
} from '@phosphor-icons/vue'
import { computed, ref, watch } from 'vue'
import type { ChatActivity } from '../types'

const props = defineProps<{ activity: ChatActivity }>()
const expanded = ref(props.activity.status === 'error')
const hasDetails = computed(() =>
  (props.activity.detail?.length ?? 0) > 0 ||
  (props.activity.inputPreview?.length ?? 0) > 0 ||
  (props.activity.outputPreview?.length ?? 0) > 0 ||
  props.activity.toolDiff !== undefined
)
const statusLabel = computed(() =>
  props.activity.status === 'running' ? '运行中' : props.activity.status === 'error' ? '失败' : '完成'
)

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
      <PhLightbulb v-if="activity.kind === 'thinking'" :size="18" />
      <PhTerminalWindow v-else-if="activity.kind === 'tool'" :size="18" class="blue" />
      <PhInfo v-else :size="18" />
      <strong>{{ activity.label }}</strong>
      <span>{{ activity.description }}</span>
      <span class="activity-meta" :class="`is-${activity.status}`">{{ statusLabel }}</span>
      <PhCaretDown v-if="hasDetails" class="activity-caret" :size="14" />
      <span v-else />
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
  </div>
</template>
