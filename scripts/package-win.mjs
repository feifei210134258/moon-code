#!/usr/bin/env node
/* Windows 打包入口（支持在 macOS 上交叉打包，仅 x64；不支持 Windows ARM64）。
   electron-builder.yml 里的 electronDist 固定指向本机 mac 版 Electron，
   打 win 包必须换成 Windows 版 dist：这里按 node_modules/electron 的版本号
   把对应 win32 zip 缓存到 node_modules/.cache/electron-dist/，
   再用 -c.electronDist 覆盖后调起 electron-builder。
   用法：node scripts/package-win.mjs
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

const fileName = `electron-v${electronVersion}-win32-x64.zip`
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
   而 node-pty 各平台 prebuilds 已随包携带（N-API，无需重编），直接跳过 rebuild。
   macOS 交叉打包没有 wine、跑不了 rcedit，需关掉 signAndEditExecutable；
   Windows 本机打包保持默认开启，以写入正式图标与版本元数据。 */
const args = [
  cliPath, '--win', '--x64', '--publish', 'never',
  `-c.electronDist=${zipPath}`, '-c.npmRebuild=false'
]
if (process.platform === 'darwin') args.push('-c.win.signAndEditExecutable=false')
const child = spawn(process.execPath, args, { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
