import { defineStore } from 'pinia'
import type {
  PlanReview,
  SessionRetryStatus,
  SessionTranscriptMessage,
  SessionTranscriptPart,
  SessionViewState,
  SkillActivationView,
  WorkspaceNavigationItem
} from '@shared/contracts'
import type { ChatTurn, ExtensionTab, ProjectItem } from '../types'
import { rendererLocale } from '../i18n/rendererLocale'

const VIEWED_SESSION_UPDATES_KEY = 'moon-code:viewed-session-updates'
// v2 intentionally drops the old selection-based timestamps. Only accepted
// conversation submissions are written to this activity store now.
const NAVIGATION_ACTIVITY_KEY = 'moon-code:navigation-activity:v2'
// Remembers which workspaces the user expanded, so a relaunch restores the
// same sidebar instead of falling back to a fixed default.
const PROJECT_EXPANSION_KEY = 'moon-code:project-expansion:v1'

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
    /* 草稿会话：「新建任务」先进入草稿态，发出首条消息时才真正创建会话。 */
    draftActive: false,
    draftWorkspaceId: '',
    activeExtension: 'files' as ExtensionTab,
    rightPanelOpen: false,
    leftPanelWidth: 260,
    rightPanelWidth: 332,
    terminalOpen: false,
    turns: structuredClone(initialTurns),
    transcriptPhase: 'idle' as SessionViewState['phase'],
    transcriptError: null as string | null,
    transcriptHasMore: false,
    /* 会话最近一轮的结局与失败/重试摘要：由 hydrateTranscript 从
       SessionViewState 带进来，供失败卡片与重试指示使用。 */
    lastTurnReason: null as SessionViewState['lastTurnReason'],
    lastTurnError: null as string | null,
    retry: null as SessionRetryStatus | null,
    /* 最近一次 turn.started 报告的 skills（0.37.2+）；来自 SessionViewState。 */
    skillActivations: [] as SkillActivationView[],
    /* Plan 查看面板当前打开的计划条目；无对应打开的面板时为 null。 */
    planReview: null as PlanReview | null,
    viewedSessionUpdates: loadViewedSessionUpdates(),
    navigationActivity: loadNavigationActivity(),
    projectExpansion: loadProjectExpansion(),
    sessionUpdates: {} as Record<string, string | null>,
    /* 其他客户端归档了当前打开的会话：保留会话视图并显示非阻塞提示。
       清除时机：用户显式选择其他会话/工作区/草稿，或该会话重新出现在权威树中。 */
    sessionArchivedNotice: null as { sessionId: string; title: string } | null
  }),
  actions: {
    toggleProject(projectId: string) {
      const project = this.projects.find((item) => item.id === projectId)
      if (project === undefined) return
      project.expanded = !project.expanded
      rememberProjectExpansion(this.projectExpansion, projectId, project.expanded)
    },
    /* 其他客户端归档了当前打开的会话：记录提示，但保留当前会话视图不强制跳出。 */
    noteSessionArchived(sessionId: string, title: string) {
      if (sessionId !== this.activeSessionId || this.draftActive) return
      this.sessionArchivedNotice = { sessionId, title }
    },
    dismissSessionArchivedNotice() {
      this.sessionArchivedNotice = null
    },
    selectWorkspace(workspaceId: string) {
      const workspace = this.projects.find((project) => project.id === workspaceId)
      if (workspace === undefined) return
      this.activeWorkspaceId = workspace.id
      workspace.expanded = true
      rememberProjectExpansion(this.projectExpansion, workspaceId, true)
      if (!workspace.sessions.some((session) => session.id === this.activeSessionId)) {
        this.activeSessionId = workspace.sessions[0]?.id ?? ''
      }
      this.sessionArchivedNotice = null
    },
    startDraft(workspaceId: string) {
      this.draftActive = true
      this.draftWorkspaceId = workspaceId
      this.activeSessionId = ''
      this.sessionArchivedNotice = null
      if (workspaceId.length > 0) {
        this.activeWorkspaceId = workspaceId
        const workspace = this.projects.find((project) => project.id === workspaceId)
        if (workspace !== undefined) {
          workspace.expanded = true
          rememberProjectExpansion(this.projectExpansion, workspaceId, true)
        }
      }
      /* 中间栏回到品牌空状态，输入框可用。 */
      this.turns = []
      this.transcriptPhase = 'ready'
      this.transcriptError = null
      this.transcriptHasMore = false
      this.lastTurnReason = null
      this.lastTurnError = null
      this.retry = null
      this.skillActivations = []
    },
    /* 打开 / 关闭 Plan 查看面板：面板只读展示，反馈动作由 App 层路由到输入框。 */
    openPlanReview(review: PlanReview) {
      this.planReview = {
        ...review,
        ...(review.options === undefined ? {} : { options: review.options.map((option) => ({ ...option })) })
      }
    },
    closePlanReview() {
      this.planReview = null
    },
    setDraftWorkspace(workspaceId: string) {
      if (!this.draftActive) return
      this.draftWorkspaceId = workspaceId
      this.activeWorkspaceId = workspaceId
      const workspace = this.projects.find((project) => project.id === workspaceId)
      if (workspace !== undefined) {
        workspace.expanded = true
        rememberProjectExpansion(this.projectExpansion, workspaceId, true)
      }
    },
    exitDraft() {
      this.draftActive = false
      this.draftWorkspaceId = ''
    },
    selectSession(sessionId: string) {
      /* 点选任意已有会话（或首条消息创建成功后）退出草稿态。 */
      this.draftActive = false
      this.draftWorkspaceId = ''
      this.activeSessionId = sessionId
      this.sessionArchivedNotice = null
      const workspace = this.projects.find((project) => project.sessions.some((session) => session.id === sessionId))
      if (workspace !== undefined) this.activeWorkspaceId = workspace.id
      const session = workspace?.sessions.find((item) => item.id === sessionId)
      if (session?.tone === 'completed' || session?.tone === 'unread') session.tone = 'neutral'
      if (Object.prototype.hasOwnProperty.call(this.sessionUpdates, sessionId)) {
        this.viewedSessionUpdates = {
          ...this.viewedSessionUpdates,
          [sessionId]: this.sessionUpdates[sessionId] ?? null
        }
        persistViewedSessionUpdates(this.viewedSessionUpdates)
      }
    },
    markConversationActivity(sessionId: string) {
      if (sessionId.length === 0) return
      this.navigationActivity[`session:${sessionId}`] = new Date().toISOString()
      persistNavigationActivity(this.navigationActivity)
      sortProjectsByNavigationActivity(this.projects, this.navigationActivity, this.sessionUpdates)
    },
    setExtension(tab: ExtensionTab) {
      this.activeExtension = tab
      this.rightPanelOpen = true
    },
    setRightPanelWidth(width: number) {
      this.rightPanelWidth = Math.min(1040, Math.max(320, width))
    },
    setLeftPanelWidth(width: number) {
      this.leftPanelWidth = Math.min(420, Math.max(220, width))
    },
    toggleTerminal(force?: boolean) {
      this.terminalOpen = force ?? !this.terminalOpen
    },
    hydrateProjects(tree: WorkspaceNavigationItem[]) {
      const expandedById = new Map(this.projects.map((project) => [project.id, project.expanded]))
      this.sessionUpdates = Object.fromEntries(tree.flatMap((workspace) =>
        workspace.sessions.map((session) => [session.id, session.updatedAt])
      ))
      const projects: ProjectItem[] = tree.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        expanded: expandedById.get(workspace.id) ?? this.projectExpansion[workspace.id] ?? false,
        sessions: [...workspace.sessions].sort((left, right) => compareNavigationItems(
          `session:${left.id}`,
          `session:${right.id}`,
          left.updatedAt,
          right.updatedAt,
          this.navigationActivity
        )).map((session) => {
          const relativeTime = formatRelativeTime(session.updatedAt)
          return {
            id: session.id,
            title: session.title || session.lastPrompt || '未命名任务',
            ...(relativeTime === undefined ? {} : { relativeTime }),
            ...(session.parentSessionId == null ? {} : { parentSessionId: session.parentSessionId }),
            tone: navigationTone(session, this.viewedSessionUpdates)
          }
        })
      })).sort((left, right) => compareProjects(left, right, this.navigationActivity, this.sessionUpdates))
      this.projects = projects
      const selectedWorkspace = projects.find((project) => project.id === this.activeWorkspaceId)
      const activeStillExists = projects.some((project) =>
        project.sessions.some((session) => session.id === this.activeSessionId)
      )
      /* 其他客户端归档了当前会话：受控重读后树里不再有它，但保留当前视图
         不强制跳出；用户显式导航或会话恢复后自动解除。 */
      const keepArchivedView = this.sessionArchivedNotice !== null &&
        this.sessionArchivedNotice.sessionId === this.activeSessionId
      if (!activeStillExists && !this.draftActive && !keepArchivedView) {
        this.activeSessionId = selectedWorkspace?.sessions[0]?.id
          ?? projects.flatMap((project) => project.sessions)[0]?.id
          ?? ''
      }
      if (activeStillExists && keepArchivedView) this.sessionArchivedNotice = null
      const activeSessionWorkspace = projects.find((project) =>
        project.sessions.some((session) => session.id === this.activeSessionId)
      )
      if (selectedWorkspace === undefined) {
        this.activeWorkspaceId = activeSessionWorkspace?.id ?? projects[0]?.id ?? ''
      }
      /* 从未手动展开/折叠过的项目默认收起，唯独展开当前会话所在的项目，
       * 让重启后侧边栏停在退出前正在对话的位置。 */
      const hostWorkspace = activeSessionWorkspace
        ?? projects.find((project) => project.id === this.activeWorkspaceId)
      if (
        hostWorkspace !== undefined
        && expandedById.get(hostWorkspace.id) === undefined
        && this.projectExpansion[hostWorkspace.id] === undefined
      ) {
        hostWorkspace.expanded = true
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
          tone: navigationTone(child, this.viewedSessionUpdates)
        })
        this.sessionUpdates[child.id] = child.updatedAt
        seen.add(child.id)
      }
    },
    hydrateTranscript(state: SessionViewState) {
      if (state.sessionId !== this.activeSessionId) return
      this.transcriptPhase = state.phase
      this.transcriptError = state.error
      this.transcriptHasMore = state.hasMoreMessages
      this.turns = groupTranscriptTurns(state.messages)
      this.lastTurnReason = state.lastTurnReason
      this.lastTurnError = state.lastTurnError
      this.retry = state.retry === null ? null : { ...state.retry }
      this.skillActivations = (state.skillActivations ?? []).map((activation) => ({ ...activation }))
    },
    markTranscriptLoading(sessionId: string) {
      if (sessionId !== this.activeSessionId) return
      this.transcriptPhase = 'loading'
      this.transcriptError = null
      this.turns = []
      this.lastTurnReason = null
      this.lastTurnError = null
      this.retry = null
      this.skillActivations = []
      this.planReview = null
    }
  }
})

function navigationTone(
  session: WorkspaceNavigationItem['sessions'][number],
  viewedSessionUpdates: Record<string, string | null>
): 'neutral' | 'running' | 'completed' | 'attention' {
  if (session.pendingInteraction !== 'none') return 'attention'
  if (session.busy) return 'running'
  if (session.lastTurnReason !== 'completed') return 'neutral'
  const wasViewed = Object.prototype.hasOwnProperty.call(viewedSessionUpdates, session.id) &&
    viewedSessionUpdates[session.id] === session.updatedAt
  return wasViewed ? 'neutral' : 'completed'
}

function loadViewedSessionUpdates(): Record<string, string | null> {
  if (typeof window === 'undefined') return {}
  try {
    const value = JSON.parse(window.localStorage.getItem(VIEWED_SESSION_UPDATES_KEY) ?? '{}') as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string | null] => (
      typeof entry[1] === 'string' || entry[1] === null
    )))
  } catch {
    return {}
  }
}

function persistViewedSessionUpdates(updates: Record<string, string | null>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(VIEWED_SESSION_UPDATES_KEY, JSON.stringify(updates))
  } catch {
    // Status acknowledgement remains valid for this renderer lifetime if storage is unavailable.
  }
}

function loadNavigationActivity(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const value = JSON.parse(window.localStorage.getItem(NAVIGATION_ACTIVITY_KEY) ?? '{}') as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string' && Number.isFinite(Date.parse(entry[1]))
    )))
  } catch {
    return {}
  }
}

function persistNavigationActivity(activity: Record<string, string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NAVIGATION_ACTIVITY_KEY, JSON.stringify(activity))
  } catch {
    // Sorting remains correct for the current renderer lifetime if storage is unavailable.
  }
}

function loadProjectExpansion(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const value = JSON.parse(window.localStorage.getItem(PROJECT_EXPANSION_KEY) ?? '{}') as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, boolean] => (
      typeof entry[1] === 'boolean'
    )))
  } catch {
    return {}
  }
}

function rememberProjectExpansion(expansion: Record<string, boolean>, projectId: string, expanded: boolean): void {
  expansion[projectId] = expanded
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PROJECT_EXPANSION_KEY, JSON.stringify(expansion))
  } catch {
    // Expansion remains correct for the current renderer lifetime if storage is unavailable.
  }
}

function navigationTimestamp(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function compareNavigationItems(
  leftKey: string,
  rightKey: string,
  leftUpdatedAt: string | null | undefined,
  rightUpdatedAt: string | null | undefined,
  activity: Record<string, string>
): number {
  const leftTimestamp = Math.max(navigationTimestamp(activity[leftKey]), navigationTimestamp(leftUpdatedAt))
  const rightTimestamp = Math.max(navigationTimestamp(activity[rightKey]), navigationTimestamp(rightUpdatedAt))
  return rightTimestamp - leftTimestamp
}

function compareProjects(
  left: ProjectItem,
  right: ProjectItem,
  activity: Record<string, string>,
  sessionUpdates: Record<string, string | null>
): number {
  const leftTimestamp = Math.max(
    navigationTimestamp(activity[`workspace:${left.id}`]),
    ...left.sessions.map((session) => Math.max(
      navigationTimestamp(activity[`session:${session.id}`]),
      navigationTimestamp(sessionUpdates[session.id])
    ))
  )
  const rightTimestamp = Math.max(
    navigationTimestamp(activity[`workspace:${right.id}`]),
    ...right.sessions.map((session) => Math.max(
      navigationTimestamp(activity[`session:${session.id}`]),
      navigationTimestamp(sessionUpdates[session.id])
    ))
  )
  return rightTimestamp - leftTimestamp
}

function sortProjectsByNavigationActivity(
  projects: ProjectItem[],
  activity: Record<string, string>,
  sessionUpdates: Record<string, string | null>
): void {
  for (const project of projects) {
    project.sessions.sort((left, right) => compareNavigationItems(
      `session:${left.id}`,
      `session:${right.id}`,
      sessionUpdates[left.id],
      sessionUpdates[right.id],
      activity
    ))
  }
  projects.sort((left, right) => compareProjects(left, right, activity, sessionUpdates))
}

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
      if (turn.pending === true) last.pending = true
      else delete last.pending
      if (turn.writtenFiles !== undefined) {
        const merged = [...(last.writtenFiles ?? []), ...turn.writtenFiles]
        last.writtenFiles = merged.filter((path, index) => merged.indexOf(path) === index)
      }
    } else {
      turns.push(turn)
    }
  }
  return turns
}

function mapTranscriptMessage(message: SessionTranscriptMessage): ChatTurn {
  const skillNames = message.skillActivations
    ?.map((activation) => activation.skillName)
    .filter((name) => name.length > 0)
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
  /* 回合内写入/修改过的文件（writtenPath 聚合，去重保序），供回合末更改摘要卡使用。 */
  const writtenFiles = message.content
    .filter((part): part is Extract<SessionTranscriptPart, { type: 'tool' }> =>
      part.type === 'tool' && typeof part.writtenPath === 'string' && part.writtenPath.length > 0)
    .map((part) => part.writtenPath as string)
  return {
    id: message.id,
    promptId: message.promptId,
    role: message.role === 'user' ? 'user' : 'assistant',
    author: message.role === 'user' ? 'You' : message.role === 'tool' ? 'Tool' : 'Kimi',
    time: formatMessageTime(message.createdAt),
    blocks,
    ...(message.originKind === undefined ? {} : { originKind: message.originKind }),
    ...(skillNames !== undefined && skillNames.length > 0 ? { skillNames } : {}),
    ...(writtenFiles.length > 0 ? { writtenFiles } : {}),
    ...(message.role === 'user' && message.status === 'pending' ? { queued: true } : {}),
    ...(message.role === 'assistant' && message.status === 'pending' ? { pending: true } : {})
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
        ...(part.toolDiff === undefined ? {} : { toolDiff: part.toolDiff }),
        ...(part.writtenPath === undefined ? {} : { writtenPath: part.writtenPath }),
        ...(part.plan === undefined ? {} : { plan: part.plan })
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
