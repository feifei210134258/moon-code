<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 点阵品牌视觉：浅色小圆点组成的四块独立点阵 tile，每块内以 7×9
 * 粗体点阵字形拼出 “moon” 的一个字母（呼应 Moon Code 品牌），块与块之间
 * 留完全无点的空档——对齐 Kimi 官网点阵 logo 的分块样式。高亮沿对角线
 * 缓慢流动并叠加全局呼吸。尊重 prefers-reduced-motion：开启减少动态时
 * 只渲染一帧静态画面。颜色取自 styles.css 的 --faint / --text 设计
 * token，跟随主题。
 */
const canvasRef = ref<HTMLCanvasElement | null>(null)

const COLUMNS = 45 // 4 块 tile（各 9 列）+ 3 条块间空档（各 3 列）
const ROWS = 11
const PITCH = 14
const MARGIN = 14
const WIDTH = MARGIN * 2 + (COLUMNS - 1) * PITCH
const HEIGHT = MARGIN * 2 + (ROWS - 1) * PITCH
const DOT_RADIUS = 3.5
const WAVE_SPEED = (Math.PI * 2) / 9 // 一个完整波周期约 9 秒

// 7×9 粗体点阵字形，'#' 表示该格属于字母高亮；笔画取 2 点粗，贴近 Kimi 点阵的厚实观感。
const GLYPH_WIDTH = 7
const GLYPH_HEIGHT = 9
const WORD = 'moon'
const GLYPHS: Record<string, string[]> = {
  m: [
    '.##.##.',
    '#######',
    '##.#.##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
  ],
  o: [
    '.#####.',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '.#####.',
  ],
  n: [
    '##.###.',
    '###.###',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
    '##...##',
  ],
}

// 每个字母独占一块 9×11 点阵 tile（7×9 字形四周各留 1 格 padding），
// 块间留 3 列空档。
const TILE_COLS = GLYPH_WIDTH + 2
const TILE_GAP = 3
const TILE_STRIDE = TILE_COLS + TILE_GAP

interface Dot {
  x: number
  y: number
  inLetter: boolean
}

const dots: Dot[] = []
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLUMNS; col += 1) {
    // 块间空档完全不画点。
    const tileCol = col % TILE_STRIDE
    if (tileCol >= TILE_COLS) continue
    // 当前格是否落在本 tile 字母的字形内。
    const glyph = GLYPHS[WORD.charAt(Math.floor(col / TILE_STRIDE))]
    const glyphRow = row - 1
    const glyphCol = tileCol - 1
    const inLetter = glyph !== undefined
      && glyphRow >= 0 && glyphRow < GLYPH_HEIGHT
      && glyphCol >= 0 && glyphCol < GLYPH_WIDTH
      && glyph[glyphRow]?.[glyphCol] === '#'
    dots.push({ x: MARGIN + col * PITCH, y: MARGIN + row * PITCH, inLetter })
  }
}

let baseColor = '#8e8e93'
let letterColor = '#1d1d1f'
let reducedMotion = false
let rafId = 0
let resizeObserver: ResizeObserver | null = null
let motionMedia: MediaQueryList | null = null

function readThemeColors(): void {
  const style = getComputedStyle(document.documentElement)
  const faint = style.getPropertyValue('--faint').trim()
  const text = style.getPropertyValue('--text').trim()
  if (faint !== '') baseColor = faint
  if (text !== '') letterColor = text
}

function draw(now: number): void {
  const canvas = canvasRef.value
  if (canvas === null) return
  const ctx = canvas.getContext('2d')
  if (ctx === null) return

  const cssWidth = canvas.clientWidth || WIDTH
  const scale = cssWidth / WIDTH
  const dpr = window.devicePixelRatio || 1
  const pixelWidth = Math.max(1, Math.round(WIDTH * scale * dpr))
  const pixelHeight = Math.max(1, Math.round(HEIGHT * scale * dpr))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)

  const t = now / 1000
  // 全局呼吸：整幅点阵的亮度缓慢起伏。
  const breathe = reducedMotion ? 1 : 0.9 + 0.1 * Math.sin(t * 0.6)

  ctx.fillStyle = baseColor
  ctx.globalAlpha = 0.32
  for (const dot of dots) {
    if (dot.inLetter) continue
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  // 字母上的高亮沿对角线缓慢流动；alpha 恒在 0.78–1.0，任何相位下字母都接近实心，波光仅轻微起伏。
  ctx.fillStyle = letterColor
  for (const dot of dots) {
    if (!dot.inLetter) continue
    const wave = reducedMotion
      ? 0.88
      : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(dot.x * 0.045 + dot.y * 0.03 - t * WAVE_SPEED))
    ctx.globalAlpha = wave * breathe
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function frame(now: number): void {
  draw(now)
  rafId = requestAnimationFrame(frame)
}

function startLoop(): void {
  if (typeof requestAnimationFrame !== 'function') return
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(frame)
}

function stopLoop(): void {
  if (typeof cancelAnimationFrame !== 'function') return
  cancelAnimationFrame(rafId)
  rafId = 0
}

function syncMotion(): void {
  if (typeof window.matchMedia !== 'function') return
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    stopLoop()
    draw(performance.now())
  } else if (rafId === 0) {
    startLoop()
  }
}

onMounted(() => {
  readThemeColors()
  if (typeof window.matchMedia === 'function') {
    motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)')
    motionMedia.addEventListener('change', syncMotion)
  }
  if (typeof ResizeObserver !== 'undefined' && canvasRef.value !== null) {
    resizeObserver = new ResizeObserver(() => draw(performance.now()))
    resizeObserver.observe(canvasRef.value)
  }
  syncMotion()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObserver?.disconnect()
  resizeObserver = null
  motionMedia?.removeEventListener('change', syncMotion)
  motionMedia = null
})
</script>

<template>
  <canvas ref="canvasRef" class="dot-matrix-brand" role="img" aria-label="Moon Code" />
</template>
