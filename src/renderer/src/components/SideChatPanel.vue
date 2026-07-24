<script setup lang="ts">
import { PhArrowUp, PhChatCircleText, PhSpinnerGap, PhX } from '@phosphor-icons/vue'
import { computed, nextTick, ref, watch } from 'vue'
import type { KimiSideChatView } from '@shared/contracts'

const props = defineProps<{
  sideChat: KimiSideChatView | null
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  send: [agentId: string, text: string]
  close: [agentId: string]
}>()

const draft = ref('')
const messages = ref<HTMLElement | null>(null)
const canSend = computed(() => props.sideChat !== null && draft.value.trim().length > 0 && !props.pending)

function messageText(message: KimiSideChatView['messages'][number]): string {
  return message.content.map((part) => {
    if (part.type === 'text' || part.type === 'thinking') return part.text
    if (part.type === 'tool') return part.outputPreview ?? part.description ?? part.toolName
    if (part.type === 'file') return part.name
    if (part.type === 'media') return part.sourceMediaType ?? part.mediaType
    return `[${part.rawType}]`
  }).join('\n').trim()
}

function submit(): void {
  const text = draft.value.trim()
  if (props.sideChat === null || text.length === 0 || props.pending) return
  draft.value = ''
  emit('send', props.sideChat.agentId, text)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    submit()
  }
}

watch(
  () => {
    const last = props.sideChat?.messages.at(-1)
    return `${props.sideChat?.messages.length ?? 0}:${last?.id ?? ''}:${last === undefined ? 0 : messageText(last).length}`
  },
  async () => {
    await nextTick()
    if (messages.value !== null) messages.value.scrollTop = messages.value.scrollHeight
  }
)
</script>

<template>
  <aside v-if="sideChat" class="side-chat-panel glass-panel" aria-label="Kimi BTW Side Chat">
    <header>
      <span><PhChatCircleText :size="17" />BTW Side Chat</span>
      <span class="side-chat-status">
        <PhSpinnerGap v-if="sideChat.active || pending" class="spin" :size="13" />
        {{ sideChat.active ? 'Agent 正在回复' : '独立对话' }}
      </span>
      <button type="button" aria-label="关闭 Side Chat" @click="emit('close', sideChat.agentId)"><PhX :size="16" /></button>
    </header>
    <div ref="messages" class="side-chat-messages">
      <article v-for="message in sideChat.messages" :key="message.id" :class="`is-${message.role}`">
        <strong>{{ message.role === 'user' ? '你' : 'Kimi' }}</strong>
        <p>{{ messageText(message) || (message.status === 'pending' ? '正在生成…' : '（无可显示内容）') }}</p>
      </article>
      <p v-if="sideChat.messages.length === 0" class="side-chat-empty">向这个独立 Agent 补充问题，不会写入主对话。</p>
    </div>
    <form class="side-chat-composer" @submit.prevent="submit">
      <textarea v-model="draft" rows="3" maxlength="200000" placeholder="向 BTW Agent 继续追问…" @keydown="onKeydown" />
      <footer>
        <span>⌘↵ 发送</span>
        <button type="submit" :disabled="!canSend" aria-label="发送 Side Chat"><PhArrowUp :size="15" /></button>
      </footer>
    </form>
    <p v-if="error || sideChat.error" class="side-chat-error" role="alert">{{ error ?? sideChat.error }}</p>
  </aside>
</template>
