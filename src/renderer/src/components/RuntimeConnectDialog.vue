<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhLink, PhPlay, PhX } from '@phosphor-icons/vue'

const props = defineProps<{ open: boolean; pending: boolean; error: string | null }>()
const emit = defineEmits<{
  close: []
  startManaged: []
  connectExternal: [origin: string, token: string]
}>()

const origin = ref('http://127.0.0.1:54959')
const token = ref('')
const canConnect = computed(() => !props.pending && origin.value.trim().length > 0 && token.value.length > 0)

function connect(event: SubmitEvent): void {
  const nextToken = token.value
  token.value = ''
  if (event.currentTarget instanceof HTMLFormElement) {
    const password = event.currentTarget.querySelector<HTMLInputElement>('input[type="password"]')
    if (password !== null) password.value = ''
  }
  emit('connectExternal', origin.value.trim(), nextToken)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="runtime-connect-backdrop" @click.self="emit('close')">
      <section class="runtime-connect-dialog glass-panel" role="dialog" aria-modal="true" aria-label="连接 Kimi Runtime">
        <header><div><PhLink :size="18" /><strong>连接 Kimi Runtime</strong></div><button type="button" aria-label="关闭" @click="emit('close')"><PhX :size="17" /></button></header>
        <p>可启动当前应用托管的 Kimi，也可连接你已启动且受 Bearer 保护的 Kimi Server。Token 只用于本次 Main 进程连接，不会保存或回传。</p>
        <button class="primary-button" type="button" :disabled="pending" @click="emit('startManaged')"><PhPlay :size="15" />启动托管 Kimi</button>
        <div class="runtime-connect-divider"><span>或连接已运行的 Server</span></div>
        <form @submit.prevent="connect">
          <label><span>Server origin</span><input v-model="origin" type="url" maxlength="2048" autocomplete="url" placeholder="https://kimi.example.com" /></label>
          <label><span>Bearer token</span><input v-model="token" type="password" maxlength="4096" autocomplete="off" placeholder="仅本次连接使用" /></label>
          <button class="secondary-button" type="submit" :disabled="!canConnect">连接受保护 Server</button>
        </form>
        <p v-if="error" class="runtime-connect-error" role="alert">{{ error }}</p>
      </section>
    </div>
  </Teleport>
</template>
