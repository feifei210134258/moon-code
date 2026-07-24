<script setup lang="ts">
import {
  PhArrowBendUpLeft,
  PhArrowDown,
  PhArrowUp,
  PhPencilSimple,
  PhStopCircle,
  PhX
} from '@phosphor-icons/vue'
import { computed } from 'vue'
import type { KimiPromptQueueState } from '@shared/contracts'
import type { LocalPromptDraft } from '../utils/localPromptQueue'

const props = defineProps<{
  queue: KimiPromptQueueState | null
  localQueue: LocalPromptDraft[]
  pendingKey: string | null
}>()

const emit = defineEmits<{
  steer: [promptId: string]
  abort: [promptId: string]
  editLocal: [draftId: string]
  removeLocal: [draftId: string]
  moveLocal: [draftId: string, direction: -1 | 1]
}>()

const waitingCount = computed(() => (props.queue?.queued.length ?? 0) + props.localQueue.length)
</script>

<template>
  <section v-if="queue?.active != null || waitingCount > 0" class="prompt-queue-dock" aria-label="Kimi Prompt 队列">
    <header>
      <strong>Prompt Queue</strong>
      <span>{{ waitingCount }} waiting</span>
    </header>
    <div v-if="queue?.active" class="prompt-queue-row is-active">
      <span class="prompt-state-dot" />
      <p>{{ queue.active.textPreview || '当前 Prompt' }}</p>
      <em>Running</em>
      <button
        type="button"
        aria-label="停止当前 Prompt"
        :disabled="pendingKey !== null"
        @click="emit('abort', queue.active.promptId)"
      ><PhStopCircle :size="15" /></button>
    </div>
    <div v-for="(draft, index) in localQueue" :key="draft.id" class="prompt-queue-row is-local">
      <span class="queue-index">{{ index + 1 }}</span>
      <p>{{ draft.input.text || draft.input.attachments?.map((file) => file.name).join('、') || '附件 Prompt' }}</p>
      <em>Draft</em>
      <button type="button" aria-label="编辑待发送 Prompt" @click="emit('editLocal', draft.id)"><PhPencilSimple :size="14" /></button>
      <button
        type="button"
        aria-label="上移待发送 Prompt"
        :disabled="index === 0"
        @click="emit('moveLocal', draft.id, -1)"
      ><PhArrowUp :size="14" /></button>
      <button
        type="button"
        aria-label="下移待发送 Prompt"
        :disabled="index === localQueue.length - 1"
        @click="emit('moveLocal', draft.id, 1)"
      ><PhArrowDown :size="14" /></button>
      <button type="button" aria-label="移除待发送 Prompt" @click="emit('removeLocal', draft.id)"><PhX :size="14" /></button>
    </div>
    <div v-for="(prompt, index) in queue?.queued ?? []" :key="prompt.promptId" class="prompt-queue-row is-server-queued">
      <span class="queue-index">{{ localQueue.length + index + 1 }}</span>
      <p>{{ prompt.textPreview || '排队 Prompt' }}</p>
      <em>Kimi</em>
      <button
        type="button"
        aria-label="将 Prompt 插入当前任务"
        title="Steer into current turn"
        :disabled="pendingKey !== null || queue?.active == null"
        @click="emit('steer', prompt.promptId)"
      ><PhArrowBendUpLeft :size="15" /></button>
      <button
        type="button"
        aria-label="移出 Prompt 队列"
        :disabled="pendingKey !== null"
        @click="emit('abort', prompt.promptId)"
      ><PhStopCircle :size="15" /></button>
    </div>
  </section>
</template>
