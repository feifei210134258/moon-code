import { describe, expect, it } from 'vitest'
import { validatePromptControls, validatePromptInput } from '../../src/main/security/promptInputs.js'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false
}

describe('prompt inputs', () => {
  it('keeps all Kimi prompt control fields at the Renderer trust boundary', () => {
    expect(validatePromptInput({ text: '继续', controls })).toEqual({ text: '继续', controls })
    expect(validatePromptControls(controls)).toEqual(controls)
    expect(validatePromptInput({ text: '持续完成', controls, goalObjective: '  完成所有 P0  ' })).toEqual({
      text: '持续完成', controls, goalObjective: '完成所有 P0'
    })
  })

  it('rejects incomplete or invented session modes', () => {
    expect(() => validatePromptInput({ text: '继续', controls: { ...controls, permissionMode: 'workspace' } })).toThrow()
    expect(() => validatePromptControls({ ...controls, model: '' })).toThrow()
    expect(() => validatePromptInput({ text: ' ', controls })).toThrow()
  })

  it('accepts attachment-only prompts while validating uploaded file descriptors', () => {
    const attachment = {
      fileId: 'file-1', name: 'design.png', mediaType: 'image/png', size: 2048
    }
    expect(validatePromptInput({ text: '', controls, attachments: [attachment] })).toEqual({
      text: '', controls, attachments: [attachment]
    })
    expect(() => validatePromptInput({
      text: '', controls, attachments: [{ ...attachment, mediaType: 'not-a-mime' }]
    })).toThrow()
  })
})
