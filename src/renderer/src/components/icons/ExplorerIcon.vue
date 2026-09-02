<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 图标尺寸（px），默认 16 */
    size?: number
  }>(),
  { size: 16 }
)
</script>

<!-- Windows 文件资源管理器风格图标：黄色文件夹 + 顶部探出的蓝色文件，自绘简约几何。 -->
<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 256 256"
    :width="size"
    :height="size"
  >
    <rect x="142" y="42" width="66" height="42" rx="8" fill="#4C8BF5" />
    <path d="M42,62 h50 l22,22 h100 a20,20 0 0 1 20,20 v68 a20,20 0 0 1 -20,20 H42 a20,20 0 0 1 -20,-20 V82 a20,20 0 0 1 20,-20 Z" fill="#F0B429" />
    <path d="M22,118 H234 V172 a20,20 0 0 1 -20,20 H42 a20,20 0 0 1 -20,-20 Z" fill="#FFD35C" />
  </svg>
</template>
