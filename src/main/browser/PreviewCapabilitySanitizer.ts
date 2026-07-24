export class PreviewCapabilitySanitizer {
  readonly #entries = new Map<string, { workspaceId: string; host: string; hostname: string; token: string }>()

  register(origin: string, workspaceId: string): void {
    const url = new URL(origin)
    const token = url.hostname.split('.')[0] ?? ''
    this.#entries.set(url.origin, {
      workspaceId,
      host: url.host,
      hostname: url.hostname,
      token
    })
  }

  workspaceForOrigin(origin: string): string | undefined {
    return this.#entries.get(origin)?.workspaceId
  }

  sanitize(value: string): string {
    let result = value
    for (const [origin, entry] of this.#entries) {
      const displayOrigin = `preview://${encodeURIComponent(entry.workspaceId)}`
      result = result.replaceAll(origin, displayOrigin)
      result = result.replaceAll(entry.host, `${encodeURIComponent(entry.workspaceId)}.preview`)
      result = result.replaceAll(entry.hostname, `${encodeURIComponent(entry.workspaceId)}.preview`)
      if (entry.token.length > 0) result = result.replaceAll(entry.token, '[preview-capability]')
    }
    return result
  }

  clear(): void {
    this.#entries.clear()
  }
}
