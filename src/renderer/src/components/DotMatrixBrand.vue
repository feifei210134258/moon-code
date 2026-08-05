<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 点阵品牌视觉：规则网格的浅色小圆点中，高亮圆点组成一轮月牙
 * （呼应 Moon Code 品牌），高亮沿对角线缓慢流动并叠加全局呼吸，
 * 风格参考 Kimi 官网的点阵动画。尊重 prefers-reduced-motion：
 * 开启减少动态时只渲染一帧静态画面。
 * 颜色取自 styles.css 的 --faint / --text 设计 token，跟随主题。
 */
const canvasRef = ref<HTMLCanvasElement | null>(null)

const COLUMNS = 34
const ROWS = 15
const PITCH = 14
const MARGIN = 14
const WIDTH = MARGIN * 2 + (COLUMNS - 1) * PITCH
const HEIGHT = MARGIN * 2 + (ROWS - 1) * PITCH
const DOT_RADIUS = 2.8
const MOON_RADIUS = Math.min(WIDTH, HEIGHT) * 0.48
const MOON_INNER_RADIUS = MOON_RADIUS * 0.78
const MOON_OFFSET_X = MOON_RADIUS * 0.45
const MOON_TILT = -0.28
const MOON_CENTER_X = WIDTH / 2
const MOON_CENTER_Y = HEIGHT / 2
const WAVE_SPEED = (Math.PI * 2) / 9 // 一个完整波周期约 9 秒

interface Dot {
  x: number
  y: number
  inMoon: boolean
}

const dots: Dot[] = []
const cosTilt = Math.cos(MOON_TILT)
const sinTilt = Math.sin(MOON_TILT)
for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLUMNS; col += 1) {
    const x = MARGIN + col * PITCH
    const y = MARGIN + row * PITCH
    const dx = x - MOON_CENTER_X
    const dy = y - MOON_CENTER_Y
    // 绕中心旋转后判断是否落在月牙带内（外圆之内、内圆之外）。
    const rx = dx * cosTilt - dy * sinTilt
    const ry = dx * sinTilt + dy * cosTilt
    const inMoon =
      rx * rx + ry * ry <= MOON_RADIUS * MOON_RADIUS &&
      (rx - MOON_OFFSET_X) * (rx - MOON_OFFSET_X) + ry * ry > MOON_INNER_RADIUS * MOON_INNER_RADIUS
    dots.push({ x, y, inMoon })
  }
}

let baseColor = '#8e8e93'
let moonColor = '#1d1d1f'
let reducedMotion = false
let rafId = 0
let resizeObserver: ResizeObserver | null = null
let motionMedia: MediaQueryList | null = null

function readThemeColors(): void {
  const style = getComputedStyle(document.documentElement)
  const faint = style.getPropertyValue('--faint').trim()
  const text = style.getPropertyValue('--text').trim()
  if (faint !== '') baseColor = faint
  if (text !== '') moonColor = text
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
    if (dot.inMoon) continue
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, DOT_RADIUS, 0, Math.PI * 2)
    ctx.fill()
  }

  // 月牙上的高亮沿对角线缓慢流动，像水面波光一样循环。
  ctx.fillStyle = moonColor
  for (const dot of dots) {
    if (!dot.inMoon) continue
    const wave = reducedMotion
      ? 0.62
      : 0.38 + 0.52 * (0.5 + 0.5 * Math.sin(dot.x * 0.045 + dot.y * 0.03 - t * WAVE_SPEED))
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
