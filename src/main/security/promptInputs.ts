import type {
  KimiAttachmentPasteInput,
  KimiPromptControls,
  KimiPromptInput,
  KimiPromptSkill,
  KimiSideChatPromptInput,
  KimiUploadedFile
} from '../../shared/contracts.js'
import { sanitizePickedElements } from '../browser/elementPickSanitize.js'

const MAX_PROMPT_TEXT = 200_000
const MAX_MODEL_ID = 512
const MAX_THINKING_ID = 64
const MAX_ATTACHMENTS = 32
const MAX_SUBMITTED_SKILLS = 32
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024

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
  const goalObjective = value.goalObjective
  if (
    goalObjective !== undefined &&
    (typeof goalObjective !== 'string' || goalObjective.trim().length < 1 || goalObjective.length > MAX_PROMPT_TEXT)
  ) throw new TypeError('Invalid Kimi goal objective')
  const deliveryMode = value.deliveryMode
  if (deliveryMode !== undefined && deliveryMode !== 'queue' && deliveryMode !== 'steer') {
    throw new TypeError('Invalid Kimi prompt delivery mode')
  }
  const webElements = value.webElements === undefined
    ? undefined
    : sanitizePickedElements(value.webElements, (item) => String(item), (item) => String(item))
  const skills = value.skills === undefined ? undefined : validatePromptSkills(value.skills)
  const text = value.text
  const hasWebElements = webElements !== undefined && webElements.length > 0
  const hasSkills = skills !== undefined && skills.length > 0
  if (
    typeof text !== 'string' ||
    text.length > MAX_PROMPT_TEXT ||
    (text.trim().length < 1 && attachments.length === 0 && !hasWebElements && !hasSkills)
  ) {
    throw new TypeError('Invalid Kimi prompt text')
  }
  return {
    text,
    controls: validatePromptControls(value.controls),
    ...(attachments.length === 0 ? {} : { attachments }),
    ...(webElements === undefined || webElements.length === 0 ? {} : { webElements }),
    ...(skills === undefined || skills.length === 0 ? {} : { skills }),
    ...(goalObjective === undefined ? {} : { goalObjective: goalObjective.trim() }),
    ...(deliveryMode === undefined ? {} : { deliveryMode })
  }
}

function validatePromptSkills(value: unknown): KimiPromptSkill[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SUBMITTED_SKILLS) {
    throw new TypeError('Invalid Kimi prompt skills')
  }
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError('Invalid Kimi prompt skill')
    const args = item.args
    if (args !== undefined && (typeof args !== 'string' || args.length > MAX_PROMPT_TEXT)) {
      throw new TypeError('Invalid Kimi prompt skill args')
    }
    return {
      name: shortString(item.name, MAX_MODEL_ID, 'skill name'),
      ...(args === undefined || args.trim().length === 0 ? {} : { args })
    }
  })
}

export function validateSideChatPromptInput(value: unknown): KimiSideChatPromptInput {
  const input = validatePromptInput(value)
  if (
    input.attachments !== undefined || input.goalObjective !== undefined ||
    input.deliveryMode !== undefined || input.webElements !== undefined
  ) {
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

export function validatePastedAttachment(value: unknown): KimiAttachmentPasteInput {
  if (!isRecord(value)) throw new TypeError('Invalid pasted Kimi attachment')
  const mediaType = validateMediaType(value.mediaType)
  if (!mediaType.startsWith('image/')) throw new TypeError('Only images can be pasted as Kimi attachments')
  const name = shortString(value.name, 512, 'pasted attachment name')
  const bytes = value.bytes
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PASTED_IMAGE_BYTES) {
    throw new TypeError('Invalid pasted attachment bytes')
  }
  return { name, mediaType, bytes }
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
