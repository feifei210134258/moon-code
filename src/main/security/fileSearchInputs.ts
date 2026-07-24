import type { WorkspaceOpenApp } from '../../shared/contracts.js'

const MAX_FILE_QUERY_LENGTH = 512
const OPEN_APPS = new Set<WorkspaceOpenApp>(['finder', 'cursor', 'vscode', 'iterm', 'terminal'])

export function validateFileSearchQuery(value: unknown, label: 'search' | 'grep'): string {
  if (typeof value !== 'string' || value.length > MAX_FILE_QUERY_LENGTH || value.includes('\0')) {
    throw new TypeError(`Invalid Kimi file ${label} query`)
  }
  const query = value.trim()
  if (query.length === 0) throw new TypeError(`Invalid Kimi file ${label} query`)
  return query
}

export function validateWorkspaceOpenApp(value: unknown): WorkspaceOpenApp {
  if (typeof value !== 'string' || !OPEN_APPS.has(value as WorkspaceOpenApp)) {
    throw new TypeError('Invalid Kimi workspace open app')
  }
  return value as WorkspaceOpenApp
}

export function validateWorkspaceLine(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10_000_000) {
    throw new TypeError('Invalid Kimi workspace line')
  }
  return Number(value)
}
