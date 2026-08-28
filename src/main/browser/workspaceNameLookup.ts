import { readdir, stat as statFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'

/* 会话文本只写裸文件名（kimi 0.39 助手常见，如 `index.html:159`）而文件实际
   在子目录时，按 cwd 直解会 ENOENT。此模块在工作区内做有界同名查找，
   恰好唯一命中才返回；跳过依赖/隐藏目录，深度与条目都封顶。 */
const FIND_NAME_MAX_DEPTH = 6
const FIND_NAME_MAX_ENTRIES = 5_000
const FIND_NAME_SKIP = new Set(['node_modules', '.git', 'dist-cache', '.next', 'target', 'build-cache'])

export async function fileExists(target: string): Promise<boolean> {
  try {
    return (await statFile(target)).isFile()
  } catch {
    return false
  }
}

/** 解析成功时返回「工作区相对路径」；未命中/歧义/超出边界返回 null。 */
export async function resolveEntryByName(workspaceRoot: string, workspacePath: string): Promise<string | null> {
  const name = workspacePath.split('/').at(-1) ?? ''
  if (name.length === 0) return null
  const match = await findUniqueByName(workspaceRoot, name)
  if (match === null) return null
  return relative(resolve(workspaceRoot), match).split(sep).join('/')
}

async function findUniqueByName(root: string, name: string): Promise<string | null> {
  let scanned = 0
  let match: string | null = null
  let ambiguous = false
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > FIND_NAME_MAX_DEPTH || scanned > FIND_NAME_MAX_ENTRIES || ambiguous) return
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      scanned += 1
      if (scanned > FIND_NAME_MAX_ENTRIES || ambiguous) return
      if (entry.name.startsWith('.')) continue
      const child = `${directory}${sep}${entry.name}`
      if (entry.isFile() && entry.name === name) {
        if (match !== null && match !== child) {
          ambiguous = true
          return
        }
        match = child
      } else if (entry.isDirectory() && !FIND_NAME_SKIP.has(entry.name.toLowerCase())) {
        await walk(child, depth + 1)
      }
    }
  }
  await walk(root, 0)
  return ambiguous ? null : match
}
