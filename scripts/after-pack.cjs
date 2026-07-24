const { constants, accessSync, chmodSync, existsSync, readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const product = context.packager.appInfo.productFilename
  const prebuilds = join(
    context.appOutDir,
    `${product}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
    'prebuilds'
  )
  if (!existsSync(prebuilds)) throw new Error(`Packaged node-pty prebuilds are missing: ${prebuilds}`)

  const helpers = readdirSync(prebuilds, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('darwin-'))
    .map((entry) => join(prebuilds, entry.name, 'spawn-helper'))
    .filter(existsSync)
  if (helpers.length === 0) throw new Error('Packaged node-pty spawn-helper is missing')

  for (const helper of helpers) {
    const mode = statSync(helper).mode
    chmodSync(helper, mode | 0o111)
    accessSync(helper, constants.X_OK)
  }
}
