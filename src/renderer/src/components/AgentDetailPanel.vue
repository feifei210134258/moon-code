<script setup lang="ts">
import { PhCirclesThreePlus, PhSpinnerGap, PhX } from '@phosphor-icons/vue'
import type { KimiAgentTranscript, SessionAgentUsage, SessionAgentView, SessionTranscriptMessage } from '@shared/contracts'

defineProps<{
  agent: SessionAgentView | null
  transcript: KimiAgentTranscript | null
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{ close: [] }>()

function messageText(message: SessionTranscriptMessage): string {
  return message.content.map((part) => {
    if (part.type === 'text' || part.type === 'thinking') return part.text
    if (part.type === 'tool') return part.outputPreview ?? part.description ?? part.toolName
    if (part.type === 'file') return part.name
    if (part.type === 'media') return part.sourceMediaType ?? part.mediaType
    return `[${part.rawType}]`
  }).join('\n').trim()
}

function effectiveUsage(agent: SessionAgentView, transcript: KimiAgentTranscript | null): SessionAgentUsage | null {
  return agent.usage ?? transcript?.usage ?? null
}

function usageLabel(agent: SessionAgentView, transcript: KimiAgentTranscript | null): string | null {
  const usage = effectiveUsage(agent, transcript)
  if (usage === null) return null
  const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens
  return total > 0 ? `${total.toLocaleString()} tokens` : null
}

function usageDetails(agent: SessionAgentView, transcript: KimiAgentTranscript | null): string[] {
  const usage = effectiveUsage(agent, transcript)
  if (usage === null) return []
  const cache = usage.cacheReadTokens + usage.cacheCreationTokens
  return [
    `输入 ${usage.inputTokens.toLocaleString()}`,
    `输出 ${usage.outputTokens.toLocaleString()}`,
    ...(cache > 0 ? [`缓存 ${cache.toLocaleString()}`] : []),
    ...(usage.contextTokens === null ? [] : [`Context ${usage.contextTokens.toLocaleString()}`])
  ]
}

function statusLabel(status: SessionAgentView['status']): string {
  return {
    idle: '空闲', queued: '排队中', working: '执行中', suspended: '已暂停',
    completed: '已完成', failed: '失败', cancelled: '已取消'
  }[status]
}
</script>

<template>
  <aside v-if="agent" class="agent-detail-panel glass-panel" aria-label="Kimi Agent 详情">
    <header>
      <span><PhCirclesThreePlus :size="17" />{{ agent.name }}</span>
      <small>{{ statusLabel(agent.status) }}</small>
      <button type="button" aria-label="关闭 Agent 详情" @click="emit('close')"><PhX :size="16" /></button>
    </header>
    <div class="agent-detail-meta">
      <span v-if="agent.subagentType">{{ agent.subagentType }}</span>
      <span v-if="agent.swarmIndex !== null">Swarm #{{ agent.swarmIndex + 1 }}</span>
      <span v-if="usageLabel(agent, transcript)">{{ usageLabel(agent, transcript) }}</span>
      <span v-for="detail in usageDetails(agent, transcript)" :key="detail">{{ detail }}</span>
      <span v-if="agent.suspendedReason">{{ agent.suspendedReason }}</span>
    </div>
    <div class="agent-detail-messages">
      <div v-if="pending" class="agent-detail-state"><PhSpinnerGap class="spin" :size="16" />正在读取 Agent 独立输出…</div>
      <p v-else-if="error" class="agent-detail-state is-error">{{ error }}</p>
      <template v-else-if="transcript">
        <article v-for="message in transcript.messages" :key="message.id" :class="`is-${message.role}`">
          <strong>{{ message.role === 'user' ? '任务' : 'Agent' }}</strong>
          <p>{{ messageText(message) || '（无可显示内容）' }}</p>
        </article>
        <p v-if="transcript.messages.length === 0" class="agent-detail-state">该 Agent 尚未产生可显示的独立输出。</p>
        <p v-if="transcript.hasMore" class="agent-detail-state">仅显示 Kimi Server 当前返回的最近 100 个 Turn。</p>
      </template>
      <p v-else class="agent-detail-state">选择 Agent 后读取其独立 Transcript。</p>
    </div>
  </aside>
</template>
