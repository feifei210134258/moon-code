const MAX_WORKSPACE_PATH_LENGTH = 4_096

export function validateWorkspacePath(value: unknown, options: { allowRoot?: boolean } = {}): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_WORKSPACE_PATH_LENGTH ||
    value.includes('\0')
  ) throw new TypeError('Invalid Kimi workspace path')

  const path = value.replace(/\\/g, '/')
  const normalized = path.replace(/^\.\//, '') || '.'
  if (
    path.startsWith('/') ||
    path.startsWith('//') ||
    /^[A-Za-z]:\//.test(path) ||
    path.split('/').some((segment) => segment === '..') ||
    (!options.allowRoot && normalized === '.')
  ) throw new TypeError('Invalid Kimi workspace path')

  return normalized
}
