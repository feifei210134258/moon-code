export function validateWorkspaceId(value: unknown): string {
  return boundedId(value, 'workspace')
}

export function validateLifecycleSessionId(value: unknown): string {
  return boundedId(value, 'session')
}

export function validateWorkspaceName(value: unknown): string {
  return boundedName(value, 'workspace', 100)
}

export function validateSessionTitle(value: unknown): string {
  return boundedName(value, 'session', 500)
}

function boundedId(value: unknown, kind: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || value.includes('\0')) {
    throw new TypeError(`Invalid Kimi ${kind} id`)
  }
  return value
}

function boundedName(value: unknown, kind: string, max: number): string {
  const name = typeof value === 'string' ? value.trim() : ''
  if (name.length < 1 || name.length > max || name.includes('\0')) {
    throw new TypeError(`Invalid Kimi ${kind} name`)
  }
  return name
}
