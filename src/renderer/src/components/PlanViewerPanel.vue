<script setup lang="ts">
import { PhCheck, PhClipboardText, PhCopySimple, PhPaperPlaneTilt, PhX } from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { PlanReview, PlanReviewState } from '@shared/contracts'

const props = defineProps<{
  plan: PlanReview | null
}>()

const emit = defineEmits<{
  close: []
  sendFeedback: [text: string]
}>()

const feedback = ref('')
const feedbackField = ref<HTMLTextAreaElement | null>(null)
const copied = ref(false)

const status = computed<PlanReviewState | null>(() => props.plan?.review?.state ?? null)

function statusLabel(state: PlanReviewState): string {
  return ({ pending: '待审批', approved: '已批准', rejected: '已拒绝', cancelled: '已取消' })[state] ?? '待审批'
}

/* 反馈输入框随内容自适应增高（对齐上游 0.37 修复）：内容变化时重新计算高度，
   只在内容超过一行后增长，清空后回落。 */
function autoGrow(): void {
  const field = feedbackField.value
  if (field === null) return
  field.style.height = 'auto'
  field.style.height = `${field.scrollHeight}px`
  field.style.overflowY = field.scrollHeight >= 160 ? 'auto' : 'hidden'
}

async function copyPlan(): Promise<void> {
  const text = props.plan?.plan
  if (text === undefined || text === null) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    /* 剪贴板不可用时静默忽略 */
  }
}

function sendFeedback(): void {
  const text = feedback.value.trim()
  if (text.length === 0) return
  emit('sendFeedback', text)
  feedback.value = ''
  void nextTick(autoGrow)
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void nextTick(autoGrow)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="plan-viewer-backdrop" @click.self="emit('close')">
      <aside class="plan-viewer-dialog" role="dialog" aria-modal="true" aria-label="计划查看器">
        <header class="plan-viewer-header">
          <span class="plan-viewer-icon"><PhClipboardText :size="18" weight="fill" /></span>
          <div class="plan-viewer-heading">
            <strong>Plan 查看</strong>
            <span>{{ plan?.path || '计划' }}</span>
          </div>
          <span v-if="status" class="plan-viewer-status" :class="`is-${status}`">{{ statusLabel(status) }}</span>
          <button class="plan-viewer-close" type="button" aria-label="关闭计划查看器" @click="emit('close')">
            <PhX :size="17" />
          </button>
        </header>

        <div class="plan-viewer-body">
          <section class="plan-viewer-section">
            <header><h2>完整计划</h2><span v-if="plan?.path" class="plan-viewer-path">{{ plan.path }}</span></header>
            <pre v-if="plan?.plan" class="plan-viewer-content">{{ plan.plan }}</pre>
            <p v-else class="plan-viewer-empty">暂无计划文本 —— 等 adapter 从 `plan_review` / `/transcript/plan` 投影后展示。</p>
          </section>

          <section class="plan-viewer-section">
            <header><h2>审批与反馈</h2></header>
            <div v-if="plan?.review" class="plan-review-outcome" :class="`is-${plan.review.state}`">
              <span class="plan-review-dot" aria-hidden="true" />
              <div class="plan-review-copy">
                <strong>{{ statusLabel(plan.review.state) }}</strong>
                <span v-if="plan.review.selectedOption">选择项：<span>{{ plan.review.selectedOption }}</span></span>
                <p v-if="plan.review.feedback">{{ plan.review.feedback }}</p>
              </div>
            </div>
            <div v-else-if="plan?.options && plan.options.length > 0" class="plan-review-options">
              <p class="plan-review-option-label">可选操作：</p>
              <button
                v-for="option in plan.options"
                :key="option.label"
                type="button"
                class="plan-review-option"
                :title="option.description"
              >{{ option.label }}</button>
            </div>
            <p v-else class="plan-viewer-empty">暂无审批记录。</p>
          </section>
        </div>

        <footer class="plan-viewer-footer">
          <textarea
            ref="feedbackField"
            v-model="feedback"
            class="plan-viewer-feedback"
            rows="1"
            placeholder="计划反馈…"
            aria-label="计划反馈"
            @input="autoGrow"
          />
          <div class="plan-viewer-actions">
            <button class="plan-viewer-button is-quiet" type="button" @click="copyPlan">
              <PhCheck v-if="copied" :size="14" />
              <PhCopySimple v-else :size="14" />
              {{ copied ? '已复制' : '复制计划' }}
            </button>
            <button
              class="plan-viewer-button is-primary"
              type="button"
              :disabled="feedback.trim().length === 0"
              @click="sendFeedback"
            ><PhPaperPlaneTilt :size="14" />发送反馈</button>
          </div>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>
