export function workspaceFileDestination(path: string): 'browser' | 'files' {
  return /\.html?$/i.test(path) ? 'browser' : 'files'
}
