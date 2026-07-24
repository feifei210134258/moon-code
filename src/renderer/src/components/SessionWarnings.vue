<script setup lang="ts">
import { PhInfo, PhWarning, PhXCircle } from '@phosphor-icons/vue'
import type { KimiSessionWarning } from '@shared/contracts'

defineProps<{ warnings: KimiSessionWarning[]; error: string | null }>()
</script>

<template>
  <section v-if="warnings.length > 0 || error" class="session-warnings" aria-label="Kimi Session 警告">
    <div v-for="warning in warnings" :key="`${warning.code}:${warning.message}`" :class="`is-${warning.severity}`">
      <PhXCircle v-if="warning.severity === 'error'" :size="15" />
      <PhWarning v-else-if="warning.severity === 'warning'" :size="15" />
      <PhInfo v-else :size="15" />
      <span><strong>{{ warning.code }}</strong>{{ warning.message }}</span>
    </div>
    <div v-if="error" class="is-error"><PhXCircle :size="15" /><span>警告读取失败：{{ error }}</span></div>
  </section>
</template>
