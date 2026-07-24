import { pathToFileURL } from 'node:url'

export function rendererEntryUrl(filePath: string): string {
  return pathToFileURL(filePath).toString()
}

export function isTrustedRendererUrl(candidateUrl: string, trustedEntryUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const trusted = new URL(trustedEntryUrl)

    if (trusted.protocol === 'file:') {
      return candidate.protocol === 'file:' && candidate.pathname === trusted.pathname
    }

    return candidate.protocol === trusted.protocol && candidate.origin === trusted.origin
  } catch {
    return false
  }
}
