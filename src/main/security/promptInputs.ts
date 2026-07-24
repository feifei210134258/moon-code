import type {
  KimiPromptControls,
  KimiPromptInput,
  KimiSideChatPromptInput,
  KimiUploadedFile
} from '../../shared/contracts.js'

const MAX_PROMPT_TEXT = 200_000
const MAX_MODEL_ID = 512
const MAX_THINKING_ID = 64
const MAX_ATTACHMENTS = 32

export function validatePromptControls(value: unknown): KimiPromptControls {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi prompt controls')
  const model = shortString(value.model, MAX_MODEL_ID, 'model')
  const thinking = shortString(value.thinking, MAX_THINKING_ID, 'thinking effort')
  const permissionMode = value.permissionMode
  if (permissionMode !== 'manual' && permissionMode !== 'auto' && permissionMode !== 'yolo') {
    throw new TypeError('Invalid Kimi permission mode')
  }
  if (typeof value.planMode !== 'boolean' || typeof value.swarmMode !== 'boolean') {
    throw new TypeError('Invalid Kimi prompt modes')
  }
  return {
    model,
    thinking,
    permissionMode,
    planMode: value.planMode,
    swarmMode: value.swarmMode
  }
}

export function validatePromptInput(value: unknown): KimiPromptInput {
  if (!isRecord(value)) throw new TypeError('Invalid Kimi prompt')
  const attachments = value.attachments === undefined ? [] : validatePromptAttachments(value.attachments)
  if (
    typeof value.text !== 'string' ||
    value.text.length > MAX_PROMPT_TEXT ||
    (value.text.trim().length < 1 && attachments.length === 0)
  ) {
    throw new TypeError('Invalid Kimi prompt text')
  }
  const goalObjective = value.goalObjective
  if (
    goalObjective !== undefined &&
    (typeof goalObjective !== 'string' || goalObjective.trim().length < 1 || goalObjective.length > MAX_PROMPT_TEXT)
  ) throw new TypeError('Invalid Kimi goal objective')
  return {
    text: value.text,
    controls: validatePromptControls(value.controls),
    ...(attachments.length === 0 ? {} : { attachments }),
    ...(goalObjective === undefined ? {} : { goalObjective: goalObjective.trim() })
  }
}

export function validateSideChatPromptInput(value: unknown): KimiSideChatPromptInput {
  const input = validatePromptInput(value)
  if (input.attachments !== undefined || input.goalObjective !== undefined) {
    throw new TypeError('Kimi Side Chat only accepts text prompts')
  }
  return { text: input.text, controls: input.controls }
}

export function validatePromptAttachments(value: unknown): KimiUploadedFile[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) {
    throw new TypeError('Invalid Kimi prompt attachments')
  }
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError('Invalid Kimi prompt attachment')
    const size = item.size
    if (!Number.isSafeInteger(size) || (size as number) < 0) throw new TypeError('Invalid Kimi attachment size')
    return {
      fileId: shortString(item.fileId, 256, 'attachment file id'),
      name: shortString(item.name, 512, 'attachment name'),
      mediaType: validateMediaType(item.mediaType),
      size: size as number
    }
  })
}

export function validateMediaType(value: unknown): string {
  const mediaType = shortString(value, 256, 'attachment media type').toLowerCase()
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:\s*;\s*[a-z0-9!#$&^_.+-]+=[a-z0-9!#$&^_.+"-]+)*$/i.test(mediaType)) {
    throw new TypeError('Invalid Kimi attachment media type')
  }
  return mediaType
}

function shortString(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length < 1 || value.length > max) {
    throw new TypeError(`Invalid Kimi ${label}`)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
