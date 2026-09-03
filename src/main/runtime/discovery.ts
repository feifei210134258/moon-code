import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { homedir } from 'node:os'
import { posix } from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import type { RuntimeCandidate, RuntimeDiscovery } from '../../shared/contracts.js'
import {
  SUPPORTED_KIMI_RANGE,
  isSupportedKimiVersion,
  parseKimiVersion
} from './version.js'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

export function systemKimiFallbackPaths(
  homeDirectory = homedir(),
  platform = process.platform
): string[] {
  if (platform !== 'darwin') return []
  // 返回的是 darwin 平台的路径，分隔符不随宿主平台变化：先归一化 home 里的
  // 分隔符再交给 posix.join（传入 win32 形状的 home 也不会混出反斜杠）。
  return [posix.join(homeDirectory.replace(/[\\/]+/g, '/'), '.kimi-code', 'bin', 'kimi')]
}

export async function selectSystemKimiExecutable(
  pathExecutable: string | null,
  fallbackPaths: readonly string[],
  isExecutable: (path: string) => Promise<boolean> = isExecutableFile
): Promise<string | null> {
  if (pathExecutable !== null) return pathExecutable
  for (const path of fallbackPaths) {
    if (await isExecutable(path)) return path
  }
  return null
}

async function locateSystemKimi(): Promise<string | null> {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  let pathExecutable: string | null = null
  try {
    const { stdout } = await execFileAsync(locator, ['kimi'], { timeout: 3_000 })
    pathExecutable = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null
  } catch {}
  return selectSystemKimiExecutable(pathExecutable, systemKimiFallbackPaths())
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
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

export function resolveManagedKimiVersion(): string {
  const pkg = require('@moonshot-ai/kimi-code/package.json') as { version?: string }
  return pkg.version ?? 'unknown'
}

export async function discoverRuntimes(): Promise<RuntimeDiscovery> {
  const managedEntry = resolveManagedKimiEntry()
  const systemExecutable = await locateSystemKimi()
  const system = await inspectSystemKimi(systemExecutable)

  return {
    supportedRange: SUPPORTED_KIMI_RANGE,
    managed: {
      kind: 'managed',
      version: resolveManagedKimiVersion(),
      executable: managedEntry,
      compatible: true,
      reason: null
    },
    system
  }
}
