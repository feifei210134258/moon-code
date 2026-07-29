<script setup lang="ts">
import {
  PhAt,
  PhCaretDown,
  PhFile,
  PhFolderOpen,
  PhImage,
  PhPaperclip,
  PhPaperPlaneTilt,
  PhStopCircle,
  PhTerminalWindow,
  PhSpinnerGap,
  PhX
} from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
  terminalEnabled?: boolean
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
  submit: [
    text: string,
    attachments: KimiUploadedFile[],
    controls: KimiPromptControls,
    goalMode: boolean,
    deliveryMode: 'queue' | 'steer'
  ]
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
const deliveryOpen = ref(false)
const deliveryMode = ref<'queue' | 'steer'>('queue')
const mentionLoading = ref(false)
const mentionError = ref<string | null>(null)
const mentionItems = ref<WorkspaceFileSearchItem[]>([])
const mentionActiveIndex = ref(0)
const commandActiveIndex = ref(0)
const pendingPermissionMode = ref<KimiPromptControls['permissionMode'] | null>(null)
const composerRoot = ref<HTMLElement | null>(null)
const modelTrigger = ref<HTMLButtonElement | null>(null)
const commandTrigger = ref<HTMLButtonElement | null>(null)
const mentionTrigger = ref<HTMLButtonElement | null>(null)
const deliveryTrigger = ref<HTMLButtonElement | null>(null)
const input = ref<HTMLTextAreaElement | null>(null)
type PopoverKind = 'options' | 'command' | 'mention' | 'delivery'
const popoverStyles = ref<Record<PopoverKind, Record<string, string>>>({
  options: {},
  command: {},
  mention: {},
  delivery: {}
})
let mentionTimer: ReturnType<typeof setTimeout> | null = null
let mentionGeneration = 0
const selectedModel = computed(() => props.models.find((model) => model.id === props.controls?.model) ?? null)
const thinkingOptions = computed(() => {
  const efforts = (selectedModel.value?.supportEfforts ?? []).filter(isSelectableThinkingEffort)
  if (efforts.length > 0) return efforts
  const fallback = selectableThinkingEffort(props.controls?.thinking)
    ?? selectableThinkingEffort(selectedModel.value?.defaultEffort)
  return fallback === null ? [] : [fallback]
})
const visibleThinkingOptions = computed(() => {
  const candidates = thinkingOptions.value
  if (candidates.length <= 3) return candidates
  return [candidates[0]!, candidates[Math.floor((candidates.length - 1) / 2)]!, candidates.at(-1)!]
})
const selectedThinkingLabel = computed(() => {
  const effort = selectableThinkingEffort(props.controls?.thinking)
  return effort === null ? null : thinkingLabel(effort)
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
const activeListboxId = computed(() => (
  mentionOpen.value ? 'composer-mention-listbox' : commandOpen.value ? 'composer-command-listbox' : undefined
))
const activeOptionId = computed(() => {
  if (mentionOpen.value && mentionItems.value.length > 0) return `composer-mention-option-${mentionActiveIndex.value}`
  if (commandOpen.value && filteredSkills.value.length > 0) return `composer-command-option-${commandActiveIndex.value}`
  return undefined
})
const permissionDescription = computed(() => ({
  manual: '每次敏感操作都由你确认。',
  auto: 'Kimi 可自动批准当前会话中的常规操作。',
  yolo: 'Kimi 可在当前会话中跳过逐次审批。'
}[props.controls?.permissionMode ?? 'manual']))

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
    emit(
      'submit',
      value.value,
      [...attachments.value],
      props.controls,
      props.goalMode === true,
      props.running === true ? deliveryMode.value : 'queue'
    )
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
  const rawEfforts = descriptor?.supportEfforts ?? []
  const efforts = rawEfforts.filter(isSelectableThinkingEffort)
  const current = selectableThinkingEffort(props.controls.thinking)
  const preferred = current === null
    ? null
    : efforts.find((effort) => effort.toLocaleLowerCase() === current.toLocaleLowerCase()) ?? null
  const defaultEffort = selectableThinkingEffort(descriptor?.defaultEffort)
  const thinking = preferred
    ?? (defaultEffort === null
      ? null
      : efforts.find((effort) => effort.toLocaleLowerCase() === defaultEffort.toLocaleLowerCase()) ?? defaultEffort)
    ?? efforts[0]
    ?? (rawEfforts.length > 0 ? rawEfforts[0]! : props.controls.thinking)
  emit('updateControls', { ...props.controls, model, thinking })
}

function updateThinking(thinking: string): void {
  if (props.controls === null) return
  emit('updateControls', { ...props.controls, thinking })
}

function updatePermission(permissionMode: KimiPromptControls['permissionMode']): void {
  if (props.controls === null) return
  if (permissionMode === 'yolo' && props.controls.permissionMode !== 'yolo') {
    pendingPermissionMode.value = permissionMode
    return
  }
  pendingPermissionMode.value = null
  emit('updateControls', { ...props.controls, permissionMode })
}

function confirmPermissionMode(): void {
  if (props.controls === null || pendingPermissionMode.value === null) return
  emit('updateControls', { ...props.controls, permissionMode: pendingPermissionMode.value })
  pendingPermissionMode.value = null
}

function cancelPermissionMode(): void {
  pendingPermissionMode.value = null
}

function setBoolean(key: 'planMode' | 'swarmMode', enabled: boolean): void {
  if (props.controls === null) return
  emit('updateControls', { ...props.controls, [key]: enabled })
}

function disableBooleanMode(key: 'planMode' | 'swarmMode'): void {
  if (props.controls === null) return
  emit('updateControls', { ...props.controls, [key]: false })
}

function toggleCommands(): void {
  commandOpen.value = !commandOpen.value
  deliveryOpen.value = false
  if (commandOpen.value) {
    commandActiveIndex.value = 0
    optionsOpen.value = false
    closeMention()
    void nextTick(() => positionPopover('command'))
  }
}

function toggleSessionControls(): void {
  optionsOpen.value = !optionsOpen.value
  commandOpen.value = false
  deliveryOpen.value = false
  closeMention()
  pendingPermissionMode.value = null
  if (optionsOpen.value) void nextTick(() => positionPopover('options'))
}

function toggleDeliveryMenu(): void {
  deliveryOpen.value = !deliveryOpen.value
  optionsOpen.value = false
  commandOpen.value = false
  closeMention()
  if (deliveryOpen.value) void nextTick(() => positionPopover('delivery'))
}

function selectDeliveryMode(mode: 'queue' | 'steer'): void {
  deliveryMode.value = mode
  deliveryOpen.value = false
  void nextTick(() => input.value?.focus())
}

function onComposerInput(): void {
  if (slashQuery.value !== null && props.disabled !== true) {
    commandOpen.value = true
    commandActiveIndex.value = 0
    optionsOpen.value = false
    deliveryOpen.value = false
    closeMention()
    void nextTick(() => positionPopover('command'))
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
  deliveryOpen.value = false
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

function pastedImageName(mediaType: string): string {
  const subtype = mediaType.split('/')[1]?.split('+')[0] ?? 'png'
  const ext = subtype === 'jpeg' ? 'jpg' : subtype
  const stamp = new Date().toLocaleString('sv-SE').replace(/[-:]/g, '').replace(' ', '-')
  return `粘贴截图-${stamp}.${ext}`
}

async function onPaste(event: ClipboardEvent): Promise<void> {
  if (props.disabled === true) return
  const images = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
  const api = window.kimiAgent
  if (images.length === 0 || api === undefined) return
  /* 剪贴板里有图片时优先作为附件上传，不再按文本粘贴 */
  event.preventDefault()
  attachmentPending.value = true
  attachmentError.value = null
  try {
    for (const item of images) {
      const file = item.getAsFile()
      if (file === null) continue
      const mediaType = file.type || 'image/png'
      const bytes = new Uint8Array(await file.arrayBuffer())
      const uploaded = await api.pasteAttachment({ bytes, name: pastedImageName(mediaType), mediaType })
      if (!attachments.value.some((existing) => existing.fileId === uploaded.fileId)) {
        attachments.value = [...attachments.value, uploaded]
      }
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
  mentionError.value = null
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
  mentionError.value = null
  mentionActiveIndex.value = 0
  commandOpen.value = false
  optionsOpen.value = false
  deliveryOpen.value = false
  mentionTimer = setTimeout(() => {
    mentionTimer = null
    void search(token.query).then((items) => {
      if (generation !== mentionGeneration) return
      mentionItems.value = items.slice(0, 20)
      mentionActiveIndex.value = 0
    }).catch(() => {
      if (generation === mentionGeneration) {
        mentionItems.value = []
        mentionError.value = '无法读取项目文件，请重试。'
      }
    }).finally(() => {
      if (generation === mentionGeneration) {
        mentionLoading.value = false
        void nextTick(() => positionPopover('mention'))
      }
    })
  }, 200)
  void nextTick(() => positionPopover('mention'))
}

function retryMentionSearch(): void {
  queueMentionSearch()
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
  const suffix = value.value.slice(token.end)
  const separator = /^\s/.test(suffix) ? '' : ' '
  value.value = `${value.value.slice(0, token.start)}${item.path}${separator}${suffix}`
  closeMention()
  void nextTick(() => {
    const caret = token.start + item.path.length + separator.length
    input.value?.setSelectionRange(caret, caret)
    input.value?.focus()
  })
}

function mentionIcon(item: WorkspaceFileSearchItem) {
  return item.kind === 'directory' ? PhFolderOpen : PhFile
}

function thinkingLabel(effort: string): string {
  return {
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '超高',
    max: '最高'
  }[effort.trim().toLocaleLowerCase()] ?? effort
}

function isSelectableThinkingEffort(effort: string): boolean {
  return selectableThinkingEffort(effort) !== null
}

function selectableThinkingEffort(effort: string | null | undefined): string | null {
  const normalized = effort?.trim() ?? ''
  return normalized.length < 1 || normalized.toLocaleLowerCase() === 'off' ? null : normalized
}

function skillSourceLabel(source: KimiSkill['source']): string {
  return {
    project: '项目',
    user: '个人',
    extra: '扩展',
    builtin: '内置'
  }[source]
}

function positionPopover(kind: PopoverKind): void {
  const trigger = kind === 'options'
    ? modelTrigger.value
    : kind === 'command'
      ? commandTrigger.value
      : kind === 'mention'
        ? mentionTrigger.value
        : deliveryTrigger.value
  if (trigger === null) return
  const rect = trigger.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const preferredWidth = kind === 'options' ? 344 : kind === 'command' ? 420 : kind === 'mention' ? 460 : 250
  const width = Math.max(240, Math.min(preferredWidth, viewportWidth - 16))
  const alignedLeft = kind === 'options' ? rect.right - width : rect.left
  const left = Math.max(8, Math.min(alignedLeft, viewportWidth - width - 8))
  const spaceAbove = Math.max(0, rect.top - 8)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - 8)
  const placeAbove = spaceAbove >= Math.min(260, spaceBelow) || spaceAbove >= spaceBelow
  const availableHeight = Math.max(140, (placeAbove ? spaceAbove : spaceBelow) - 8)
  popoverStyles.value[kind] = {
    left: `${Math.round(left)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(availableHeight)}px`,
    ...(placeAbove
      ? { top: 'auto', bottom: `${Math.round(viewportHeight - rect.top + 8)}px` }
      : { top: `${Math.round(rect.bottom + 8)}px`, bottom: 'auto' })
  }
}

function positionOpenPopovers(): void {
  if (optionsOpen.value) positionPopover('options')
  if (commandOpen.value) positionPopover('command')
  if (mentionOpen.value) positionPopover('mention')
  if (deliveryOpen.value) positionPopover('delivery')
}

function closeComposerPopovers(): void {
  optionsOpen.value = false
  commandOpen.value = false
  deliveryOpen.value = false
  pendingPermissionMode.value = null
  closeMention()
}

function onDocumentPointerdown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node) || composerRoot.value?.contains(target)) return
  if (optionsOpen.value || commandOpen.value || mentionOpen.value || deliveryOpen.value) closeComposerPopovers()
}

function onDocumentFocusin(event: FocusEvent): void {
  const target = event.target
  if (!(target instanceof Node) || composerRoot.value?.contains(target)) return
  if (optionsOpen.value || commandOpen.value || mentionOpen.value || deliveryOpen.value) closeComposerPopovers()
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
  if (commandOpen.value) {
    const count = filteredSkills.value.length
    if (event.key === 'Escape') {
      event.preventDefault()
      commandOpen.value = false
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (count > 0) {
        commandActiveIndex.value = event.key === 'ArrowDown'
          ? (commandActiveIndex.value + 1) % count
          : (commandActiveIndex.value - 1 + count) % count
      }
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      if (count > 0) commandActiveIndex.value = event.key === 'Home' ? 0 : count - 1
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const skill = filteredSkills.value[commandActiveIndex.value]
      if (event.key === 'Enter') event.preventDefault()
      if (skill !== undefined && !props.skillsPending) {
        event.preventDefault()
        chooseSkill(skill)
        return
      }
      if (event.key === 'Enter') return
    }
  }
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return
  if (
    event.key !== 'Escape' ||
    (!optionsOpen.value && !commandOpen.value && !mentionOpen.value && !deliveryOpen.value)
  ) return
  event.preventDefault()
  closeComposerPopovers()
  void nextTick(() => input.value?.focus())
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  window.addEventListener('resize', positionOpenPopovers)
  document.addEventListener('scroll', positionOpenPopovers, true)
  document.addEventListener('pointerdown', onDocumentPointerdown, true)
  document.addEventListener('focusin', onDocumentFocusin, true)
})
onBeforeUnmount(() => {
  closeMention()
  window.removeEventListener('keydown', onWindowKeydown)
  window.removeEventListener('resize', positionOpenPopovers)
  document.removeEventListener('scroll', positionOpenPopovers, true)
  document.removeEventListener('pointerdown', onDocumentPointerdown, true)
  document.removeEventListener('focusin', onDocumentFocusin, true)
})

watch(() => props.running, (running) => {
  if (running === true) return
  deliveryMode.value = 'queue'
  deliveryOpen.value = false
})
</script>

<template>
  <div ref="composerRoot" class="composer-wrap" :class="{ 'is-disabled': disabled }">
    <div v-if="attachments.length > 0 || attachmentPending" class="composer-attachments" aria-label="待发送附件">
      <div v-for="file in attachments" :key="file.fileId" class="composer-attachment-chip">
        <PhImage v-if="file.mediaType.startsWith('image/')" :size="15" />
        <PhFile v-else :size="15" />
        <span><strong>{{ file.name }}</strong><small>{{ formattedSize(file.size) }}</small></span>
        <button type="button" :aria-label="`移除附件 ${file.name}`" @click="removeAttachment(file)"><PhX :size="13" /></button>
      </div>
      <div v-if="attachmentPending" class="composer-attachment-chip is-loading"><PhSpinnerGap class="spin" :size="15" /><span>正在上传到 Kimi…</span></div>
    </div>
    <div v-if="attachmentError" class="composer-attachment-error" role="alert">{{ attachmentError }}</div>
    <div class="composer-input-area">
      <textarea
        ref="input"
        v-model="value"
        rows="1"
        :placeholder="disabled ? disabledReason : goalMode ? '描述需要持续完成的目标…' : '描述你的任务或问题…'"
        :disabled="disabled"
        aria-label="输入任务"
        aria-autocomplete="list"
        :aria-expanded="commandOpen || mentionOpen"
        :aria-controls="activeListboxId"
        :aria-activedescendant="activeOptionId"
        :aria-haspopup="commandOpen || mentionOpen ? 'listbox' : undefined"
        @keydown="onKeydown"
        @input="onComposerInput"
        @paste="onPaste"
      />
    </div>
    <div class="composer-actions">
      <div class="composer-primary-tools">
        <button type="button" aria-label="添加附件" :disabled="disabled || attachmentPending" @click="pickAttachments"><PhPaperclip :size="19" /></button>
        <button
          ref="mentionTrigger"
          type="button"
          aria-label="引用文件"
          :aria-expanded="mentionOpen"
          aria-haspopup="listbox"
          aria-controls="composer-mention-listbox"
          :disabled="disabled || mentionSearch === undefined"
          @click="insertMentionTrigger"
        ><PhAt :size="19" /></button>
        <button
          ref="commandTrigger"
          type="button"
          aria-label="使用命令"
          class="slash-button"
          :aria-expanded="commandOpen"
          aria-haspopup="listbox"
          aria-controls="composer-command-listbox"
          :disabled="disabled"
          @click="toggleCommands"
        >/</button>
        <button class="terminal-entry" type="button" aria-label="打开终端" title="终端 · ⌘J" :disabled="terminalEnabled !== true" @click="emit('toggleTerminal')">
          <PhTerminalWindow :size="19" />
        </button>
      </div>
      <div class="composer-settings">
        <div v-if="controls?.planMode || goalMode || controls?.swarmMode" class="composer-mode-chips" aria-label="已启用模式">
          <button v-if="controls?.planMode" type="button" aria-label="关闭规划模式" @click="disableBooleanMode('planMode')">
            <span>规划</span><PhX :size="11" />
          </button>
          <button v-if="goalMode" type="button" aria-label="关闭目标模式" @click="emit('updateGoalMode', false)">
            <span>目标</span><PhX :size="11" />
          </button>
          <button v-if="controls?.swarmMode" type="button" aria-label="关闭 Swarm 模式" @click="disableBooleanMode('swarmMode')">
            <span>协作</span><PhX :size="11" />
          </button>
        </div>
        <button
          ref="modelTrigger"
          class="model-summary"
          type="button"
          :disabled="disabled"
          :aria-expanded="optionsOpen"
          aria-haspopup="dialog"
          aria-controls="composer-session-controls"
          aria-label="会话模型与执行设置"
          @click="toggleSessionControls"
        >
          <span>{{ selectedModel?.displayName ?? controls?.model ?? (controlsPending ? '读取模型…' : '未配置模型') }}</span>
          <span v-if="selectedThinkingLabel !== null" class="model-effort-chip">{{ selectedThinkingLabel }}</span>
          <PhCaretDown :size="12" />
        </button>
        <button
          v-if="running"
          ref="deliveryTrigger"
          class="delivery-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-controls="composer-delivery-listbox"
          :aria-expanded="deliveryOpen"
          :aria-label="deliveryMode === 'steer' ? '发送方式：引导当前任务' : '发送方式：加入队列'"
          :title="deliveryMode === 'steer' ? '立即补充给当前任务' : '当前任务完成后发送'"
          @click="toggleDeliveryMenu"
        >
          <span>{{ deliveryMode === 'steer' ? '引导' : '排队' }}</span>
          <PhCaretDown :size="11" />
        </button>
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
          :aria-label="running ? (deliveryMode === 'steer' ? '发送引导' : '加入队列') : '发送任务'"
          :disabled="disabled || pending || activationPending || attachmentPending || controls === null || (value.trim().length === 0 && attachments.length === 0) || (goalMode && value.trim().length === 0)"
          @click="submit"
        >
          <PhPaperPlaneTilt :size="19" weight="fill" />
        </button>
      </div>
    </div>
    <div
      v-if="running && deliveryOpen"
      id="composer-delivery-listbox"
      class="delivery-popover"
      role="listbox"
      aria-label="新消息发送方式"
      :style="popoverStyles.delivery"
    >
      <button
        type="button"
        role="option"
        :class="{ 'is-selected': deliveryMode === 'steer' }"
        :aria-selected="deliveryMode === 'steer'"
        @click="selectDeliveryMode('steer')"
      >
        <span><strong>引导当前任务</strong><small>立即补充给正在执行的 Kimi</small></span>
        <i aria-hidden="true" />
      </button>
      <button
        type="button"
        role="option"
        :class="{ 'is-selected': deliveryMode === 'queue' }"
        :aria-selected="deliveryMode === 'queue'"
        @click="selectDeliveryMode('queue')"
      >
        <span><strong>加入队列</strong><small>当前任务完成后再发送</small></span>
        <i aria-hidden="true" />
      </button>
    </div>
    <div
      v-if="optionsOpen"
      id="composer-session-controls"
      class="composer-popover"
      role="dialog"
      aria-label="会话模型与执行设置"
      :style="popoverStyles.options"
    >
      <header class="composer-popover-header">
        <div><strong>模型与执行</strong><small>应用于当前 Session</small></div>
      </header>
      <div class="composer-popover-section">
        <label class="composer-model-row">
          <span><strong>模型</strong><small>决定本次会话使用的能力</small></span>
          <select :value="controls?.model" :disabled="disabled || controls === null" @change="updateModel">
            <option v-for="model in models" :key="model.id" :value="model.id">{{ model.displayName }}</option>
          </select>
        </label>
        <div v-if="visibleThinkingOptions.length > 0" class="composer-control-block">
          <div class="composer-control-heading"><strong>思考强度</strong><small>更高强度适合复杂任务</small></div>
          <div class="composer-segments" role="radiogroup" aria-label="思考强度">
            <button
              v-for="effort in visibleThinkingOptions"
              :key="effort"
              type="button"
              role="radio"
              :class="{ 'is-selected': controls?.thinking === effort }"
              :aria-checked="controls?.thinking === effort"
              :disabled="disabled || controls === null"
              @click="updateThinking(effort)"
            >{{ thinkingLabel(effort) }}</button>
          </div>
        </div>
      </div>
      <div id="composer-advanced-controls" class="composer-advanced-controls">
        <div class="composer-section-label"><strong>高级执行</strong><small>无需展开，直接调整</small></div>
        <div class="composer-control-block composer-permission-row">
          <div class="composer-control-heading"><strong>执行审批</strong><small>{{ permissionDescription }}</small></div>
          <div class="composer-segments" role="radiogroup" aria-label="执行审批">
            <button type="button" role="radio" :class="{ 'is-selected': controls?.permissionMode === 'manual' }" :aria-checked="controls?.permissionMode === 'manual'" :disabled="disabled || controls === null" @click="updatePermission('manual')">手动</button>
            <button type="button" role="radio" :class="{ 'is-selected': controls?.permissionMode === 'auto' }" :aria-checked="controls?.permissionMode === 'auto'" :disabled="disabled || controls === null" @click="updatePermission('auto')">自动</button>
            <button type="button" role="radio" :class="{ 'is-selected': controls?.permissionMode === 'yolo' }" :aria-checked="controls?.permissionMode === 'yolo'" :disabled="disabled || controls === null" @click="updatePermission('yolo')">完全自动</button>
          </div>
        </div>
        <div v-if="pendingPermissionMode === 'yolo'" class="composer-permission-warning" role="alert">
          <strong>完全自动会跳过逐次审批</strong>
          <span>该设置应用于当前 Session 的后续操作。</span>
          <div>
            <button type="button" @click="cancelPermissionMode">保持当前设置</button>
            <button class="is-danger" type="button" @click="confirmPermissionMode">启用完全自动</button>
          </div>
        </div>
        <button class="composer-toggle-row" type="button" role="switch" :class="{ 'is-selected': controls?.planMode }" :aria-checked="controls?.planMode" :disabled="disabled || controls === null" @click="setBoolean('planMode', !controls?.planMode)">
          <span><strong>规划模式</strong><small>先形成计划，再开始执行</small></span>
          <i aria-hidden="true"><b /></i>
        </button>
        <button class="composer-toggle-row" type="button" role="switch" :class="{ 'is-selected': goalMode }" :aria-checked="goalMode" :disabled="disabled" @click="emit('updateGoalMode', !goalMode)">
          <span><strong>目标模式</strong><small>将下一条消息设为持续目标</small></span>
          <i aria-hidden="true"><b /></i>
        </button>
        <button class="composer-toggle-row" type="button" role="switch" :class="{ 'is-selected': controls?.swarmMode }" :aria-checked="controls?.swarmMode" :disabled="disabled || controls === null" @click="setBoolean('swarmMode', !controls?.swarmMode)">
          <span><strong>协作模式</strong><small>让多个 Agent 在当前任务中协作</small></span>
          <i aria-hidden="true"><b /></i>
        </button>
      </div>
    </div>

    <div
      v-if="commandOpen"
      id="composer-command-listbox"
      class="command-popover"
      role="listbox"
      aria-label="Kimi 技能"
      :style="popoverStyles.command"
    >
      <header><strong>技能</strong><span>选择后可继续输入参数</span></header>
      <div v-if="skillsPending" class="command-empty">正在读取 Kimi 技能…</div>
      <div v-else-if="skills.length === 0" class="command-empty">当前会话没有可用技能</div>
      <div v-else-if="filteredSkills.length === 0" class="command-empty">没有匹配的技能</div>
      <template v-else>
        <button
          v-for="(skill, index) in filteredSkills"
          :key="skill.name"
          :id="`composer-command-option-${index}`"
          type="button"
          role="option"
          :class="{ active: index === commandActiveIndex }"
          :aria-selected="index === commandActiveIndex"
          tabindex="-1"
          @mouseenter="commandActiveIndex = index"
          @click="chooseSkill(skill)"
        >
          <span><strong>/{{ skill.name }}</strong><small>{{ skill.description || '无描述' }}</small></span>
          <em>{{ skillSourceLabel(skill.source) }}</em>
        </button>
      </template>
    </div>

    <div
      v-if="mentionOpen"
      id="composer-mention-listbox"
      class="mention-popover"
      role="listbox"
      aria-label="项目文件引用"
      :style="popoverStyles.mention"
    >
      <header><strong>项目文件</strong><span>选择后插入路径</span></header>
      <div v-if="mentionLoading" class="command-empty"><PhSpinnerGap class="spin" :size="15" />正在搜索 Kimi 工作区…</div>
      <div v-else-if="mentionError" class="command-empty is-error" role="alert">
        <span>{{ mentionError }}</span>
        <button type="button" @click="retryMentionSearch">重试</button>
      </div>
      <div v-else-if="mentionItems.length === 0" class="command-empty">没有匹配的文件</div>
      <template v-else>
        <div
          v-for="(item, index) in mentionItems"
          :key="item.path"
          :id="`composer-mention-option-${index}`"
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
