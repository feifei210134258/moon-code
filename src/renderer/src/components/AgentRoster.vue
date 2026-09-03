<script setup lang="ts">
import { PhCirclesThreePlus, PhClipboardText, PhTerminalWindow } from '@phosphor-icons/vue'
import { computed } from 'vue'
import type { KimiBackgroundTask, KimiTodoList, SessionAgentView } from '@shared/contracts'

/** 底部会话状态条带：计划 / Agents / 任务 三个独立毛玻璃芯片。
    芯片即面板切换器——打开中的面板对应芯片为激活态；名册等内容渲染在向上展开的面板里。 */
const props = withDefaults(defineProps<{
  agents: SessionAgentView[]
  todos?: KimiTodoList[]
  tasks?: KimiBackgroundTask[]
  activeSegment?: 'plan' | 'agents' | 'tasks' | null
}>(), {
  todos: () => [],
  tasks: () => [],
  activeSegment: null
})

const emit = defineEmits<{ select: [segment: 'plan' | 'agents' | 'tasks'] }>()

const subagentCount = computed(() => props.agents.filter((agent) => agent.role === 'subagent').length)
const activeCount = computed(() => props.agents.filter((agent) =>
  agent.role === 'subagent' &&
  (agent.status === 'queued' || agent.status === 'working' || agent.status === 'suspended')
).length)

/* 计划胶囊：最近一份 todo 清单；无清单或清单为空时整个胶囊隐藏。 */
const activeTodo = computed(() => props.todos.at(-1) ?? null)
const todoDone = computed(() => activeTodo.value?.items.filter((item) => item.status === 'done').length ?? 0)
const todoTotal = computed(() => activeTodo.value?.items.length ?? 0)
const todoProgress = computed(() => todoTotal.value === 0 ? 0 : Math.round((todoDone.value / todoTotal.value) * 100))

/* 任务胶囊：后台任务总数 + 运行中计数（运行中带呼吸点）；无任务时隐藏。 */
const runningTaskCount = computed(() => props.tasks.filter((task) => task.status === 'running').length)
const hasAnyContent = computed(() => todoTotal.value > 0 || subagentCount.value > 0 || props.tasks.length > 0)
</script>

<template>
  <section v-if="hasAnyContent" class="roster-strip" aria-label="会话状态">
    <button
      v-if="todoTotal > 0"
      class="roster-pill"
      :class="{ 'is-active': activeSegment === 'plan' }"
      type="button"
      :title="`计划进度：${todoDone}/${todoTotal}`"
      @click="emit('select', 'plan')"
    >
      <PhClipboardText :size="15" />
      <span class="roster-pill-label">计划</span>
      <strong>{{ todoDone }}/{{ todoTotal }}</strong>
      <span class="roster-pill-progress" aria-hidden="true"><i :style="{ width: `${todoProgress}%` }" /></span>
    </button>
    <button
      v-if="subagentCount > 0"
      class="roster-pill"
      :class="{ 'is-active': activeSegment === 'agents' }"
      type="button"
      @click="emit('select', 'agents')"
    >
      <PhCirclesThreePlus :size="16" />
      <strong>Agents</strong>
      <span>{{ subagentCount }} 个<template v-if="activeCount > 0"> · {{ activeCount }} 个进行中</template></span>
    </button>
    <button
      v-if="tasks.length > 0"
      class="roster-pill"
      :class="{ 'is-active': activeSegment === 'tasks' }"
      type="button"
      title="查看后台任务"
      @click="emit('select', 'tasks')"
    >
      <PhTerminalWindow :size="15" />
      <span class="roster-pill-label">任务</span>
      <strong>{{ tasks.length }}</strong>
      <span v-if="runningTaskCount > 0" class="roster-pill-sub">
        <i class="roster-pill-dot" aria-hidden="true" />{{ runningTaskCount }} 运行中
      </span>
    </button>
  </section>
</template>
