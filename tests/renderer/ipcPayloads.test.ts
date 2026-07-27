import { reactive, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  ipcErrorMessage,
  toCloneableApprovalResponse,
  toCloneableBrowserAnnotationInput,
  toCloneablePromptControls,
  toCloneablePromptInput,
  toCloneableQuestionAnswers,
  toCloneableSideChatPromptInput
} from '../../src/renderer/src/utils/ipcPayloads.js'
import type {
  BrowserAnnotationSubmitInput,
  KimiPromptControls,
  KimiPromptInput,
  KimiSideChatPromptInput,
  QuestionAnswerInput
} from '../../src/shared/contracts.js'

describe('renderer IPC payload DTOs', () => {
  it('deeply removes Vue proxies from prompts while preserving optional fields', () => {
    const controls = reactive<KimiPromptControls>({
      model: 'kimi-for-coding',
      thinking: 'high',
      permissionMode: 'auto',
      planMode: true,
      swarmMode: false
    })
    const input = reactive<KimiPromptInput>({
      text: '继续修复',
      controls,
      attachments: [{
        fileId: 'file-1',
        name: 'index.html',
        mediaType: 'text/html',
        size: 128
      }],
      goalObjective: '修复页面',
      deliveryMode: 'steer'
    })

    expect(() => structuredClone(input)).toThrow()
    expect(structuredClone(toCloneablePromptInput(input))).toEqual({
      text: '继续修复',
      controls: {
        model: 'kimi-for-coding',
        thinking: 'high',
        permissionMode: 'auto',
        planMode: true,
        swarmMode: false
      },
      attachments: [{
        fileId: 'file-1',
        name: 'index.html',
        mediaType: 'text/html',
        size: 128
      }],
      goalObjective: '修复页面',
      deliveryMode: 'steer'
    })
    expect(structuredClone(toCloneablePromptControls(controls))).toEqual({ ...controls })
  })

  it('makes Side Chat, annotations, approvals, and all question answer variants cloneable', () => {
    const controls = reactive<KimiPromptControls>({
      model: 'kimi-for-coding', thinking: 'medium', permissionMode: 'manual',
      planMode: false, swarmMode: true
    })
    const sideChat = reactive<KimiSideChatPromptInput>({ text: '帮我检查', controls })
    const annotation = reactive<BrowserAnnotationSubmitInput>({
      draftId: 'draft-1',
      comment: '调整这个区域',
      pageUrl: 'http://localhost:4173/',
      includeSelector: true,
      includeText: false,
      includeScreenshot: true
    })
    const approval = reactive({ decision: 'approved' as const, scope: 'session' as const })
    const answers = ref<Record<string, QuestionAnswerInput>>({
      single: { kind: 'single', option_id: 'one' },
      multi: { kind: 'multi', option_ids: ['one', 'two'] },
      other: { kind: 'other', text: '自定义' },
      mixed: { kind: 'multi_with_other', option_ids: ['one'], other_text: '补充' },
      skipped: { kind: 'skipped' }
    })

    const payloads = [
      toCloneableSideChatPromptInput(sideChat),
      toCloneableBrowserAnnotationInput(annotation),
      toCloneableApprovalResponse(approval),
      toCloneableQuestionAnswers(answers.value)
    ]
    for (const payload of payloads) expect(() => structuredClone(payload)).not.toThrow()

    expect(payloads[0]).toEqual({ text: '帮我检查', controls: { ...controls } })
    expect(payloads[1]).toEqual({ ...annotation })
    expect(payloads[2]).toEqual({ decision: 'approved', scope: 'session' })
    expect(payloads[3]).toEqual({
      single: { kind: 'single', option_id: 'one' },
      multi: { kind: 'multi', option_ids: ['one', 'two'] },
      other: { kind: 'other', text: '自定义' },
      mixed: { kind: 'multi_with_other', option_ids: ['one'], other_text: '补充' },
      skipped: { kind: 'skipped' }
    })
  })

  it('translates structured clone failures without hiding unrelated errors', () => {
    const cloneError = new DOMException('An object could not be cloned.', 'DataCloneError')

    expect(ipcErrorMessage(cloneError)).toBe('发送消息失败：参数无法序列化，请重试。')
    expect(ipcErrorMessage(new Error('网络中断'))).toBe('网络中断')
  })
})
