export type SessionTone = 'neutral' | 'running' | 'completed' | 'attention' | 'unread'

export interface SessionItem {
  id: string
  title: string
  relativeTime?: string
  tone?: SessionTone
  parentSessionId?: string
}

export interface ProjectItem {
  id: string
  name: string
  expanded: boolean
  sessions: SessionItem[]
}

export type ExtensionTab = 'files' | 'browser'

/**
 * 右侧栏文件树的渲染层状态。目录按需懒加载（每个目录一次官方 fs:list），
 * 展开状态在会话内保留；所有数据仍以 Kimi Server 的返回为唯一事实源。
 */
export interface WorkspaceFileTreeState {
  /** 根目录路径（'.' 表示 Session 工作目录）。 */
  root: string
  /** 目录路径 → 其子项；根目录的键为 root。 */
  children: Record<string, import('@shared/contracts').WorkspaceFileEntry[]>
  /** 已展开目录的路径集合。 */
  expanded: Record<string, true>
  /** 加载中的目录。 */
  pending: Record<string, true>
  /** 加载失败的目录及其错误。 */
  errors: Record<string, string>
  /** 根目录初次加载状态。 */
  rootPending: boolean
  rootError: string | null
  /** 根目录清单被服务端截断。 */
  truncated: boolean
}

export interface ChatActivity {
  id: string
  kind: 'thinking' | 'tool' | 'notice'
  label: string
  description: string
  status: 'running' | 'done' | 'error'
  detail?: string
  inputPreview?: string
  outputPreview?: string
  outputStream?: 'stdout' | 'stderr' | 'mixed'
  progress?: number
  toolDiff?: {
    path: string
    before: string
    after: string
    hunks: number | null
  }
  writtenPath?: string
  /** plan review 条目（来自 tool part 的 plan 投影；用于打开 Plan 查看面板）。 */
  plan?: import('@shared/contracts').PlanReview
}

export type ChatBlock =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'activity'; activity: ChatActivity }
  | { id: string; type: 'file'; name: string }
  | { id: string; type: 'attachment'; fileId: string; name: string; mediaType: string; size: number }
  | {
      id: string
      type: 'media'
      mediaType: 'image' | 'video'
      fileId: string | null
      sourceMediaType: string | null
      base64Data: string | null
    }

export interface ChatTurn {
  id: string
  promptId?: string | null
  role: 'user' | 'assistant'
  author: string
  time: string
  blocks: ChatBlock[]
  originKind?: string
  queued?: boolean
  pending?: boolean
  /** 该条用户消息激活的 skill 显示名（0.37.2+，按 transcription 标注）。 */
  skillNames?: string[]
  /** 该回合 AI 写入/修改过的文件（tool part 的 writtenPath 聚合，去重保序）；回合末更改摘要卡数据源。 */
  writtenFiles?: string[]
}
