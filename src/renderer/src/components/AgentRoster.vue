<script setup lang="ts">
import { PhCaretDown, PhCaretRight, PhCirclesThreePlus, PhListMagnifyingGlass } from '@phosphor-icons/vue'
import { computed, ref } from 'vue'
import type { SessionAgentView } from '@shared/contracts'
import { rendererLocale } from '../i18n/rendererLocale'

const props = defineProps<{ agents: SessionAgentView[] }>()
const emit = defineEmits<{ open: [agent: SessionAgentView] }>()
const expanded = ref(false)

const subagents = computed(() => props.agents.filter((agent) => agent.role === 'subagent'))
const activeCount = computed(() => subagents.value.filter((agent) =>
  agent.status === 'queued' || agent.status === 'working' || agent.status === 'suspended'
).length)

function statusLabel(status: SessionAgentView['status']): string {
  if (status === 'queued') return '排队中'
  if (status === 'working') return '工作中'
  if (status === 'suspended') return '已挂起'
  if (status === 'completed') return '已完成'
  if (status === 'failed') return '失败'
  if (status === 'cancelled') return '已取消'
  return '空闲'
}

function usageLabel(agent: SessionAgentView): string | null {
  if (agent.usage === null) return null
  const total = agent.usage.inputTokens
    + agent.usage.outputTokens
    + agent.usage.cacheReadTokens
    + agent.usage.cacheCreationTokens
  return total > 0 ? `${total.toLocaleString(rendererLocale())} tokens` : null
}
</script>

<template>
  <section v-if="subagents.length > 0" class="agent-roster" aria-label="Agent roster">
    <button
      class="agent-roster-summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <component :is="expanded ? PhCaretDown : PhCaretRight" :size="13" />
      <PhCirclesThreePlus :size="16" />
      <strong>Agents</strong>
      <span>{{ subagents.length }} 个<template v-if="activeCount > 0"> · {{ activeCount }} 个进行中</template></span>
    </button>
    <div v-if="expanded" class="agent-roster-list">
      <article
        v-for="agent in subagents"
        :key="agent.id"
        class="agent-row"
      >
        <span class="agent-state" :class="`is-${agent.status}`" />
        <div>
          <header>
            <strong>{{ agent.name }}</strong>
            <span>{{ statusLabel(agent.status) }}</span>
            <button
              type="button"
              class="agent-track-button"
              :aria-label="`追踪 ${agent.name}`"
              @click.stop="emit('open', agent)"
            >
              <PhListMagnifyingGlass :size="12" />
              追踪
            </button>
          </header>
          <p>{{ agent.description }}</p>
          <footer>
            <span v-if="agent.subagentType">{{ agent.subagentType }}</span>
            <span v-if="agent.swarmIndex !== null">#{{ agent.swarmIndex + 1 }}</span>
            <span v-if="usageLabel(agent)">{{ usageLabel(agent) }}</span>
            <span v-if="agent.suspendedReason">{{ agent.suspendedReason }}</span>
          </footer>
        </div>
      </article>
    </div>
  </section>
</template>
