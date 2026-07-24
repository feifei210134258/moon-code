export interface RuntimeReadyInfo {
  origin: string
  token: string
}

const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g

export function parseRuntimeReadyOutput(output: string): RuntimeReadyInfo | null {
  const plain = output.replace(ANSI_ESCAPE, '')
  const match = plain.match(/Kimi server:\s+(https?:\/\/[^\s#]+)#token=([^\s]+)/)
  if (match?.[1] === undefined || match[2] === undefined) {
    return null
  }

  return {
    origin: match[1].replace(/\/$/, ''),
    token: decodeURIComponent(match[2])
  }
}

export function redactRuntimeOutput(output: string): string {
  return output
    .replace(ANSI_ESCAPE, '')
    .replace(/(#token=)[^\s]+/g, '$1[redacted]')
    .replace(/(^|\n)(\s*Token:\s*)[^\s]+/gi, '$1$2[redacted]')
}
