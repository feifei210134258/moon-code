<script setup lang="ts">
import { PhCaretDown, PhCaretRight, PhFileDoc } from '@phosphor-icons/vue'
import { computed, ref } from 'vue'

const props = defineProps<{ files: string[] }>()
const emit = defineEmits<{ openFile: [name: string] }>()
const expanded = ref(false)

/* 空清单不渲染由父级 v-if 保证，这里再防御一层。 */
const files = computed(() => props.files.filter((path) => path.trim().length > 0))

function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index + 1)
}
</script>

<template>
  <div v-if="files.length > 0" class="turn-changes" :class="{ 'is-expanded': expanded }">
    <button
      class="turn-changes-summary"
      type="button"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <component :is="expanded ? PhCaretDown : PhCaretRight" :size="13" />
      <PhFileDoc :size="15" />
      <strong>更改 {{ files.length }} 个文件</strong>
    </button>
    <div v-if="expanded" class="turn-changes-list" aria-label="本回合更改的文件">
      <button
        v-for="path in files"
        :key="path"
        type="button"
        class="turn-changes-file"
        :title="path"
        @click="emit('openFile', basename(path))"
      >
        <PhFileDoc :size="14" />
        <span class="turn-changes-dir">{{ dirname(path) }}</span>
        <strong>{{ basename(path) }}</strong>
        <em>已写入</em>
      </button>
    </div>
  </div>
</template>
