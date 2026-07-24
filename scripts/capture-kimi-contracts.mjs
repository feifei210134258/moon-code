import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(packageRoot, 'packages/kimi-adapter/contracts')
const kimiEntry = require.resolve('@moonshot-ai/kimi-code/dist/main.mjs')
const args = [kimiEntry, 'web', '--port', '0', '--no-open', '--log-level', 'error']
const child = spawn(process.execPath, args, {
  cwd: packageRoot,
  env: { ...process.env, NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let buffer = ''
let settled = false

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function readJson(origin, token, path) {
  const response = await fetch(`${origin}${path}`, {
    redirect: 'manual',
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`)
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(
      `${path} returned HTTP ${response.status} ${response.headers.get('content-type') ?? 'an unknown content type'} from ${response.url}, not JSON`
    )
  }
}

async function shutdown(origin, token) {
  try {
    await fetch(`${origin}/api/v1/shutdown`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' }
    })
  } catch {
    child.kill('SIGTERM')
  }
}

async function capture(origin, token) {
  const [openapi, asyncapi, metaEnvelope] = await Promise.all([
    readJson(origin, token, '/openapi.json'),
    readJson(origin, token, '/asyncapi.json'),
    readJson(origin, token, '/api/v1/meta')
  ])
  const version = metaEnvelope?.data?.server_version
  if (version !== '0.29.0') throw new Error(`Expected Kimi 0.29.0, got ${String(version)}`)

  const openapiText = `${JSON.stringify(openapi, null, 2)}\n`
  const asyncapiText = `${JSON.stringify(asyncapi, null, 2)}\n`
  const manifest = {
    capturedAt: new Date().toISOString(),
    kimiVersion: version,
    source: '@moonshot-ai/kimi-code@0.29.0',
    files: {
      'kimi-0.29.0-openapi.json': sha256(openapiText),
      'kimi-0.29.0-asyncapi.json': sha256(asyncapiText)
    }
  }

  await mkdir(outputDir, { recursive: true })
  await Promise.all([
    writeFile(resolve(outputDir, 'kimi-0.29.0-openapi.json'), openapiText),
    writeFile(resolve(outputDir, 'kimi-0.29.0-asyncapi.json'), asyncapiText),
    writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  ])
  await shutdown(origin, token)
  return manifest
}

const timeout = setTimeout(() => {
  if (!settled) {
    child.kill('SIGTERM')
    console.error('Timed out while capturing Kimi contracts')
    process.exitCode = 1
  }
}, 30_000)

child.stdout.on('data', async (chunk) => {
  if (settled) return
  buffer = `${buffer}${chunk.toString('utf8')}`.slice(-16_384)
  const match = buffer.match(/Kimi server:\s+(https?:\/\/[^\s#]+)#token=([^\s]+)/)
  if (!match) return
  settled = true
  clearTimeout(timeout)
  try {
    const manifest = await capture(match[1].replace(/\/$/, ''), decodeURIComponent(match[2]))
    console.log(`Captured Kimi ${manifest.kimiVersion} OpenAPI and AsyncAPI contracts.`)
  } catch (error) {
    child.kill('SIGTERM')
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
})

child.stderr.on('data', (chunk) => {
  buffer = `${buffer}${chunk.toString('utf8')}`.slice(-16_384)
})

child.once('error', (error) => {
  clearTimeout(timeout)
  console.error(error.message)
  process.exitCode = 1
})

child.once('exit', (code) => {
  clearTimeout(timeout)
  if (!settled && code !== 0) {
    console.error(`Kimi runtime exited before contract capture (code ${code ?? 'unknown'})`)
    process.exitCode = 1
  }
})
