export interface WorkspaceFileReference {
  path: string
  line?: number
}

export function normalizeWorkspaceFileReference(reference: string): WorkspaceFileReference {
  const value = reference.trim().replace(/^`+|`+$/g, '')
  const match = /^(.*\.[^./:\s]+):(\d+)(?::\d+)?$/.exec(value)
  return {
    path: match?.[1] ?? value,
    ...(match?.[2] === undefined ? {} : { line: Number(match[2]) })
  }
}

export function workspaceFilePathFromHref(href: string): string | null {
  const value = href.trim()
  if (
    value.length === 0 ||
    value.startsWith('#') ||
    value.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/i.test(value)
  ) return null

  let decoded: string
  try {
    decoded = decodeURI(value)
  } catch {
    return null
  }
  const path = decoded.split(/[?#]/, 1)[0] ?? ''
  if (path.length === 0 || path.split('/').some((part) => part === '..')) return null
  return normalizeWorkspaceFileReference(path).path
}

export function workspaceFileDestination(reference: string): 'browser' | 'files' {
  return /\.html?$/i.test(normalizeWorkspaceFileReference(reference).path) ? 'browser' : 'files'
}
