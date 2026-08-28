<script setup lang="ts">
import { PhCheck, PhDeviceMobile, PhX } from '@phosphor-icons/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RemoteControlState } from '@shared/contracts'

/** 弹层锚点：侧栏底栏手机图标的视口矩形（plain object，避免传 DOMRect 依赖）。 */
const props = defineProps<{
  anchor: { top: number; left: number; bottom: number }
}>()

const emit = defineEmits<{ close: [] }>()

const POPOVER_WIDTH = 320
const NOTICE_DURATION_MS = 2_800

const state = ref<RemoteControlState | null>(null)
const pending = ref(false)
const actionPending = ref<string | null>(null)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | null = null

/* 贴着触发按钮向上展开；左缘夹在视口内，避免侧栏过窄时被裁切。 */
const popoverStyle = computed(() => {
  const left = Math.max(8, Math.min(props.anchor.left, window.innerWidth - POPOVER_WIDTH - 8))
  const bottom = Math.max(8, window.innerHeight - props.anchor.top + 8)
  return { left: `${Math.round(left)}px`, bottom: `${Math.round(bottom)}px`, width: `${POPOVER_WIDTH}px` }
})

const statusLabel = computed(() => {
  const current = state.value
  if (current === null) return '状态未知'
  if (current.active) return '已上线'
  if (current.requiresRestart) return current.preference.enabled ? '待重启生效' : '待重启关闭'
  return current.preference.enabled ? '已开启' : '已关闭'
})

async function loadState(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined) return
  try {
    state.value = await api.getRemoteControlState()
  } catch {
    state.value = null
  }
}

async function toggleRemoteControl(event: Event): Promise<void> {
  const api = window.kimiAgent
  const enabled = (event.target as HTMLInputElement).checked
  if (api === undefined || pending.value) return
  if (enabled && !window.confirm(
    '远程控制会把本机 Kimi 会话通过 Moonshot 官方中继（code-rc.kimi.com）暴露给扫码设备，需要已登录 Kimi 账号。确定开启吗？'
  )) {
    ;(event.target as HTMLInputElement).checked = !enabled
    return
  }
  pending.value = true
  error.value = null
  notice.value = null
  try {
    state.value = await api.setRemoteControlEnabled(enabled)
    showNotice(state.value.requiresRestart
      ? `远程控制已${enabled ? '开启' : '关闭'}，重启 Kimi Runtime 后生效。`
      : `远程控制已${enabled ? '开启' : '关闭'}。`)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    pending.value = false
  }
}

async function restartRuntimeForRemoteControl(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || actionPending.value !== null) return
  if (!window.confirm('重启 Kimi Runtime 会中断当前正在执行的任务，并关闭当前 Session 连接。确定继续吗？')) return
  actionPending.value = 'restart'
  error.value = null
  notice.value = null
  try {
    const next = await api.restartRuntime()
    if (next.status !== 'running') throw new Error(next.error ?? 'Kimi Runtime 重启失败')
    await loadState()
    showNotice('Kimi Runtime 已重启，远程控制设置已生效。')
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    actionPending.value = null
  }
}

async function copyRemoteControlUrl(): Promise<void> {
  const url = state.value?.url
  if (url === null || url === undefined) return
  try {
    await navigator.clipboard.writeText(url)
    showNotice('设备链接已复制。')
  } catch {
    error.value = '复制失败，请手动选择链接复制。'
  }
}

function openRemoteControlUrl(): void {
  const url = state.value?.url
  if (url === null || url === undefined) return
  void window.kimiAgent?.openExternalUrl(url)
}

function showNotice(message: string): void {
  if (noticeTimer !== null) clearTimeout(noticeTimer)
  notice.value = message
  noticeTimer = setTimeout(() => {
    notice.value = null
    noticeTimer = null
  }, NOTICE_DURATION_MS)
}

/* 点击弹层与触发按钮之外时关闭；触发按钮自己的 click 负责再点收起。 */
function onDocumentMousedown(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target.closest('.remote-popover, .sidebar-remote-trigger')) return
  emit('close')
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}

let disposeSubscription: (() => void) | null = null

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMousedown)
  window.addEventListener('keydown', onWindowKeydown)
  void loadState()
  const api = window.kimiAgent
  if (api !== undefined && typeof api.onRemoteControlStateChanged === 'function') {
    disposeSubscription = api.onRemoteControlStateChanged((next) => {
      state.value = next
    })
  }
})

onBeforeUnmount(() => {
  disposeSubscription?.()
  disposeSubscription = null
  document.removeEventListener('mousedown', onDocumentMousedown)
  window.removeEventListener('keydown', onWindowKeydown)
  if (noticeTimer !== null) clearTimeout(noticeTimer)
})
</script>

<template>
  <section class="remote-popover" :style="popoverStyle" role="dialog" aria-label="远程控制" @click.stop>
    <header class="remote-popover-head">
      <span class="remote-popover-icon" aria-hidden="true"><PhDeviceMobile :size="15" /></span>
      <strong>远程控制</strong>
      <span class="remote-popover-state" :class="{ 'is-live': state?.active === true }">{{ statusLabel }}</span>
      <button class="remote-popover-close" type="button" aria-label="关闭" @click="emit('close')"><PhX :size="14" /></button>
    </header>

    <p class="remote-popover-desc">
      {{ state?.active === true
        ? '已通过 Moonshot 中继上线，扫码或在其他设备打开链接即可继续本机会话。'
        : '把本机 Kimi 会话经 Moonshot 官方中继（code-rc.kimi.com）暴露给手机或其他电脑的浏览器；需要已登录 Kimi 账号。' }}
    </p>

    <label class="remote-popover-toggle">
      <span>开启远程控制</span>
      <input
        type="checkbox"
        :checked="state?.preference.enabled ?? false"
        :disabled="pending || state === null"
        @change="toggleRemoteControl"
      />
    </label>

    <template v-if="state?.preference.enabled">
      <p v-if="state.runtimeMode === 'external' || state.runtimeMode === 'shared'" class="remote-popover-note">
        当前 Runtime 不是由 Moon Code 启动，开关只作为偏好保存；请用 <code>kimi web --remote-control</code> 手动启动。
      </p>
      <template v-else>
        <div v-if="state.requiresRestart" class="secondary-restart-notice remote-popover-restart">
          <span>远程控制设置已变更，重启 Kimi Runtime 后生效。</span>
          <button class="primary-button" type="button" :disabled="actionPending !== null" @click="restartRuntimeForRemoteControl">立即重启</button>
        </div>
        <div v-if="state.active" class="remote-control-active remote-popover-active">
          <img v-if="state.qrCodeDataUrl" class="remote-control-qr remote-popover-qr" :src="state.qrCodeDataUrl" alt="远程控制二维码" />
          <div class="remote-control-link">
            <code>{{ state.url }}</code>
            <div class="remote-control-actions">
              <button class="secondary-button" type="button" @click="copyRemoteControlUrl">复制链接</button>
              <button class="secondary-button" type="button" @click="openRemoteControlUrl">在浏览器打开</button>
            </div>
          </div>
        </div>
        <p v-else-if="!state.requiresRestart" class="remote-popover-note">
          {{ state.appliedEnabled === true
            ? '中继尚未上线：确认已登录 Kimi 账号（kimi login），Runtime 启动时会自动注册。'
            : '开启并重启 Kimi Runtime 后，这里会显示设备二维码与链接。' }}
        </p>
      </template>
    </template>
    <div
      v-else-if="state !== null && state.requiresRestart && state.runtimeMode !== 'external' && state.runtimeMode !== 'shared'"
      class="secondary-restart-notice remote-popover-restart"
    >
      <span>远程控制已关闭，重启 Kimi Runtime 后生效。</span>
      <button class="primary-button" type="button" :disabled="actionPending !== null" @click="restartRuntimeForRemoteControl">立即重启</button>
    </div>

    <div v-if="error" class="remote-popover-message is-error" role="alert">{{ error }}</div>
    <div v-else-if="notice" class="remote-popover-message" role="status" aria-live="polite"><PhCheck :size="13" />{{ notice }}</div>
  </section>
</template>
