const MAX_ID_LENGTH = 256
const MAX_SKILL_ARGS_LENGTH = 100_000

export function validateCapabilityId(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_ID_LENGTH ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw new TypeError(`Invalid Kimi ${label}`)
  }
  return value
}

export function validateOptionalSkillArgs(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > MAX_SKILL_ARGS_LENGTH || value.includes('\0')) {
    throw new TypeError('Invalid Kimi skill arguments')
  }
  return value
}

export function validateOptionalSessionId(value: unknown): string | undefined {
  return value === undefined ? undefined : validateCapabilityId(value, 'session id')
}
