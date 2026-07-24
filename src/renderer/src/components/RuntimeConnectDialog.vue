<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowClockwise, PhTerminalWindow } from '@phosphor-icons/vue'

const props = defineProps<{
  open: boolean
  pending: boolean
  error: string | null
  missing: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const title = computed(() => props.missing ? '需要安装 Kimi Code CLI' : 'Kimi Code CLI 无法启动')
const description = computed(() => props.missing
  ? 'Moon Code 未在你的系统中检测到 Kimi Code CLI。安装后会自动连接，无需再选择连接方式。'
  : 'Moon Code 已检测到 Kimi Code CLI，但当前版本或启动状态不可用。更新或修复 CLI 后可重新检测。'
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="runtime-connect-backdrop">
      <section class="runtime-connect-dialog glass-panel" role="dialog" aria-modal="true" aria-label="Kimi Code CLI 安装提示">
        <header><div><PhTerminalWindow :size="19" /><strong>{{ title }}</strong></div></header>
        <p>{{ description }}</p>
        <pre class="runtime-install-command"><code>npm install -g @moonshot-ai/kimi-code</code></pre>
        <p class="runtime-install-note">请在终端完成安装；完成后回到 Moon Code 点击下方按钮。</p>
        <button class="primary-button" type="button" :disabled="pending" @click="emit('retry')">
          <PhArrowClockwise :class="{ spin: pending }" :size="16" />重新检测并连接
        </button>
        <p v-if="error" class="runtime-connect-error" role="alert">{{ error }}</p>
      </section>
    </div>
  </Teleport>
</template>
