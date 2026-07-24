<script setup lang="ts">
import { PhCaretLeft, PhCaretRight, PhQuestion, PhSpinnerGap } from '@phosphor-icons/vue'
import { computed, nextTick, ref, watch } from 'vue'
import type {
  QuestionAnswerInput,
  QuestionItemView,
  QuestionRequestView
} from '@shared/contracts'

const props = defineProps<{
  request: QuestionRequestView
  pending: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  answer: [answers: Record<string, QuestionAnswerInput>]
  dismiss: []
}>()

const step = ref(0)
const answers = ref<Record<string, QuestionAnswerInput>>({})
const otherTexts = ref<Record<string, string>>({})
const otherInput = ref<HTMLInputElement | null>(null)
const total = computed(() => props.request.questions.length)
const current = computed(() => props.request.questions[Math.min(step.value, total.value - 1)]!)

watch(
  () => props.request.questionId,
  () => {
    step.value = 0
    answers.value = {}
    otherTexts.value = {}
    seedRecommendedAnswers()
  },
  { immediate: true }
)

function seedRecommendedAnswers(): void {
  const next: Record<string, QuestionAnswerInput> = {}
  for (const question of props.request.questions) {
    const recommended = question.options.filter((option) => option.recommended)
    if (recommended.length === 0) continue
    if (question.multiSelect) {
      next[question.id] = { kind: 'multi', option_ids: recommended.map((option) => option.id) }
    } else if (recommended[0] !== undefined) {
      next[question.id] = { kind: 'single', option_id: recommended[0].id }
    }
  }
  answers.value = next
}

function selectedOptionIds(questionId: string): string[] {
  const answer = answers.value[questionId]
  if (answer?.kind === 'single') return [answer.option_id]
  if (answer?.kind === 'multi' || answer?.kind === 'multi_with_other') return answer.option_ids
  return []
}

function isSelected(questionId: string, optionId: string): boolean {
  return selectedOptionIds(questionId).includes(optionId)
}

function isOtherSelected(questionId: string): boolean {
  const answer = answers.value[questionId]
  return answer?.kind === 'other' || answer?.kind === 'multi_with_other'
}

function pickSingle(questionId: string, optionId: string): void {
  answers.value = {
    ...answers.value,
    [questionId]: { kind: 'single', option_id: optionId }
  }
}

function toggleMulti(questionId: string, optionId: string): void {
  const optionIds = [...selectedOptionIds(questionId)]
  const index = optionIds.indexOf(optionId)
  if (index === -1) optionIds.push(optionId)
  else optionIds.splice(index, 1)
  const otherText = otherTexts.value[questionId]?.trim() ?? ''
  answers.value = {
    ...answers.value,
    [questionId]: otherText.length > 0
      ? { kind: 'multi_with_other', option_ids: optionIds, other_text: otherText }
      : { kind: 'multi', option_ids: optionIds }
  }
}

function selectOther(question: QuestionItemView): void {
  updateOther(question)
  void nextTick(() => otherInput.value?.focus())
}

function updateOther(question: QuestionItemView): void {
  const text = otherTexts.value[question.id] ?? ''
  if (question.multiSelect) {
    answers.value = {
      ...answers.value,
      [question.id]: {
        kind: 'multi_with_other',
        option_ids: selectedOptionIds(question.id),
        other_text: text
      }
    }
  } else {
    answers.value = { ...answers.value, [question.id]: { kind: 'other', text } }
  }
}

function isAnswered(question: QuestionItemView): boolean {
  const answer = answers.value[question.id]
  if (answer?.kind === 'single') return answer.option_id.length > 0
  if (answer?.kind === 'multi') return answer.option_ids.length > 0
  if (answer?.kind === 'other') return answer.text.trim().length > 0
  if (answer?.kind === 'multi_with_other') {
    return answer.option_ids.length > 0 || answer.other_text.trim().length > 0
  }
  return false
}

const currentAnswered = computed(() => isAnswered(current.value))
const canSubmit = computed(() => props.request.questions.every(isAnswered))

function goNext(): void {
  if (!currentAnswered.value || step.value >= total.value - 1) return
  step.value += 1
}

function goBack(): void {
  if (step.value > 0) step.value -= 1
}

function normalizeAnswers(): Record<string, QuestionAnswerInput> {
  const normalized: Record<string, QuestionAnswerInput> = {}
  for (const question of props.request.questions) {
    const answer = answers.value[question.id]
    if (answer?.kind === 'other') {
      normalized[question.id] = { kind: 'other', text: answer.text.trim() }
    } else if (answer?.kind === 'multi_with_other') {
      const otherText = answer.other_text.trim()
      normalized[question.id] = otherText.length === 0
        ? { kind: 'multi', option_ids: answer.option_ids }
        : { kind: 'multi_with_other', option_ids: answer.option_ids, other_text: otherText }
    } else if (answer !== undefined) {
      normalized[question.id] = answer
    }
  }
  return normalized
}

function submit(): void {
  if (props.pending || props.disabled === true || !canSubmit.value) return
  emit('answer', normalizeAnswers())
}
</script>

<template>
  <article class="interaction-card question-card" aria-label="Kimi 等待回答">
    <header class="interaction-card-header">
      <span class="interaction-icon is-question"><PhQuestion :size="18" weight="bold" /></span>
      <div class="interaction-heading">
        <strong>Kimi 需要你的选择</strong>
        <span v-if="total > 1">第 {{ step + 1 }} / {{ total }} 项</span>
        <span v-else>回答后继续执行</span>
      </div>
      <div v-if="total > 1" class="question-progress" aria-label="问题进度">
        <button
          v-for="(question, index) in request.questions"
          :key="question.id"
          type="button"
          :class="{ 'is-current': index === step, 'is-answered': isAnswered(question) }"
          :aria-label="`查看第 ${index + 1} 项`"
          :disabled="pending || disabled"
          @click="step = index"
        >{{ index + 1 }}</button>
      </div>
    </header>

    <div class="interaction-body question-body">
      <span v-if="current.header" class="question-header-chip">{{ current.header }}</span>
      <p class="interaction-prompt">{{ current.question }}</p>
      <p v-if="current.body" class="question-description">{{ current.body }}</p>

      <div
        class="question-options"
        :role="current.multiSelect ? 'group' : 'radiogroup'"
        :aria-label="current.question"
      >
        <button
          v-for="option in current.options"
          :key="option.id"
          class="question-option"
          :class="{ 'is-selected': isSelected(current.id, option.id) }"
          type="button"
          :role="current.multiSelect ? 'checkbox' : 'radio'"
          :aria-checked="isSelected(current.id, option.id)"
          :disabled="pending || disabled"
          @click="current.multiSelect ? toggleMulti(current.id, option.id) : pickSingle(current.id, option.id)"
        >
          <span class="question-option-mark">{{ current.multiSelect ? (isSelected(current.id, option.id) ? '✓' : '') : (isSelected(current.id, option.id) ? '●' : '') }}</span>
          <span class="question-option-copy">
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
          <span v-if="option.recommended" class="recommended-chip">推荐</span>
        </button>

        <div
          v-if="current.allowOther"
          class="question-option other-option"
          :class="{ 'is-selected': isOtherSelected(current.id) }"
        >
          <button
            class="other-selector"
            type="button"
            :role="current.multiSelect ? 'checkbox' : 'radio'"
            :aria-checked="isOtherSelected(current.id)"
            :disabled="pending || disabled"
            @click="selectOther(current)"
          >
            <span class="question-option-mark">{{ isOtherSelected(current.id) ? (current.multiSelect ? '✓' : '●') : '' }}</span>
            <span>{{ current.otherLabel || '其他答案' }}</span>
          </button>
          <input
            ref="otherInput"
            v-model="otherTexts[current.id]"
            type="text"
            :placeholder="current.otherLabel || '其他答案…'"
            :aria-label="current.otherLabel || '其他答案'"
            :disabled="pending || disabled"
            @click.stop
            @focus="updateOther(current)"
            @input="updateOther(current)"
          />
        </div>
      </div>
    </div>

    <footer class="interaction-actions question-actions">
      <span v-if="pending" class="interaction-busy" role="status">
        <PhSpinnerGap :size="15" class="spin" />正在提交…
      </span>
      <button class="interaction-button is-quiet" type="button" :disabled="pending || disabled" @click="emit('dismiss')">放弃</button>
      <button
        v-if="step > 0"
        class="interaction-button is-secondary"
        type="button"
        :disabled="pending || disabled"
        @click="goBack"
      ><PhCaretLeft :size="14" />返回</button>
      <button
        v-if="step < total - 1"
        class="interaction-button is-primary"
        type="button"
        :disabled="pending || disabled || !currentAnswered"
        @click="goNext"
      >下一项<PhCaretRight :size="14" /></button>
      <button
        v-else
        class="interaction-button is-primary"
        type="button"
        :disabled="pending || disabled || !canSubmit"
        @click="submit"
      >提交回答</button>
    </footer>
  </article>
</template>
