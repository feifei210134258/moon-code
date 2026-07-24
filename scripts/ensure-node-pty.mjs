import { constants, accessSync, chmodSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve('node-pty/package.json')
  const helperPath = join(
    dirname(packagePath),
    'prebuilds',
    `${process.platform}-${process.arch}`,
    'spawn-helper'
  )

  try {
    accessSync(helperPath, constants.X_OK)
  } catch {
    const mode = statSync(helperPath).mode
    chmodSync(helperPath, mode | 0o111)
    console.log(`Enabled node-pty spawn-helper for ${process.platform}-${process.arch}`)
  }
}
