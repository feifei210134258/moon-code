<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 点阵品牌视觉：规则网格的浅色小圆点中，高亮圆点以 5×7 点阵字体
 * 拼出 “moon” 四个字母（呼应 Moon Code 品牌），高亮沿对角线缓慢
 * 流动并叠加全局呼吸，风格参考 Kimi 官网的点阵 logo。尊重
 * prefers-reduced-motion：开启减少动态时只渲染一帧静态画面。
 * 颜色取自 styles.css 的 --faint / --text 设计 token，跟随主题。
 */
const canvasRef = ref<HTMLCanvasElement | null>(null)

const COLUMNS = 34
const ROWS = 11
const PITCH = 14
const MARGIN = 14
const WIDTH = MARGIN * 2 + (COLUMNS - 1) * PITCH
const HEIGHT = MARGIN * 2 + (ROWS - 1) * PITCH
const DOT_RADIUS = 2.8
const WAVE_SPEED = (Math.PI * 2) / 9 // 一个完整波周期约 9 秒

// 5×7 点阵字形，'#' 表示该格属于字母高亮；m / o / n 三个字形必须清晰可辨。
const GLYPH_WIDTH = 5
const GLYPH_HEIGHT = 7
const GLYPH_GAP = 2 // 字母之间留出的空列数
const WORD = 'moon'
const GLYPHS: Record<string, string[]> = {
  m: [
    '.###.',
    '#...#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
    '#.#.#',
  ],
  o: [
    '.###.',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '.###.',
  ],
  n: [
    '#..##',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
    '#...#',
  ],
}

// 整行文字在网格中的位置：4 个字母（5 列）× 3 个 2 列间距 = 26 列，居中。
const TEXT_WIDTH = WORD.length * GLYPH_WIDTH + (WORD.length - 1) * GLYPH_GAP
const TEXT_OFFSET_X = Math.floor((COLUMNS - TEXT_WIDTH) / 2)
const TEXT_OFFSET_Y = Math.floor((ROWS - GLYPH_HEIGHT) / 2)

interface Dot {
  x: number
  y: number
  inLetter: boolean
}

const dots: Dot[] = []
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLUMNS; col += 1) {
    // 当前格是否落在某个字母的字形内。
    let inLetter = false
    const glyphRow = row - TEXT_OFFSET_Y
    if (glyphRow >= 0 && glyphRow < GLYPH_HEIGHT) {
      for (let i = 0; i < WORD.length; i += 1) {
        const glyph = GLYPHS[WORD.charAt(i)]
        if (glyph === undefined) continue
        const glyphCol = col - (TEXT_OFFSET_X + i * (GLYPH_WIDTH + GLYPH_GAP))
        if (glyphCol >= 0 && glyphCol < GLYPH_WIDTH && glyph[glyphRow]?.[glyphCol] === '#') {
          inLetter = true
          break
        }
      }
    }
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
