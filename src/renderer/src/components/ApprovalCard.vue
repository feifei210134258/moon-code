<script setup lang="ts">
import { PhShieldWarning, PhSpinnerGap } from '@phosphor-icons/vue'
import type { ApprovalRequestView } from '@shared/contracts'

defineProps<{
  approval: ApprovalRequestView
  pending: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  respond: [response: { decision: 'approved' | 'rejected' | 'cancelled'; scope?: 'session' }]
}>()
</script>

<template>
  <article class="interaction-card approval-card" aria-label="Kimi 请求授权">
    <header class="interaction-card-header">
      <span class="interaction-icon is-warning"><PhShieldWarning :size="18" weight="fill" /></span>
      <div class="interaction-heading">
        <strong>需要你的授权</strong>
        <span>{{ approval.toolName }}</span>
      </div>
      <span class="interaction-status">等待确认</span>
    </header>

    <div class="interaction-body">
      <p class="interaction-prompt">{{ approval.action || 'Kimi 请求执行此操作' }}</p>
      <pre v-if="approval.display" class="approval-preview">{{ approval.display }}</pre>
    </div>

    <footer class="interaction-actions">
      <span v-if="pending" class="interaction-busy" role="status">
        <PhSpinnerGap :size="15" class="spin" />正在提交…
      </span>
      <button
        class="interaction-button is-quiet"
        type="button"
        :disabled="pending || disabled"
        @click="emit('respond', { decision: 'rejected' })"
      >拒绝</button>
      <button
        class="interaction-button is-secondary"
        type="button"
        :disabled="pending || disabled"
        @click="emit('respond', { decision: 'approved', scope: 'session' })"
      >本会话允许</button>
      <button
        class="interaction-button is-primary"
        type="button"
        :disabled="pending || disabled"
        @click="emit('respond', { decision: 'approved' })"
      >允许一次</button>
    </footer>
  </article>
</template>
