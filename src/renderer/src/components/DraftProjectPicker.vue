<script setup lang="ts">
import { PhCaretDown, PhFolderSimple, PhMagnifyingGlass, PhPlus } from '@phosphor-icons/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ProjectItem } from '../types'

const props = defineProps<{
  projects: ProjectItem[]
  workspaceId: string
}>()

const emit = defineEmits<{
  select: [workspaceId: string]
  openFolder: []
}>()

const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)

const activeName = computed(() => (
  props.projects.find((project) => project.id === props.workspaceId)?.name ?? ''
))
const filteredProjects = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  if (keyword.length === 0) return props.projects
  return props.projects.filter((project) => project.name.toLocaleLowerCase().includes(keyword))
})

function toggle(): void {
  open.value = !open.value
  if (open.value) {
    query.value = ''
    void nextTick(() => searchInput.value?.focus())
  }
}

function choose(workspaceId: string): void {
  emit('select', workspaceId)
  open.value = false
}

function openFolder(): void {
  emit('openFolder')
  open.value = false
}

function onDocumentPointerdown(event: PointerEvent): void {
  const target = event.target
  if (!(target instanceof Node) || root.value?.contains(target)) return
  open.value = false
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  open.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerdown, true)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerdown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div ref="root" class="draft-project-picker">
    <button
      type="button"
      class="draft-project-chip"
      :aria-expanded="open"
      aria-haspopup="dialog"
      aria-label="切换草稿项目"
      @click="toggle"
    >
      <PhFolderSimple :size="14" />
      <span>{{ activeName || '选择项目' }}</span>
      <PhCaretDown :size="12" />
    </button>
    <div v-if="open" class="draft-project-menu" role="dialog" aria-label="选择项目">
      <label class="draft-project-search">
        <PhMagnifyingGlass :size="13" />
        <input ref="searchInput" v-model="query" type="text" placeholder="搜索工作区" aria-label="搜索工作区" />
      </label>
      <div class="draft-project-list">
        <button
          v-for="project in filteredProjects"
          :key="project.id"
          type="button"
          class="draft-project-option"
          :class="{ 'is-active': project.id === workspaceId }"
          @click="choose(project.id)"
        >
          <PhFolderSimple :size="14" />
          <span>{{ project.name }}</span>
        </button>
        <div v-if="filteredProjects.length === 0" class="draft-project-empty">没有匹配的工作区</div>
      </div>
      <button type="button" class="draft-project-open" @click="openFolder">
        <PhPlus :size="14" />
        <span>打开文件夹</span>
      </button>
    </div>
  </div>
</template>
