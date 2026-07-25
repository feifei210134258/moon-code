import { defineStore } from 'pinia'
import type {
  SessionTranscriptMessage,
  SessionTranscriptPart,
  SessionViewState,
  WorkspaceNavigationItem
} from '@shared/contracts'
import type { ChatTurn, ExtensionTab, ProjectItem } from '../types'
import { rendererLocale } from '../i18n/rendererLocale'

const initialProjects: ProjectItem[] = [
  {
    id: 'kimi-agent',
    name: 'moon-code',
    expanded: true,
    sessions: [
      {
        id: 'explore-client',
        title: '探索 Moon Code 客户端方案',
        relativeTime: '2m',
        tone: 'running'
      }
    ]
  },
  {
    id: 'student-review',
    name: '学生评价',
    expanded: true,
    sessions: [
      { id: 'permission-doc', title: '检查腾讯文档读写权限', relativeTime: '4m' },
      { id: 'review-prd', title: '梳理学生评价模块并出 PRD', relativeTime: '12m', tone: 'unread' },
      { id: 'remove-prd-shot', title: '删除 PRD 校验截图', relativeTime: '18m' }
    ]
  },
  { id: 'student-tablet', name: '学生平板端', expanded: false, sessions: [] },
  { id: 'yuque-clone', name: '仿语雀', expanded: false, sessions: [] },
  { id: 'ai-study', name: 'AI自习', expanded: false, sessions: [] },
  { id: 'personal-projects', name: '个人项目管理', expanded: false, sessions: [] },
  { id: 'promotion', name: '升云阶', expanded: false, sessions: [] },
  { id: 'enrollment', name: '招生迎新', expanded: false, sessions: [] }
]

const initialTurns: ChatTurn[] = [
  {
    id: 'turn-user-1',
    role: 'user',
    author: 'You',
    time: '10:24',
    blocks: [
      { id: 'turn-user-1:text:0', type: 'text', text: '帮我用 HTML、CSS 和少量 JavaScript 创建一个本地可运行的清爽落地页。' },
      { id: 'turn-user-1:text:1', type: 'text', text: '保持移动端自适应，文件结构放在 app 目录下，并在完成后运行验证。' }
    ]
  },
  {
    id: 'turn-assistant-1',
    role: 'assistant',
    author: 'Kimi',
    time: '10:25',
    blocks: [
      { id: 'turn-assistant-1:text:0', type: 'text', text: '已完成落地页的搭建与样式实现，并确认可以在本地直接打开运行。' },
      { id: 'turn-assistant-1:text:1', type: 'text', text: '主要文件如下；你也可以在右侧浏览器里检查页面效果。' },
      { id: 'turn-assistant-1:file:0', type: 'file', name: 'app/index.html' },
      { id: 'turn-assistant-1:file:1', type: 'file', name: 'src/agent/session.ts' },
      { id: 'turn-assistant-1:file:2', type: 'file', name: 'styles.css' }
    ]
  }
]

export const useWorkbenchStore = defineStore('workbench', {
  state: () => ({
    projects: structuredClone(initialProjects),
    activeWorkspaceId: 'kimi-agent',
    activeSessionId: 'explore-client',
    activeExtension: 'changes' as ExtensionTab,
    rightPanelOpen: true,
    rightPanelWidth: 382,
    terminalOpen: false,
    turns: structuredClone(initialTurns),
    transcriptPhase: 'idle' as SessionViewState['phase'],
    transcriptError: null as string | null,
    transcriptHasMore: false
  }),
  actions: {
    toggleProject(projectId: string) {
      const project = this.projects.find((item) => item.id === projectId)
      if (project !== undefined) {
        this.activeWorkspaceId = project.id
        if (!project.sessions.some((session) => session.id === this.activeSessionId)) {
          this.activeSessionId = project.sessions[0]?.id ?? ''
          if (this.activeSessionId.length === 0) {
            this.turns = []
            this.transcriptPhase = 'idle'
            this.transcriptError = null
            this.transcriptHasMore = false
          }
        }
        project.expanded = !project.expanded
      }
    },
    selectWorkspace(workspaceId: string) {
      const workspace = this.projects.find((project) => project.id === workspaceId)
      if (workspace === undefined) return
      this.activeWorkspaceId = workspace.id
      workspace.expanded = true
      if (!workspace.sessions.some((session) => session.id === this.activeSessionId)) {
        this.activeSessionId = workspace.sessions[0]?.id ?? ''
      }
    },
    selectSession(sessionId: string) {
      this.activeSessionId = sessionId
      const workspace = this.projects.find((project) => project.sessions.some((session) => session.id === sessionId))
      if (workspace !== undefined) this.activeWorkspaceId = workspace.id
    },
    setExtension(tab: ExtensionTab) {
      this.activeExtension = tab
      this.rightPanelOpen = true
    },
    setRightPanelWidth(width: number) {
      this.rightPanelWidth = Math.min(520, Math.max(320, width))
    },
    toggleTerminal(force?: boolean) {
      this.terminalOpen = force ?? !this.terminalOpen
    },
    hydrateProjects(tree: WorkspaceNavigationItem[]) {
      const expandedById = new Map(this.projects.map((project) => [project.id, project.expanded]))
      const projects: ProjectItem[] = tree.map((workspace, index) => ({
        id: workspace.id,
        name: workspace.name,
        expanded: expandedById.get(workspace.id) ?? index < 2,
        sessions: workspace.sessions.map((session) => {
          const relativeTime = formatRelativeTime(session.updatedAt)
          return {
            id: session.id,
            title: session.title || session.lastPrompt || '未命名任务',
            ...(relativeTime === undefined ? {} : { relativeTime }),
            ...(session.parentSessionId == null ? {} : { parentSessionId: session.parentSessionId }),
            tone: session.pendingInteraction !== 'none'
              ? 'attention'
              : session.busy
                ? 'running'
                : session.lastTurnReason === 'completed'
                  ? 'neutral'
                  : 'unread'
          }
        })
      }))
      this.projects = projects
      const selectedWorkspace = projects.find((project) => project.id === this.activeWorkspaceId)
      const activeStillExists = projects.some((project) =>
        project.sessions.some((session) => session.id === this.activeSessionId)
      )
      if (!activeStillExists) {
        this.activeSessionId = selectedWorkspace?.sessions[0]?.id
          ?? projects.flatMap((project) => project.sessions)[0]?.id
          ?? ''
      }
      const activeSessionWorkspace = projects.find((project) =>
        project.sessions.some((session) => session.id === this.activeSessionId)
      )
      if (selectedWorkspace === undefined) {
        this.activeWorkspaceId = activeSessionWorkspace?.id ?? projects[0]?.id ?? ''
      }
    },
    mergeSessionChildren(parentSessionId: string, children: WorkspaceNavigationItem['sessions']) {
      const project = this.projects.find((item) => item.sessions.some((session) => session.id === parentSessionId))
      if (project === undefined) return
      const seen = new Set(project.sessions.map((session) => session.id))
      for (const child of children) {
        if (seen.has(child.id)) continue
        const relativeTime = formatRelativeTime(child.updatedAt)
        project.sessions.push({
          id: child.id,
          title: child.title || child.lastPrompt || '未命名子任务',
          parentSessionId,
          ...(relativeTime === undefined ? {} : { relativeTime }),
          tone: child.pendingInteraction !== 'none'
            ? 'attention'
            : child.busy
              ? 'running'
              : 'neutral'
        })
        seen.add(child.id)
      }
    },
    hydrateTranscript(state: SessionViewState) {
      if (state.sessionId !== this.activeSessionId) return
      this.transcriptPhase = state.phase
      this.transcriptError = state.error
      this.transcriptHasMore = state.hasMoreMessages
      this.turns = groupTranscriptTurns(state.messages)
    },
    markTranscriptLoading(sessionId: string) {
      if (sessionId !== this.activeSessionId) return
      this.transcriptPhase = 'loading'
      this.transcriptError = null
      this.turns = []
    }
  }
})

/* 同一轮里 Kimi CLI 会拆出多条 assistant 消息；展示层聚合成一个 Kimi 回合，
 * 直到下一个用户消息（或 cron/compaction 来源标记）才开启新回合。 */
function groupTranscriptTurns(messages: SessionTranscriptMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = []
  for (const message of messages) {
    const turn = mapTranscriptMessage(message)
    const last = turns.at(-1)
    if (turn.role === 'assistant' && last?.role === 'assistant' && message.originKind === undefined) {
      last.blocks.push(...turn.blocks)
      if (last.author !== 'Kimi' && turn.author === 'Kimi') last.author = 'Kimi'
    } else {
      turns.push(turn)
    }
  }
  return turns
}

function mapTranscriptMessage(message: SessionTranscriptMessage): ChatTurn {
  const blocks: ChatTurn['blocks'] = []
  if (message.originKind === 'cron') {
    blocks.push({
      id: `${message.id}:origin:cron`,
      type: 'activity',
      activity: {
        id: `${message.id}:origin:cron`,
        kind: 'notice',
        label: 'Scheduled task',
        description: message.originTaskId === undefined
          ? '此轮由 Kimi 定时任务触发'
          : `此轮由 Kimi 定时任务 ${message.originTaskId} 触发`,
        status: 'done'
      }
    })
  } else if (message.originKind === 'compaction') {
    blocks.push({
      id: `${message.id}:origin:compaction`,
      type: 'activity',
      activity: {
        id: `${message.id}:origin:compaction`,
        kind: 'notice',
        label: 'Compaction',
        description: '此轮由 Kimi 上下文压缩生成',
        status: 'done'
      }
    })
  }
  for (const [index, part] of message.content.entries()) {
    projectPart(part, message.id, message.status, index === message.content.length - 1, index, blocks)
  }
  return {
    id: message.id,
    role: message.role === 'user' ? 'user' : 'assistant',
    author: message.role === 'user' ? 'You' : message.role === 'tool' ? 'Tool' : 'Kimi',
    time: formatMessageTime(message.createdAt),
    blocks,
    ...(message.role === 'user' && message.status === 'pending' ? { queued: true } : {})
  }
}

function projectPart(
  part: SessionTranscriptPart,
  messageId: string,
  messageStatus: SessionTranscriptMessage['status'],
  isTrailingPart: boolean,
  index: number,
  blocks: ChatTurn['blocks']
): void {
  if (part.type === 'text') {
    if (part.text.length > 0) blocks.push({ id: `${messageId}:text:${index}`, type: 'text', text: part.text })
    return
  }
  if (part.type === 'thinking') {
    blocks.push({
      id: `${messageId}:thinking:${index}`,
      type: 'activity',
      activity: {
        id: `${messageId}:thinking:${index}`,
        kind: 'thinking',
        label: 'Thinking',
        description: compactActivityText(part.text) || '正在思考…',
        status: messageStatus === 'pending' && isTrailingPart
          ? 'running'
          : messageStatus === 'error'
            ? 'error'
            : 'done',
        detail: part.text
      }
    })
    return
  }
  if (part.type === 'tool') {
    blocks.push({
      id: `${messageId}:tool:${part.toolCallId}`,
      type: 'activity',
      activity: {
        id: `${messageId}:tool:${part.toolCallId}`,
        kind: 'tool',
        label: part.toolName,
        description: part.description
          ?? (part.outputPreview === undefined ? '等待工具结果' : compactActivityText(part.outputPreview)),
        status: part.state,
        ...(part.inputPreview === undefined ? {} : { inputPreview: part.inputPreview }),
        ...(part.outputPreview === undefined ? {} : { outputPreview: part.outputPreview }),
        ...(part.outputStream === undefined ? {} : { outputStream: part.outputStream }),
        ...(part.progress === undefined ? {} : { progress: part.progress }),
        ...(part.toolDiff === undefined ? {} : { toolDiff: part.toolDiff })
      }
    })
    return
  }
  if (part.type === 'file') {
    blocks.push({
      id: `${messageId}:file:${index}`,
      type: 'attachment',
      fileId: part.fileId,
      name: part.name,
      mediaType: part.mediaType,
      size: part.size
    })
    return
  }
  if (part.type === 'media') {
    blocks.push({
      id: `${messageId}:media:${index}`,
      type: 'media',
      mediaType: part.mediaType,
      fileId: part.fileId,
      sourceMediaType: part.sourceMediaType,
      base64Data: part.base64Data
    })
  }
}

function compactActivityText(value: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine.length > 180 ? `${oneLine.slice(0, 180)}…` : oneLine
}

function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  return new Date(timestamp).toLocaleTimeString(rendererLocale(), { hour: '2-digit', minute: '2-digit' })
}

function formatRelativeTime(value: string | null): string | undefined {
  if (value === null) return undefined
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return undefined
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1_000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}
