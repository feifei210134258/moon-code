<script setup lang="ts">
import {
  PhAt,
  PhCaretDown,
  PhFile,
  PhPaperclip,
  PhPaperPlaneTilt,
  PhSlidersHorizontal,
  PhStopCircle,
  PhTerminalWindow,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, ref } from 'vue'
import type { KimiModelCatalogItem, KimiPromptControls, KimiSkill, KimiUploadedFile } from '@shared/contracts'

const props = defineProps<{
  disabled?: boolean
  disabledReason?: string
  pending?: boolean
  running?: boolean
  skills: KimiSkill[]
  skillsPending?: boolean
  activationPending?: boolean
  models: KimiModelCatalogItem[]
  controls: KimiPromptControls | null
  controlsPending?: boolean
  goalMode?: boolean
}>()

const emit = defineEmits<{
  submit: [text: string, attachments: KimiUploadedFile[], controls: KimiPromptControls, goalMode: boolean]
  abort: []
  toggleTerminal: []
  activateSkill: [skillName: string, args?: string]
  updateControls: [controls: KimiPromptControls]
  updateGoalMode: [enabled: boolean]
}>()

const value = ref('')
const attachments = ref<KimiUploadedFile[]>([])
const attachmentPending = ref(false)
const attachmentError = ref<string | null>(null)
const optionsOpen = ref(false)
const commandOpen = ref(false)
const input = ref<HTMLTextAreaElement | null>(null)
const selectedModel = computed(() => props.models.find((model) => model.id === props.controls?.model) ?? null)
const thinkingOptions = computed(() => {
  const efforts = selectedModel.value?.supportEfforts ?? []
  if (efforts.length > 0) return efforts
  return [props.controls?.thinking || 'off']
})

function submit(): void {
  if (
    props.disabled === true ||
    props.pending === true ||
    props.activationPending === true ||
    props.controls === null ||
    (value.value.trim().length === 0 && attachments.value.length === 0) ||
    (props.goalMode === true && value.value.trim().length === 0)
  ) return
  const text = value.value.trim()
  const command = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text)
  const skill = command === null || attachments.value.length > 0
    ? undefined
    : props.skills.find((item) => item.name === command[1])
  if (skill !== undefined) {
    const args = command?.[2]?.trim()
    emit('activateSkill', skill.name, args === undefined || args.length === 0 ? undefined : args)
  } else {
    emit('submit', value.value, [...attachments.value], props.controls, props.goalMode === true)
  }
  value.value = ''
  attachments.value = []
  commandOpen.value = false
  void nextTick(() => input.value?.focus())
}

function updateModel(event: Event): void {
  if (props.controls === null) return
  const model = (event.target as HTMLSelectElement).value
  const descriptor = props.models.find((item) => item.id === model)
  const efforts = descriptor?.supportEfforts ?? []
  const thinking = efforts.includes(props.controls.thinking)
    ? props.controls.thinking
    : descriptor?.defaultEffort ?? efforts[0] ?? 'off'
  emit('updateControls', { ...props.controls, model, thinking })
}

function updateThinking(event: Event): void {
  if (props.controls === null) return
  emit('updateControls', { ...props.controls, thinking: (event.target as HTMLSelectElement).value })
}

function updatePermission(event: Event): void {
  if (props.controls === null) return
  const permissionMode = (event.target as HTMLSelectElement).value as KimiPromptControls['permissionMode']
  emit('updateControls', { ...props.controls, permissionMode })
}

function updateBoolean(key: 'planMode' | 'swarmMode', event: Event): void {
  if (props.controls === null) return
  emit('updateControls', { ...props.controls, [key]: (event.target as HTMLInputElement).checked })
}

function toggleCommands(): void {
  commandOpen.value = !commandOpen.value
  if (commandOpen.value) optionsOpen.value = false
}

function chooseSkill(skill: KimiSkill): void {
  value.value = `/${skill.name} `
  commandOpen.value = false
  void nextTick(() => input.value?.focus())
}

async function loadDraft(text: string, files: KimiUploadedFile[] = []): Promise<void> {
  value.value = text
  attachments.value = [...files]
  commandOpen.value = false
  optionsOpen.value = false
  await nextTick()
  input.value?.focus()
}

async function pickAttachments(): Promise<void> {
  const api = window.kimiAgent
  if (api === undefined || attachmentPending.value || props.disabled === true) return
  attachmentPending.value = true
  attachmentError.value = null
  try {
    const result = await api.pickAttachments()
    if (!result.cancelled) {
      const existing = new Set(attachments.value.map((file) => file.fileId))
      attachments.value = [...attachments.value, ...result.files.filter((file) => !existing.has(file.fileId))]
    }
  } catch (reason) {
    attachmentError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    attachmentPending.value = false
  }
}

function removeAttachment(file: KimiUploadedFile): void {
  attachments.value = attachments.value.filter((item) => item.fileId !== file.fileId)
  void window.kimiAgent?.discardAttachment(file.fileId).catch((reason: unknown) => {
    attachmentError.value = reason instanceof Error ? reason.message : String(reason)
  })
}

function formattedSize(size: number): string {
  if (size < 1_024) return `${size} B`
  if (size < 1_048_576) return `${Math.round(size / 1_024)} KB`
  return `${(size / 1_048_576).toFixed(1)} MB`
}

defineExpose({ loadDraft })

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <div class="composer-wrap">
    <div v-if="attachments.length > 0 || attachmentPending" class="composer-attachments" aria-label="待发送附件">
      <div v-for="file in attachments" :key="file.fileId" class="composer-attachment-chip">
        <PhFile :size="15" />
        <span><strong>{{ file.name }}</strong><small>{{ formattedSize(file.size) }}</small></span>
        <button type="button" :aria-label="`移除附件 ${file.name}`" @click="removeAttachment(file)"><PhX :size="13" /></button>
      </div>
      <div v-if="attachmentPending" class="composer-attachment-chip is-loading"><PhSpinnerGap class="spin" :size="15" /><span>正在上传到 Kimi…</span></div>
    </div>
    <div v-if="attachmentError" class="composer-attachment-error" role="alert">{{ attachmentError }}</div>
    <textarea
      ref="input"
      v-model="value"
      rows="1"
      :placeholder="disabled ? disabledReason : goalMode ? '描述需要持续完成的目标…' : '描述你的任务或问题…'"
      :disabled="disabled"
      aria-label="输入任务"
      @keydown="onKeydown"
    />
    <div v-if="goalMode" class="goal-mode-banner"><strong>Goal</strong><span>下一条消息会创建 Kimi Goal 并立即开始执行</span></div>
    <div class="composer-actions">
      <div class="composer-primary-tools">
        <button type="button" aria-label="添加附件" :disabled="disabled || attachmentPending" @click="pickAttachments"><PhPaperclip :size="19" /></button>
        <button type="button" aria-label="引用文件" :disabled="disabled"><PhAt :size="19" /></button>
        <button
          type="button"
          aria-label="使用命令"
          class="slash-button"
          :aria-expanded="commandOpen"
          :disabled="disabled"
          @click="toggleCommands"
        >/</button>
        <button type="button" aria-label="打开终端" title="Terminal · ⌘J" :disabled="disabled" @click="emit('toggleTerminal')">
          <PhTerminalWindow :size="19" />
        </button>
      </div>
      <div class="composer-settings">
        <button class="model-summary" type="button" :disabled="disabled" @click="optionsOpen = !optionsOpen; commandOpen = false">
          <span>{{ selectedModel?.displayName ?? controls?.model ?? (controlsPending ? '读取模型…' : '未配置模型') }}</span>
          <PhCaretDown :size="12" />
        </button>
        <button
          class="settings-trigger"
          type="button"
          :aria-expanded="optionsOpen"
          :disabled="disabled"
          aria-label="会话设置"
          @click="optionsOpen = !optionsOpen"
        >
          <PhSlidersHorizontal :size="18" />
        </button>
        <span v-if="running" class="queue-hint">发送将加入队列</span>
        <button
          v-if="running"
          class="send-button stop-button"
          type="button"
          aria-label="停止当前任务"
          :disabled="pending"
          @click="$emit('abort')"
        >
          <PhStopCircle :size="20" weight="fill" />
        </button>
        <button
          class="send-button"
          type="button"
          aria-label="发送任务"
          :disabled="disabled || pending || activationPending || attachmentPending || controls === null || (value.trim().length === 0 && attachments.length === 0) || (goalMode && value.trim().length === 0)"
          @click="submit"
        >
          <PhPaperPlaneTilt :size="19" weight="fill" />
        </button>
      </div>
    </div>

    <div v-if="optionsOpen" class="composer-popover" aria-label="Kimi 会话控制">
      <label>
        <span>Model</span>
        <select :value="controls?.model" :disabled="disabled || controls === null" @change="updateModel">
          <option v-for="model in models" :key="model.id" :value="model.id">{{ model.displayName }}</option>
        </select>
      </label>
      <label>
        <span>Thinking</span>
        <select :value="controls?.thinking" :disabled="disabled || controls === null" @change="updateThinking">
          <option v-for="effort in thinkingOptions" :key="effort" :value="effort">{{ effort }}</option>
        </select>
      </label>
      <label>
        <span>Permission</span>
        <select :value="controls?.permissionMode" :disabled="disabled || controls === null" @change="updatePermission">
          <option value="manual">Manual</option>
          <option value="auto">Auto</option>
          <option value="yolo">YOLO</option>
        </select>
      </label>
      <label class="composer-toggle-row">
        <span><strong>Plan</strong><small>独立规划模式</small></span>
        <input type="checkbox" :checked="controls?.planMode" :disabled="disabled || controls === null" @change="updateBoolean('planMode', $event)">
      </label>
      <label class="composer-toggle-row is-goal">
        <span><strong>Goal</strong><small>将下一条消息设为持续目标</small></span>
        <input type="checkbox" :checked="goalMode" :disabled="disabled" @change="emit('updateGoalMode', ($event.target as HTMLInputElement).checked)">
      </label>
      <label class="composer-toggle-row">
        <span><strong>Swarm</strong><small>多 Agent 协作</small></span>
        <input type="checkbox" :checked="controls?.swarmMode" :disabled="disabled || controls === null" @change="updateBoolean('swarmMode', $event)">
      </label>
    </div>

    <div v-if="commandOpen" class="command-popover" role="listbox" aria-label="Kimi Skills">
      <header><strong>Skills</strong><span>输入参数后按 Enter 激活</span></header>
      <div v-if="skillsPending" class="command-empty">正在读取 Kimi Skills…</div>
      <div v-else-if="skills.length === 0" class="command-empty">当前 Session 没有可用 Skill</div>
      <template v-else>
        <button
          v-for="skill in skills"
          :key="skill.name"
          type="button"
          role="option"
          @click="chooseSkill(skill)"
        >
          <span><strong>/{{ skill.name }}</strong><small>{{ skill.description || '无描述' }}</small></span>
          <em>{{ skill.source }}</em>
        </button>
      </template>
    </div>
  </div>
</template>
