<script setup lang="ts">
import {
  PhAt,
  PhCaretDown,
  PhFile,
  PhFolderOpen,
  PhPaperclip,
  PhPaperPlaneTilt,
  PhSlidersHorizontal,
  PhStopCircle,
  PhTerminalWindow,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type {
  KimiModelCatalogItem,
  KimiPromptControls,
  KimiSkill,
  KimiUploadedFile,
  WorkspaceFileSearchItem
} from '@shared/contracts'

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
  mentionSearch?: ((query: string) => Promise<WorkspaceFileSearchItem[]>) | undefined
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
const mentionOpen = ref(false)
const mentionLoading = ref(false)
const mentionItems = ref<WorkspaceFileSearchItem[]>([])
const mentionActiveIndex = ref(0)
const input = ref<HTMLTextAreaElement | null>(null)
let mentionTimer: ReturnType<typeof setTimeout> | null = null
let mentionGeneration = 0
const selectedModel = computed(() => props.models.find((model) => model.id === props.controls?.model) ?? null)
const thinkingOptions = computed(() => {
  const efforts = selectedModel.value?.supportEfforts ?? []
  if (efforts.length > 0) return efforts
  return [props.controls?.thinking || 'off']
})
const slashQuery = computed(() => {
  const match = /^\/([^\s]*)$/.exec(value.value)
  return match?.[1]?.toLocaleLowerCase() ?? null
})
const filteredSkills = computed(() => {
  const query = slashQuery.value
  if (query === null || query.length === 0) return props.skills
  return props.skills.filter((skill) => {
    const name = skill.name.toLocaleLowerCase()
    const description = skill.description.toLocaleLowerCase()
    return name.includes(query) || description.includes(query)
  })
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
  closeMention()
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
  if (commandOpen.value) {
    optionsOpen.value = false
    closeMention()
  }
}

function onComposerInput(): void {
  if (slashQuery.value !== null && props.disabled !== true) {
    commandOpen.value = true
    optionsOpen.value = false
    closeMention()
    return
  }
  commandOpen.value = false
  queueMentionSearch()
}

function chooseSkill(skill: KimiSkill): void {
  value.value = `/${skill.name} `
  commandOpen.value = false
  closeMention()
  void nextTick(() => input.value?.focus())
}

async function loadDraft(text: string, files: KimiUploadedFile[] = []): Promise<void> {
  value.value = text
  attachments.value = [...files]
  commandOpen.value = false
  optionsOpen.value = false
  closeMention()
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

function currentMentionToken(): { query: string; start: number; end: number } | null {
  const text = value.value
  const end = input.value?.selectionStart ?? text.length
  let start = end - 1
  while (start >= 0 && !/\s/.test(text[start] ?? '')) start -= 1
  start += 1
  const token = text.slice(start, end)
  return token.startsWith('@') ? { query: token.slice(1), start, end } : null
}

function closeMention(): void {
  mentionGeneration += 1
  if (mentionTimer !== null) clearTimeout(mentionTimer)
  mentionTimer = null
  mentionOpen.value = false
  mentionLoading.value = false
  mentionItems.value = []
  mentionActiveIndex.value = 0
}

function queueMentionSearch(): void {
  const token = currentMentionToken()
  const search = props.mentionSearch
  if (token === null || search === undefined || props.disabled === true) {
    closeMention()
    return
  }
  const generation = ++mentionGeneration
  if (mentionTimer !== null) clearTimeout(mentionTimer)
  mentionOpen.value = true
  mentionLoading.value = true
  mentionActiveIndex.value = 0
  commandOpen.value = false
  optionsOpen.value = false
  mentionTimer = setTimeout(() => {
    mentionTimer = null
    void search(token.query).then((items) => {
      if (generation !== mentionGeneration) return
      mentionItems.value = items.slice(0, 20)
      mentionActiveIndex.value = 0
    }).catch(() => {
      if (generation === mentionGeneration) mentionItems.value = []
    }).finally(() => {
      if (generation === mentionGeneration) mentionLoading.value = false
    })
  }, 200)
}

function insertMentionTrigger(): void {
  if (props.disabled === true || props.mentionSearch === undefined) return
  const element = input.value
  const start = element?.selectionStart ?? value.value.length
  const end = element?.selectionEnd ?? start
  const prefix = start > 0 && !/\s/.test(value.value[start - 1] ?? '') ? ' @' : '@'
  value.value = `${value.value.slice(0, start)}${prefix}${value.value.slice(end)}`
  void nextTick(() => {
    const caret = start + prefix.length
    input.value?.setSelectionRange(caret, caret)
    input.value?.focus()
    queueMentionSearch()
  })
}

function selectMention(item: WorkspaceFileSearchItem): void {
  const token = currentMentionToken()
  if (token === null) return
  value.value = `${value.value.slice(0, token.start)}${item.path}${value.value.slice(token.end)}`
  closeMention()
  void nextTick(() => {
    const caret = token.start + item.path.length
    input.value?.setSelectionRange(caret, caret)
    input.value?.focus()
  })
}

function mentionIcon(item: WorkspaceFileSearchItem) {
  return item.kind === 'directory' ? PhFolderOpen : PhFile
}

function thinkingLabel(effort: string): string {
  return {
    off: '关闭',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '超高',
    max: '最高'
  }[effort.trim().toLocaleLowerCase()] ?? effort
}

function skillSourceLabel(source: KimiSkill['source']): string {
  return {
    project: '项目',
    user: '个人',
    extra: '扩展',
    builtin: '内置'
  }[source]
}

defineExpose({ loadDraft })

function onKeydown(event: KeyboardEvent): void {
  if (mentionOpen.value) {
    const count = mentionItems.value.length
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMention()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (count > 0) {
        mentionActiveIndex.value = event.key === 'ArrowDown'
          ? (mentionActiveIndex.value + 1) % count
          : (mentionActiveIndex.value - 1 + count) % count
      }
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const item = mentionItems.value[mentionActiveIndex.value]
      if (item !== undefined && !mentionLoading.value) selectMention(item)
      return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

onBeforeUnmount(closeMention)
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
    <div class="composer-input-area">
      <slot name="session-actions" />
      <textarea
        ref="input"
        v-model="value"
        rows="1"
        :placeholder="disabled ? disabledReason : goalMode ? '描述需要持续完成的目标…' : '描述你的任务或问题…'"
        :disabled="disabled"
        aria-label="输入任务"
        aria-autocomplete="list"
        @keydown="onKeydown"
        @input="onComposerInput"
      />
    </div>
    <div v-if="goalMode" class="goal-mode-banner"><strong>目标</strong><span>下一条消息会创建持续目标并立即开始执行</span></div>
    <div class="composer-actions">
      <div class="composer-primary-tools">
        <button type="button" aria-label="添加附件" :disabled="disabled || attachmentPending" @click="pickAttachments"><PhPaperclip :size="19" /></button>
        <button
          type="button"
          aria-label="引用文件"
          :aria-expanded="mentionOpen"
          :disabled="disabled || mentionSearch === undefined"
          @click="insertMentionTrigger"
        ><PhAt :size="19" /></button>
        <button
          type="button"
          aria-label="使用命令"
          class="slash-button"
          :aria-expanded="commandOpen"
          :disabled="disabled"
          @click="toggleCommands"
        >/</button>
        <button type="button" aria-label="打开终端" title="终端 · ⌘J" :disabled="disabled" @click="emit('toggleTerminal')">
          <PhTerminalWindow :size="19" />
        </button>
      </div>
      <div class="composer-settings">
        <button class="model-summary" type="button" :disabled="disabled" @click="optionsOpen = !optionsOpen; commandOpen = false; closeMention()">
          <span>{{ selectedModel?.displayName ?? controls?.model ?? (controlsPending ? '读取模型…' : '未配置模型') }}</span>
          <PhCaretDown :size="12" />
        </button>
        <button
          class="settings-trigger"
          type="button"
          :aria-expanded="optionsOpen"
          :disabled="disabled"
          aria-label="会话设置"
          @click="optionsOpen = !optionsOpen; closeMention()"
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
        <span>模型</span>
        <select :value="controls?.model" :disabled="disabled || controls === null" @change="updateModel">
          <option v-for="model in models" :key="model.id" :value="model.id">{{ model.displayName }}</option>
        </select>
      </label>
      <label>
        <span>思考强度</span>
        <select :value="controls?.thinking" :disabled="disabled || controls === null" @change="updateThinking">
          <option v-for="effort in thinkingOptions" :key="effort" :value="effort">{{ thinkingLabel(effort) }}</option>
        </select>
      </label>
      <label>
        <span>权限模式</span>
        <select :value="controls?.permissionMode" :disabled="disabled || controls === null" @change="updatePermission">
          <option value="manual">手动确认</option>
          <option value="auto">自动确认</option>
          <option value="yolo">完全自动</option>
        </select>
      </label>
      <label class="composer-toggle-row">
        <span><strong>规划模式</strong><small>独立规划后再执行</small></span>
        <input type="checkbox" :checked="controls?.planMode" :disabled="disabled || controls === null" @change="updateBoolean('planMode', $event)">
      </label>
      <label class="composer-toggle-row is-goal">
        <span><strong>目标模式</strong><small>将下一条消息设为持续目标</small></span>
        <input type="checkbox" :checked="goalMode" :disabled="disabled" @change="emit('updateGoalMode', ($event.target as HTMLInputElement).checked)">
      </label>
      <label class="composer-toggle-row">
        <span><strong>协作模式</strong><small>多 Agent 协作</small></span>
        <input type="checkbox" :checked="controls?.swarmMode" :disabled="disabled || controls === null" @change="updateBoolean('swarmMode', $event)">
      </label>
    </div>

    <div v-if="commandOpen" class="command-popover" role="listbox" aria-label="Kimi 技能">
      <header><strong>技能</strong><span>输入参数后按回车激活</span></header>
      <div v-if="skillsPending" class="command-empty">正在读取 Kimi 技能…</div>
      <div v-else-if="skills.length === 0" class="command-empty">当前会话没有可用技能</div>
      <div v-else-if="filteredSkills.length === 0" class="command-empty">没有匹配的技能</div>
      <template v-else>
        <button
          v-for="skill in filteredSkills"
          :key="skill.name"
          type="button"
          role="option"
          @click="chooseSkill(skill)"
        >
          <span><strong>/{{ skill.name }}</strong><small>{{ skill.description || '无描述' }}</small></span>
          <em>{{ skillSourceLabel(skill.source) }}</em>
        </button>
      </template>
    </div>

    <div v-if="mentionOpen" class="mention-popover" role="listbox" aria-label="项目文件引用">
      <header><strong>项目文件</strong><span>选择后插入路径</span></header>
      <div v-if="mentionLoading" class="command-empty"><PhSpinnerGap class="spin" :size="15" />正在搜索 Kimi 工作区…</div>
      <div v-else-if="mentionItems.length === 0" class="command-empty">没有匹配的文件</div>
      <template v-else>
        <div
          v-for="(item, index) in mentionItems"
          :key="item.path"
          class="mention-item"
          :class="{ active: index === mentionActiveIndex }"
          role="option"
          :aria-selected="index === mentionActiveIndex"
          @mouseenter="mentionActiveIndex = index"
          @mousedown.prevent="selectMention(item)"
        >
          <component :is="mentionIcon(item)" :size="16" />
          <span><strong>{{ item.name }}</strong><small>{{ item.path }}</small></span>
          <em>{{ item.kind === 'directory' ? '目录' : '文件' }}</em>
        </div>
      </template>
    </div>
  </div>
</template>
