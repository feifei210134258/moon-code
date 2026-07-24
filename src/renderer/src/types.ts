export type SessionTone = 'neutral' | 'running' | 'attention' | 'unread'

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

export type ExtensionTab = 'changes' | 'files' | 'browser'

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
  role: 'user' | 'assistant'
  author: string
  time: string
  blocks: ChatBlock[]
  queued?: boolean
}
