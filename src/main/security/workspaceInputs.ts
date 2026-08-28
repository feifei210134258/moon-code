const MAX_WORKSPACE_PATH_LENGTH = 4_096

export function validateWorkspacePath(
  value: unknown,
  options: { allowRoot?: boolean; allowAbsolute?: boolean } = {}
): string {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > MAX_WORKSPACE_PATH_LENGTH ||
    value.includes('\0')
  ) throw new TypeError('Invalid Kimi workspace path')

  const path = value.replace(/\\/g, '/')
  const normalized = path.replace(/^\.\//, '') || '.'
  /* kimi 0.39 工具事件（file_io/diff display.path）携带工作区绝对路径；
     允许它通过输入校验，是否真的落在工作区内由 KimiSessionBridge /
     WorkspacePreviewServer 的越界检查把关。 */
  const absolute = path.startsWith('/') || /^[A-Za-z]:\//.test(path)
  if (
    (absolute && options.allowAbsolute !== true) ||
    path.split('/').some((segment) => segment === '..') ||
    (!options.allowRoot && normalized === '.')
  ) throw new TypeError('Invalid Kimi workspace path')

  return normalized
}
