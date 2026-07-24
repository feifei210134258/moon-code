import type { KimiPromptInput } from '@shared/contracts'

export interface LocalPromptDraft {
  id: string
  sessionId: string
  input: KimiPromptInput
  createdAt: string
}

export function appendLocalPromptDraft(
  queue: LocalPromptDraft[],
  draft: LocalPromptDraft
): LocalPromptDraft[] {
  return [...queue, cloneDraft(draft)]
}

export function removeLocalPromptDraft(
  queue: LocalPromptDraft[],
  draftId: string
): { queue: LocalPromptDraft[]; removed: LocalPromptDraft | null } {
  const index = queue.findIndex((draft) => draft.id === draftId)
  if (index < 0) return { queue, removed: null }
  const next = [...queue]
  const [removed] = next.splice(index, 1)
  return { queue: next, removed: removed === undefined ? null : cloneDraft(removed) }
}

export function moveLocalPromptDraft(
  queue: LocalPromptDraft[],
  draftId: string,
  direction: -1 | 1
): LocalPromptDraft[] {
  const from = queue.findIndex((draft) => draft.id === draftId)
  const to = from + direction
  if (from < 0 || to < 0 || to >= queue.length) return queue
  const next = [...queue]
  const [draft] = next.splice(from, 1)
  if (draft === undefined) return queue
  next.splice(to, 0, draft)
  return next
}

export function prependLocalPromptDraft(
  queue: LocalPromptDraft[],
  draft: LocalPromptDraft
): LocalPromptDraft[] {
  return [cloneDraft(draft), ...queue]
}

function cloneDraft(draft: LocalPromptDraft): LocalPromptDraft {
  return {
    ...draft,
    input: {
      ...draft.input,
      controls: { ...draft.input.controls },
      ...(draft.input.attachments === undefined
        ? {}
        : { attachments: draft.input.attachments.map((attachment) => ({ ...attachment })) })
    }
  }
}
