import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import type { RuntimeCandidate, RuntimeDiscovery } from '../../shared/contracts.js'
import {
  MANAGED_KIMI_VERSION,
  SUPPORTED_KIMI_RANGE,
  isSupportedKimiVersion,
  parseKimiVersion
} from './version.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

async function locateSystemKimi(): Promise<string | null> {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  try {
    const { stdout } = await execFileAsync(locator, ['kimi'], { timeout: 3_000 })
    return stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
  } catch {
    return null
  }
}

async function inspectSystemKimi(executable: string | null): Promise<RuntimeCandidate> {
  if (executable === null) {
    return {
      kind: 'system',
      version: null,
      executable: null,
      compatible: false,
      reason: '未发现系统 Kimi Code'
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, ['--version'], { timeout: 5_000 })
    const version = parseKimiVersion(`${stdout}\n${stderr}`)
    return {
      kind: 'system',
      version,
      executable,
      compatible: isSupportedKimiVersion(version),
      reason: isSupportedKimiVersion(version)
        ? null
        : `系统版本 ${version ?? '未知'} 不在支持区间 ${SUPPORTED_KIMI_RANGE}`
    }
  } catch (error) {
    return {
      kind: 'system',
      version: null,
      executable,
      compatible: false,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

export function resolveManagedKimiEntry(): string {
  return require.resolve('@moonshot-ai/kimi-code/dist/main.mjs')
}

export async function discoverRuntimes(): Promise<RuntimeDiscovery> {
  const managedEntry = resolveManagedKimiEntry()
  const systemExecutable = await locateSystemKimi()
  const system = await inspectSystemKimi(systemExecutable)

  return {
    supportedRange: SUPPORTED_KIMI_RANGE,
    managed: {
      kind: 'managed',
      version: MANAGED_KIMI_VERSION,
      executable: managedEntry,
      compatible: true,
      reason: null
    },
    system
  }
}
