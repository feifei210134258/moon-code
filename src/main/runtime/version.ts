import semver from 'semver'

export const SUPPORTED_KIMI_RANGE = '>=0.29.2'
export const MANAGED_KIMI_VERSION = '0.29.2'

export function parseKimiVersion(output: string): string | null {
  const match = output.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/)
  return match?.[1] ?? null
}

export function isSupportedKimiVersion(version: string | null): boolean {
  return version !== null && semver.satisfies(version, SUPPORTED_KIMI_RANGE, { includePrerelease: false })
}
