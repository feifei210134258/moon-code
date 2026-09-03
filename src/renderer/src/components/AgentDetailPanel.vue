<script setup lang="ts">
import {
  PhCaretLeft,
  PhCheckCircle,
  PhCirclesThreePlus,
  PhListMagnifyingGlass,
  PhSpinnerGap,
  PhTerminalWindow,
  PhWarningCircle,
  PhClipboardText,
  PhX
} from '@phosphor-icons/vue'
import { computed } from 'vue'
import type {
  KimiAgentTranscript,
  KimiBackgroundTask,
  KimiTodoList,
  SessionAgentUsage,
  SessionAgentView,
  SessionTranscriptMessage
} from '@shared/contracts'
import { rendererLocale } from '../i18n/rendererLocale'
import { flattenAgentTree } from '../utils/agentTree'

/** 底部状态面板：在胶囊条带正上方向上展开，内容由胶囊切换（无 tab）。
    agents 段两级：名册（树形）→ 点「追踪」进入该子 Agent 的转录视图。 */
const props = withDefaults(defineProps<{
  segment: 'agents' | 'todos' | 'tasks'
  agents: SessionAgentView[]
  agent: SessionAgentView | null
  transcript: KimiAgentTranscript | null
  pending: boolean
  error: string | null
  todos?: KimiTodoList[]
  tasks?: KimiBackgroundTask[]
  tasksPending?: boolean
  tasksError?: string | null
}>(), {
  todos: () => [],
  tasks: () => [],
  tasksPending: false,
  tasksError: null
})

const emit = defineEmits<{
  close: []
  openAgent: [agent: SessionAgentView]
  clearAgent: []
  cancelTask: [taskId: string]
}>()

const subagentCount = computed(() => props.agents.filter((agent) => agent.role === 'subagent').length)
const treeRows = computed(() => flattenAgentTree(props.agents))
const activeTodo = computed(() => props.todos.at(-1) ?? null)
const todoItems = computed(() => activeTodo.value?.items ?? [])
const completedTodos = computed(() => todoItems.value.filter((item) => item.status === 'done').length)

function todoStatusLabel(status: 'pending' | 'in_progress' | 'done'): string {
  return status === 'in_progress' ? '进行中' : status === 'done' ? '完成' : '待办'
}

function taskStatusLabel(status: KimiBackgroundTask['status']): string {
  return status === 'running' ? '运行中' : status === 'completed' ? '已完成' : status === 'failed' ? '失败' : '已取消'
}

function agentStatusLabel(status: SessionAgentView['status']): string {
  return {
    idle: '空闲', queued: '排队中', working: '工作中', suspended: '已挂起',
    completed: '已完成', failed: '失败', cancelled: '已取消'
  }[status]
}

function usageLabel(agent: SessionAgentView): string | null {
  const usage = agent.usage
  if (usage === null) return null
  const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheCreationTokens
  return total > 0 ? `${total.toLocaleString(rendererLocale())} tokens` : null
}

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

function usageDetails(agent: SessionAgentView, transcript: KimiAgentTranscript | null): string[] {
  const usage = effectiveUsage(agent, transcript)
  if (usage === null) return []
  const cache = usage.cacheReadTokens + usage.cacheCreationTokens
  return [
    `输入 ${usage.inputTokens.toLocaleString(rendererLocale())}`,
    `输出 ${usage.outputTokens.toLocaleString(rendererLocale())}`,
    ...(cache > 0 ? [`缓存 ${cache.toLocaleString(rendererLocale())}`] : []),
    ...(usage.contextTokens === null ? [] : [`Context ${usage.contextTokens.toLocaleString(rendererLocale())}`])
  ]
}
</script>

<template>
  <aside class="agent-detail-panel" aria-label="会话状态面板">
    <header>
      <button
        v-if="segment === 'agents' && agent !== null"
        class="agent-detail-back"
        type="button"
        @click="emit('clearAgent')"
      ><PhCaretLeft :size="14" />返回名册</button>
      <span v-if="segment === 'agents'" class="agent-detail-title">
        <PhCirclesThreePlus :size="16" />
        <template v-if="agent !== null">{{ agent.name }} · {{ agentStatusLabel(agent.status) }}</template>
        <template v-else>Agents · {{ subagentCount }} 个</template>
      </span>
      <span v-else-if="segment === 'todos'" class="agent-detail-title">
        <PhClipboardText :size="16" />计划 {{ completedTodos }}/{{ todoItems.length }}
      </span>
      <span v-else class="agent-detail-title">
        <PhTerminalWindow :size="16" />任务 {{ tasks.length }} 个
      </span>
      <button type="button" class="agent-detail-close" aria-label="关闭" @click="emit('close')"><PhX :size="16" /></button>
    </header>

    <template v-if="segment === 'agents' && agent === null">
      <div class="agent-detail-roster">
        <p v-if="subagentCount === 0" class="agent-detail-state">当前没有子 Agent。</p>
        <article
          v-for="row in treeRows"
          v-else
          :key="row.agent.id"
          class="agent-row"
          :class="{ 'is-nested': row.depth > 0 }"
          :data-depth="row.depth"
          :style="{ '--agent-depth': row.depth }"
        >
          <header>
            <span class="agent-state" :class="`is-${row.agent.status}`" />
            <strong>{{ row.agent.name }}</strong>
            <span class="agent-status-label">{{ agentStatusLabel(row.agent.status) }}</span>
          </header>
          <p>{{ row.agent.description }}</p>
          <footer>
            <span v-if="row.agent.towerMode === true" class="agent-tower-badge">Tower 协调者</span>
            <span v-if="row.agent.subagentType">{{ row.agent.subagentType }}</span>
            <span v-if="row.agent.swarmIndex !== null">#{{ row.agent.swarmIndex + 1 }}</span>
            <span v-if="row.agent.model">{{ row.agent.model }}<template v-if="row.agent.thinkingEffort"> · {{ row.agent.thinkingEffort }}</template></span>
            <span v-if="usageLabel(row.agent)">{{ usageLabel(row.agent) }}</span>
            <span v-if="row.agent.suspendedReason">{{ row.agent.suspendedReason }}</span>
            <button
              type="button"
              class="agent-track-button"
              :aria-label="`追踪 ${row.agent.name}`"
              @click="emit('openAgent', row.agent)"
            >
              <PhListMagnifyingGlass :size="12" />
              追踪
            </button>
          </footer>
        </article>
      </div>
    </template>

    <template v-else-if="segment === 'agents' && agent !== null">
      <div class="agent-detail-meta">
        <span v-if="agent.subagentType">{{ agent.subagentType }}</span>
        <span v-if="agent.swarmIndex !== null">Swarm #{{ agent.swarmIndex + 1 }}</span>
        <span v-if="agent.model">{{ agent.model }}<template v-if="agent.thinkingEffort"> · {{ agent.thinkingEffort }}</template></span>
        <span v-if="usageLabel(agent)">{{ usageLabel(agent) }}</span>
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
    </template>

    <div v-else-if="segment === 'todos'" class="agent-detail-todos">
      <p v-if="todoItems.length === 0" class="agent-detail-state">Kimi 生成计划后会在这里实时显示。</p>
      <ol v-else aria-label="Kimi Todo 计划">
        <li v-for="(todo, index) in todoItems" :key="`${activeTodo?.todoId}:${index}:${todo.title}`" :class="`is-${todo.status}`">
          <PhCheckCircle v-if="todo.status === 'done'" class="todo-check" :size="14" weight="bold" aria-hidden="true" />
          <span v-else class="todo-status-dot" aria-hidden="true" />
          <span>{{ todo.title }}</span>
          <em v-if="todo.status !== 'done'">{{ todoStatusLabel(todo.status) }}</em>
        </li>
      </ol>
    </div>

    <div v-else class="agent-detail-tasks">
      <div v-if="tasksPending && tasks.length === 0" class="agent-detail-state"><PhSpinnerGap class="spin" :size="16" />正在读取后台任务…</div>
      <p v-else-if="tasksError" class="agent-detail-state is-error"><PhWarningCircle :size="15" />{{ tasksError }}</p>
      <p v-else-if="tasks.length === 0" class="agent-detail-state">当前 Session 没有后台任务。</p>
      <article v-for="task in tasks" :key="task.id" class="detail-task-row" :class="`is-${task.status}`">
        <span class="task-status-dot" aria-hidden="true" />
        <div>
          <header><strong>{{ task.description || task.kind }}</strong><em>{{ taskStatusLabel(task.status) }}</em></header>
          <code v-if="task.command">{{ task.command }}</code>
          <p v-if="task.outputPreview">{{ task.outputPreview }}</p>
        </div>
        <button
          v-if="task.status === 'running'"
          type="button"
          :aria-label="`取消后台任务 ${task.description || task.kind}`"
          @click="emit('cancelTask', task.id)"
        >取消</button>
      </article>
    </div>
  </aside>
</template>
