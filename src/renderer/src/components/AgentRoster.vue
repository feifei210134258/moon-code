<script setup lang="ts">
import { PhCaretDown, PhCaretRight, PhCirclesThreePlus, PhListMagnifyingGlass } from '@phosphor-icons/vue'
import { computed, ref } from 'vue'
import type { SessionAgentView } from '@shared/contracts'
import { rendererLocale } from '../i18n/rendererLocale'

const props = defineProps<{ agents: SessionAgentView[] }>()
const emit = defineEmits<{ open: [agent: SessionAgentView] }>()
const expanded = ref(false)

// 子 Agent 树：parentAgentId 能在 roster 中命中时归到对应父节点下形成层级，
// 其余（parentAgentId 缺失、为 null 或指向主 Agent，如快照恢复的 task）作为顶层挂主 Agent 下。
interface AgentTreeNode {
  agent: SessionAgentView
  children: AgentTreeNode[]
}

interface AgentTreeRow {
  agent: SessionAgentView
  depth: number
}

function sortSiblings(nodes: AgentTreeNode[]): void {
  nodes.sort((left, right) =>
    (left.agent.swarmIndex ?? Number.MAX_SAFE_INTEGER) - (right.agent.swarmIndex ?? Number.MAX_SAFE_INTEGER)
  )
}

function buildAgentTree(agents: SessionAgentView[]): AgentTreeNode[] {
  const subagents = agents.filter((agent) => agent.role === 'subagent')
  const nodes = new Map(subagents.map((agent) => [agent.id, { agent, children: [] } as AgentTreeNode]))
  const roots: AgentTreeNode[] = []
  for (const agent of subagents) {
    const node = nodes.get(agent.id)!
    const parentId = agent.parentAgentId !== null && agent.parentAgentId !== agent.id && nodes.has(agent.parentAgentId)
      ? agent.parentAgentId
      : null
    if (parentId === null) roots.push(node)
    else nodes.get(parentId)!.children.push(node)
  }
  sortSiblings(roots)
  for (const node of nodes.values()) sortSiblings(node.children)
  return roots
}

const treeRows = computed<AgentTreeRow[]>(() => {
  // 前序遍历压平：父节点始终先于子节点渲染；visited 兜底防 parentAgentId 成环。
  const rows: AgentTreeRow[] = []
  const visited = new Set<string>()
  const walk = (nodes: AgentTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const id = node.agent.id
      if (visited.has(id)) continue
      visited.add(id)
      rows.push({ agent: node.agent, depth })
      walk(node.children, depth + 1)
    }
  }
  walk(buildAgentTree(props.agents), 0)
  return rows
})

const subagentCount = computed(() => props.agents.filter((agent) => agent.role === 'subagent').length)
const activeCount = computed(() => props.agents.filter((agent) =>
  agent.role === 'subagent' &&
  (agent.status === 'queued' || agent.status === 'working' || agent.status === 'suspended')
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
  <section v-if="subagentCount > 0" class="agent-roster" aria-label="Agent roster">
    <button
      class="agent-roster-summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <component :is="expanded ? PhCaretDown : PhCaretRight" :size="13" />
      <PhCirclesThreePlus :size="16" />
      <strong>Agents</strong>
      <span>{{ subagentCount }} 个<template v-if="activeCount > 0"> · {{ activeCount }} 个进行中</template></span>
    </button>
    <div v-if="expanded" class="agent-roster-list">
      <article
        v-for="row in treeRows"
        :key="row.agent.id"
        class="agent-row"
        :class="{ 'is-nested': row.depth > 0 }"
        :data-depth="row.depth"
        :style="{ '--agent-depth': row.depth }"
      >
        <header>
          <span class="agent-state" :class="`is-${row.agent.status}`" />
          <strong>{{ row.agent.name }}</strong>
          <span class="agent-status-label">{{ statusLabel(row.agent.status) }}</span>
        </header>
        <p>{{ row.agent.description }}</p>
        <footer>
          <span v-if="row.agent.subagentType">{{ row.agent.subagentType }}</span>
          <span v-if="row.agent.swarmIndex !== null">#{{ row.agent.swarmIndex + 1 }}</span>
          <span v-if="row.agent.model">{{ row.agent.model }}<template v-if="row.agent.thinkingEffort"> · {{ row.agent.thinkingEffort }}</template></span>
          <span v-if="usageLabel(row.agent)">{{ usageLabel(row.agent) }}</span>
          <span v-if="row.agent.suspendedReason">{{ row.agent.suspendedReason }}</span>
          <button
            type="button"
            class="agent-track-button"
            :aria-label="`追踪 ${row.agent.name}`"
            @click.stop="emit('open', row.agent)"
          >
            <PhListMagnifyingGlass :size="12" />
            追踪
          </button>
        </footer>
      </article>
    </div>
  </section>
</template>
