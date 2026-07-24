const MAX_TERMINAL_INPUT_BYTES = 64 * 1024

export function assertTerminalId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.includes('\0')) {
    throw new TypeError('Invalid Kimi terminal id')
  }
}

export function validateTerminalSizeInput(value: unknown): { cols: number; rows: number } {
  if (value === undefined) return { cols: 120, rows: 32 }
  if (!isRecord(value)) throw new TypeError('Invalid Kimi terminal size')
  return validateTerminalSize(value.cols, value.rows)
}

export function validateTerminalSize(cols: unknown, rows: unknown): { cols: number; rows: number } {
  if (
    !Number.isSafeInteger(cols) ||
    !Number.isSafeInteger(rows) ||
    (cols as number) < 2 ||
    (cols as number) > 500 ||
    (rows as number) < 1 ||
    (rows as number) > 200
  ) throw new TypeError('Invalid Kimi terminal size')
  return { cols: cols as number, rows: rows as number }
}

export function validateTerminalSinceSeq(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new TypeError('Invalid Kimi terminal sequence')
  }
  return value as number
}

export function validateTerminalInput(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    Buffer.byteLength(value, 'utf8') > MAX_TERMINAL_INPUT_BYTES
  ) throw new TypeError('Invalid Kimi terminal input')
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
