<script setup lang="ts">
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import katex from 'katex'
import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import texmath from 'markdown-it-texmath'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { workspaceFilePathFromHref } from '../utils/fileRouting'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'

const props = defineProps<{ text: string; sessionId?: string }>()
const emit = defineEmits<{ openFile: [path: string] }>()
const root = ref<HTMLElement | null>(null)
const TRANSPARENT_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
let imageLoadGeneration = 0

for (const [name, language] of Object.entries({
  bash, css, javascript, json, markdown, python, typescript, xml, yaml
})) hljs.registerLanguage(name, language)
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'vue', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })

const renderer: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  highlight(code: string, language: string): string {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    }
    return escapeHtml(code)
  }
})
.use(taskLists, { enabled: false, label: false })
.use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { throwOnError: false, strict: false } })

installFilePathLinks(renderer)
installSafeImages(renderer)
const defaultFence = renderer.renderer.rules.fence!
renderer.renderer.rules.fence = (tokens, index, options, env, self) => {
  const token = tokens[index]!
  if (token.info.trim().toLowerCase() !== 'mermaid') {
    return defaultFence(tokens, index, options, env, self)
  }
  return `<div class="mermaid-placeholder" data-mermaid="${encodeURIComponent(token.content)}"><span>正在渲染 Mermaid…</span></div>`
}

const html = computed(() => DOMPurify.sanitize(renderer.render(props.text), {
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: true
}))

async function renderMermaid(): Promise<void> {
  await nextTick()
  const nodes = root.value?.querySelectorAll<HTMLElement>('.mermaid-placeholder') ?? []
  if (nodes.length === 0) return
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      htmlLabels: false,
      flowchart: { htmlLabels: false }
    })
    for (const [index, node] of [...nodes].entries()) {
      const encoded = node.dataset.mermaid
      if (encoded === undefined) continue
      const source = decodeURIComponent(encoded)
      const { svg } = await mermaid.render(`kimi-mermaid-${Date.now()}-${index}`, source)
      node.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['foreignObject']
      })
      node.classList.add('is-ready')
    }
  } catch (reason) {
    for (const node of nodes) {
      node.textContent = reason instanceof Error ? `Mermaid 渲染失败：${reason.message}` : 'Mermaid 渲染失败'
      node.classList.add('is-error')
    }
  }
}

async function loadWorkspaceImages(): Promise<void> {
  await nextTick()
  const generation = ++imageLoadGeneration
  const nodes = [...(root.value?.querySelectorAll<HTMLImageElement>('img[data-workspace-image]') ?? [])]
  if (nodes.length === 0) return
  const api = window.kimiAgent
  const sessionId = props.sessionId
  if (api === undefined || sessionId === undefined || sessionId.length === 0) {
    for (const node of nodes) node.classList.replace('is-loading', 'is-error')
    return
  }
  await Promise.all(nodes.map(async (node) => {
    const source = node.dataset.workspaceImage
    if (source === undefined) return
    try {
      const image = await api.readMarkdownImage(sessionId, decodeLocalSource(source))
      if (generation !== imageLoadGeneration) return
      if (image === null) {
        node.classList.replace('is-loading', 'is-error')
        node.title = '图片不在当前 Workspace 内，或超过安全读取限制'
        return
      }
      node.src = image.dataUrl
      node.classList.remove('is-loading')
      node.classList.add('is-ready')
    } catch (reason) {
      if (generation !== imageLoadGeneration) return
      node.classList.replace('is-loading', 'is-error')
      node.title = reason instanceof Error ? reason.message : String(reason)
    }
  }))
}

function renderRichContent(): void {
  void renderMermaid()
  void loadWorkspaceImages()
}

function onClick(event: MouseEvent): void {
  const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a')
  if (anchor === null) return
  const path = anchor.dataset.workspacePath
  if (path !== undefined) {
    event.preventDefault()
    emit('openFile', path)
    return
  }
  const href = anchor.getAttribute('href') ?? ''
  const linkedPath = workspaceFilePathFromHref(href)
  if (linkedPath !== null) {
    event.preventDefault()
    emit('openFile', linkedPath)
    return
  }
  if (!/^https?:\/\//i.test(href)) event.preventDefault()
}

watch(() => [props.text, props.sessionId], renderRichContent)
onMounted(renderRichContent)

function installSafeImages(markdownRenderer: MarkdownIt): void {
  const defaultImage = markdownRenderer.renderer.rules.image
    ?? ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
  markdownRenderer.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index]!
    const source = token.attrGet('src') ?? ''
    if (/^https?:/i.test(source)) {
      token.attrSet('src', TRANSPARENT_IMAGE)
      token.attrJoin('class', 'markdown-remote-image is-blocked')
      token.attrSet('title', token.attrGet('title') ?? '远程图片未自动加载')
    } else if (!/^(?:data:|blob:)/i.test(source)) {
      token.attrSet('src', TRANSPARENT_IMAGE)
      token.attrSet('data-workspace-image', source)
      token.attrJoin('class', 'markdown-local-image is-loading')
    }
    token.attrSet('loading', 'lazy')
    token.attrSet('referrerpolicy', 'no-referrer')
    return defaultImage(tokens, index, options, env, self)
  }
}

function decodeLocalSource(source: string): string {
  try {
    return decodeURI(source)
  } catch {
    return source
  }
}

function installFilePathLinks(markdownRenderer: MarkdownIt): void {
  const extensions = '(?:html?|css|s[ac]ss|less|m?[jt]sx?|c[jt]sx?|vue|svelte|astro|py|go|rs|java|kt|kts|swift|c|cc|cpp|cxx|h|hpp|cs|php|rb|lua|r|sh|bash|zsh|fish|ps1|sql|graphql|gql|md|mdx|markdown|txt|log|csv|tsv|jsonc?|ya?ml|toml|ini|cfg|conf|xml|xsd|xsl|svg|png|jpe?g|gif|webp|avif|ico|pdf|docx?|xlsx?|pptx?|zip|tar|gz|tgz|lock)'
  const pattern = new RegExp(`((?:\\.{0,2}\\/)?(?:[\\w.@+-]+\\/)*[\\w.@+-]+\\.${extensions})(?::\\d+(?::\\d+)?)?`, 'gi')
  const inlineFilePattern = new RegExp(`(?:^|\\s)((?:\\.{0,2}\\/)?(?:[\\w.@+-]+\\/)*[\\w.@+-]+\\.${extensions})(?::\\d+(?::\\d+)?)?(?=$|\\s)`, 'i')
  markdownRenderer.core.ruler.after('inline', 'kimi_file_paths', (state) => {
    for (const block of state.tokens) {
      if (block.type !== 'inline' || block.children === null) continue
      const next = []
      let linkDepth = 0
      for (const token of block.children) {
        if (token.type === 'link_open') linkDepth += 1
        if (token.type === 'code_inline' && inlineFilePattern.test(token.content)) {
          token.attrJoin('class', 'markdown-file-inline')
        }
        if (token.type !== 'text' || linkDepth > 0) {
          next.push(token)
          if (token.type === 'link_close') linkDepth = Math.max(0, linkDepth - 1)
          continue
        }
        let cursor = 0
        pattern.lastIndex = 0
        for (const match of token.content.matchAll(pattern)) {
          const index = match.index ?? 0
          if (index > cursor) {
            const text = new state.Token('text', '', 0)
            text.content = token.content.slice(cursor, index)
            next.push(text)
          }
          const open = new state.Token('link_open', 'a', 1)
          open.attrs = [['href', '#'], ['class', 'markdown-file-link'], ['data-workspace-path', match[1]!]]
          const label = new state.Token('text', '', 0)
          label.content = match[0]
          const close = new state.Token('link_close', 'a', -1)
          next.push(open, label, close)
          cursor = index + match[0].length
        }
        if (cursor < token.content.length) {
          const text = new state.Token('text', '', 0)
          text.content = token.content.slice(cursor)
          next.push(text)
        }
      }
      block.children = next
    }
  })
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[character]!)
}
</script>

<template>
  <div ref="root" class="markdown-block" @click="onClick" v-html="html" />
</template>
