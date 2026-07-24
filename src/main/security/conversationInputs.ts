const MAX_COMPACT_INSTRUCTION_LENGTH = 4_000
const MAX_MARKDOWN_IMAGE_SOURCE_LENGTH = 4_096

export function validateCompactInstruction(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > MAX_COMPACT_INSTRUCTION_LENGTH || value.includes('\0')) {
    throw new TypeError('Invalid Kimi compact instruction')
  }
  const instruction = value.trim()
  return instruction.length === 0 ? undefined : instruction
}

export function validateUndoCount(value: unknown): number {
  if (value === undefined) return 1
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 100) {
    throw new TypeError('Invalid Kimi undo count')
  }
  return Number(value)
}

export function validateMarkdownImageSource(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_MARKDOWN_IMAGE_SOURCE_LENGTH ||
    value.includes('\0') ||
    /^(?:https?:|data:|blob:)/i.test(value)
  ) throw new TypeError('Invalid Kimi Markdown image source')
  return value
}
