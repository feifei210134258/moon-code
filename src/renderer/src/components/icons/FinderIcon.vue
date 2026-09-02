<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 图标尺寸（px），默认 16 */
    size?: number
  }>(),
  { size: 16 }
)
</script>

<!-- macOS 访达风格图标：蓝白双面 + 笑脸，自绘简约几何，仅用于「在访达中打开」入口。 -->
<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    :width="size"
    :height="size"
  >
    <rect x="16" y="16" width="224" height="224" rx="52" fill="#E9F4FF" />
    <path d="M68,16 H152 C120,88 120,168 152,240 H68 A52,52 0 0 1 16,188 V68 A52,52 0 0 1 68,16 Z" fill="#2FA8F5" />
    <g stroke="#1753B8" stroke-width="14" stroke-linecap="round" fill="none">
      <line x1="92" y1="78" x2="92" y2="106" />
      <line x1="170" y1="78" x2="170" y2="106" />
      <path d="M80,150 Q128,198 176,150" />
    </g>
  </svg>
</template>
