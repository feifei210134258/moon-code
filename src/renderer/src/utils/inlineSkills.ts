/**
 * 输入框内联 skill token 解析。
 *
 * token 定义：文本中位于行首或空白之后的 `/name` 词元（name 为非空白连续段），
 * 且 name 精确匹配（大小写不敏感）技能目录中的某个技能名。
 * 镜像高亮渲染与提交解析共用同一个识别函数，保证「看到的」与「提交的」一致。
 */

export interface InlineSkillToken {
  /** 斜杠在原文中的起始偏移（不含前导空白），半开区间 [start, end)。 */
  start: number
  end: number
  /** 技能目录中的规范名（提交时使用）。 */
  name: string
  /** 用户输入的原始词元（含斜杠、保留大小写，用于高亮渲染）。 */
  raw: string
}

export interface InlineParsedSkill {
  name: string
  args?: string
}

/** 在文本中找出所有内联 skill token，按出现顺序返回。 */
export function findInlineSkillTokens(
  text: string,
  catalog: Array<{ name: string }>
): InlineSkillToken[] {
  if (catalog.length === 0 || !text.includes('/')) return []
  const canonicalNames = new Map<string, string>()
  for (const skill of catalog) {
    const key = skill.name.toLocaleLowerCase()
    if (!canonicalNames.has(key)) canonicalNames.set(key, skill.name)
  }
  const tokens: InlineSkillToken[] = []
  const pattern = /(^|\s)\/(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const canonical = canonicalNames.get(match[2]!.toLocaleLowerCase())
    if (canonical === undefined) continue
    const start = match.index + match[1]!.length
    const end = start + 1 + match[2]!.length
    tokens.push({ start, end, name: canonical, raw: text.slice(start, end) })
  }
  return tokens
}

/**
 * 把文本解析成结构化 skill 引用：args 为该 token 之后到下一个 token
 * 之前（或文末）的文本（trim，空则省略 args 字段）。
 */
export function parseInlineSkillTokens(
  text: string,
  catalog: Array<{ name: string }>
): InlineParsedSkill[] {
  const tokens = findInlineSkillTokens(text, catalog)
  return tokens.map((token, index) => {
    const next = tokens[index + 1]
    const args = text.slice(token.end, next?.start ?? text.length).trim()
    return args.length === 0 ? { name: token.name } : { name: token.name, args }
  })
}
