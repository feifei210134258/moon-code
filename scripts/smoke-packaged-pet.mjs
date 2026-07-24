import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'

const marker = 'KIMI_PACKAGED_PET_OK'
const appPath = resolve(process.argv[2] ?? defaultAppPath())
const executable = process.platform === 'darwin'
  ? join(appPath, 'Contents', 'MacOS', 'Kimi Agent')
  : appPath

if (!existsSync(executable)) throw new Error(`Packaged Kimi Agent executable is missing: ${executable}`)

const child = spawn(executable, ['--smoke-pet'], {
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
let output = ''
child.stdout.on('data', (chunk) => { output = `${output}${chunk.toString('utf8')}`.slice(-64_000) })
child.stderr.on('data', (chunk) => { output = `${output}${chunk.toString('utf8')}`.slice(-64_000) })

const result = await new Promise((resolveResult, reject) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL')
    reject(new Error(`Packaged Pet smoke timed out:\n${output}`))
  }, 30_000)
  child.once('error', (error) => {
    clearTimeout(timer)
    reject(error)
  })
  child.once('exit', (code, signal) => {
    clearTimeout(timer)
    resolveResult({ code, signal })
  })
})

if (result.code !== 0 || !output.includes(marker)) {
  throw new Error(`Packaged Pet smoke failed (${result.signal ?? result.code}):\n${output}`)
}
process.stdout.write(`${marker}\n`)

function defaultAppPath() {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return join('release', `mac-${arch}`, 'Kimi Agent.app')
}
