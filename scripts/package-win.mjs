#!/usr/bin/env node
/* Windows 打包入口（支持在 macOS 上交叉打包）。
   electron-builder.yml 里的 electronDist 固定指向本机 mac 版 Electron，
   打 win 包必须换成 Windows 版 dist：这里按 node_modules/electron 的版本号
   把对应 win32 zip 缓存到 node_modules/.cache/electron-dist/，
   再用 -c.electronDist 覆盖后调起 electron-builder。
   用法：node scripts/package-win.mjs [x64|arm64]（默认 x64）。
   网络受限时可设 ELECTRON_MIRROR（GitHub releases 同布局的镜像）。 */
import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const electronVersion = require('electron/package.json').version

const arch = process.argv[2] ?? 'x64'
if (arch !== 'x64' && arch !== 'arm64') {
  console.error(`Unsupported arch: ${arch} (expected x64 or arm64)`)
  process.exit(1)
}

const fileName = `electron-v${electronVersion}-win32-${arch}.zip`
const cacheDir = join(rootDir, 'node_modules', '.cache', 'electron-dist')
const zipPath = join(cacheDir, fileName)

if (!existsSync(zipPath)) {
  const mirror = process.env.ELECTRON_MIRROR ?? 'https://github.com/electron/electron/releases/download/'
  const url = `${mirror}v${electronVersion}/${fileName}`
  console.log(`Downloading ${url}`)
  const response = await fetch(url)
  if (!response.ok || response.body === null) {
    throw new Error(`Failed to download Windows Electron dist: HTTP ${response.status}`)
  }
  await mkdir(cacheDir, { recursive: true })
  const tempPath = `${zipPath}.download`
  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath))
  await rename(tempPath, zipPath)
}

const cliPath = join(dirname(require.resolve('electron-builder/package.json')), 'cli.js')
/* -c.npmRebuild=false：node-gyp 不支持从 macOS 交叉编译 win32 原生模块，
   而 node-pty 各平台 prebuilds 已随包携带（N-API，无需重编），直接跳过 rebuild。 */
const child = spawn(
  process.execPath,
  [
    cliPath, '--win', `--${arch}`, '--publish', 'never',
    `-c.electronDist=${zipPath}`, '-c.npmRebuild=false'
  ],
  { stdio: 'inherit' }
)
child.on('exit', (code) => process.exit(code ?? 1))
