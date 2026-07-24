<script setup lang="ts">
import { PhPause, PhPlay, PhStop } from '@phosphor-icons/vue'
import type { KimiSessionGoal } from '@shared/contracts'

defineProps<{
  goal: KimiSessionGoal
  pendingKey: string | null
}>()

const emit = defineEmits<{
  control: [control: 'pause' | 'resume' | 'cancel']
}>()

function statusLabel(status: KimiSessionGoal['status']): string {
  return ({ active: '执行中', paused: '已暂停', blocked: '受阻', complete: '已完成' })[status]
}
</script>

<template>
  <section class="goal-strip" :class="`is-${goal.status}`" aria-label="Kimi 当前目标">
    <span class="goal-status-dot" />
    <div class="goal-strip-copy">
      <span><strong>Goal</strong><em>{{ statusLabel(goal.status) }}</em></span>
      <p>{{ goal.objective }}</p>
    </div>
    <div class="goal-strip-metrics">
      <span>{{ goal.turnsUsed }} turns</span>
      <span>{{ goal.tokensUsed.toLocaleString() }} tokens</span>
      <span v-if="goal.budget.remainingTurns !== null">余 {{ goal.budget.remainingTurns }} turns</span>
    </div>
    <div class="goal-strip-actions">
      <button
        v-if="goal.status === 'active'"
        type="button"
        aria-label="暂停 Goal"
        :disabled="pendingKey !== null"
        @click="emit('control', 'pause')"
      ><PhPause :size="15" /></button>
      <button
        v-if="goal.status === 'paused' || goal.status === 'blocked'"
        type="button"
        aria-label="恢复 Goal"
        :disabled="pendingKey !== null"
        @click="emit('control', 'resume')"
      ><PhPlay :size="15" /></button>
      <button
        v-if="goal.status !== 'complete'"
        type="button"
        aria-label="取消 Goal"
        :disabled="pendingKey !== null"
        @click="emit('control', 'cancel')"
      ><PhStop :size="15" /></button>
    </div>
  </section>
</template>
