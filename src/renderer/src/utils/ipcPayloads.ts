import type {
  BrowserAnnotationSubmitInput,
  KimiPromptControls,
  KimiPromptInput,
  KimiSideChatPromptInput,
  KimiUploadedFile,
  QuestionAnswerInput
} from '@shared/contracts'

export type ApprovalResponse = {
  decision: 'approved' | 'rejected' | 'cancelled'
  scope?: 'session'
}

export function toCloneablePromptControls(controls: KimiPromptControls): KimiPromptControls {
  return {
    model: controls.model,
    thinking: controls.thinking,
    permissionMode: controls.permissionMode,
    planMode: controls.planMode,
    swarmMode: controls.swarmMode
  }
}

export function toCloneableUploadedFile(file: KimiUploadedFile): KimiUploadedFile {
  return {
    fileId: file.fileId,
    name: file.name,
    mediaType: file.mediaType,
    size: file.size
  }
}

export function toCloneablePromptInput(input: KimiPromptInput): KimiPromptInput {
  const cloneable: KimiPromptInput = {
    text: input.text,
    controls: toCloneablePromptControls(input.controls)
  }
  if (input.attachments !== undefined) {
    cloneable.attachments = input.attachments.map(toCloneableUploadedFile)
  }
  if (input.goalObjective !== undefined) cloneable.goalObjective = input.goalObjective
  return cloneable
}

export function toCloneableSideChatPromptInput(
  input: KimiSideChatPromptInput
): KimiSideChatPromptInput {
  return {
    text: input.text,
    controls: toCloneablePromptControls(input.controls)
  }
}

export function toCloneableBrowserAnnotationInput(
  input: BrowserAnnotationSubmitInput
): BrowserAnnotationSubmitInput {
  return {
    draftId: input.draftId,
    comment: input.comment,
    pageUrl: input.pageUrl,
    includeSelector: input.includeSelector,
    includeText: input.includeText,
    includeScreenshot: input.includeScreenshot
  }
}

export function toCloneableApprovalResponse(response: ApprovalResponse): ApprovalResponse {
  const cloneable: ApprovalResponse = { decision: response.decision }
  if (response.scope !== undefined) cloneable.scope = response.scope
  return cloneable
}

export function toCloneableQuestionAnswers(
  answers: Record<string, QuestionAnswerInput>
): Record<string, QuestionAnswerInput> {
  return Object.fromEntries(
    Object.entries(answers).map(([questionId, answer]) => [questionId, toCloneableQuestionAnswer(answer)])
  )
}

export function ipcErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (
    (error instanceof Error && error.name === 'DataCloneError') ||
    /DataCloneError|could not be cloned/i.test(message)
  ) {
    return '发送消息失败：参数无法序列化，请重试。'
  }
  return message
}

function toCloneableQuestionAnswer(answer: QuestionAnswerInput): QuestionAnswerInput {
  switch (answer.kind) {
    case 'single':
      return { kind: 'single', option_id: answer.option_id }
    case 'multi':
      return { kind: 'multi', option_ids: answer.option_ids.map((optionId) => optionId) }
    case 'other':
      return { kind: 'other', text: answer.text }
    case 'multi_with_other':
      return {
        kind: 'multi_with_other',
        option_ids: answer.option_ids.map((optionId) => optionId),
        other_text: answer.other_text
      }
    case 'skipped':
      return { kind: 'skipped' }
  }
}
