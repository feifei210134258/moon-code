import { describe, expect, it } from 'vitest'
import {
  validatePromptControls,
  validatePromptInput,
  validateSideChatPromptInput
} from '../../src/main/security/promptInputs.js'

const controls = {
  model: 'kimi-for-coding', thinking: 'high', permissionMode: 'manual', planMode: true, swarmMode: false, towerMode: false
}

describe('prompt inputs', () => {
  it('keeps all Kimi prompt control fields at the Renderer trust boundary', () => {
    expect(validatePromptInput({ text: '继续', controls })).toEqual({ text: '继续', controls })
    expect(validatePromptControls(controls)).toEqual(controls)
    expect(validatePromptInput({ text: '持续完成', controls, goalObjective: '  完成所有 P0  ' })).toEqual({
      text: '持续完成', controls, goalObjective: '完成所有 P0'
    })
    expect(validatePromptInput({ text: '先检查失败原因', controls, deliveryMode: 'steer' })).toEqual({
      text: '先检查失败原因', controls, deliveryMode: 'steer'
    })
  })

  it('rejects incomplete or invented session modes', () => {
    expect(() => validatePromptInput({ text: '继续', controls: { ...controls, permissionMode: 'workspace' } })).toThrow()
    expect(() => validatePromptControls({ ...controls, model: '' })).toThrow()
    expect(() => validatePromptInput({ text: ' ', controls })).toThrow()
    expect(() => validatePromptInput({ text: '继续', controls, deliveryMode: 'interrupt' })).toThrow()
  })

  it('passes submitted skills through and allows skill-only prompts', () => {
    expect(validatePromptInput({
      text: '', controls, skills: [{ name: 'commit', args: '-m "x"' }, { name: 'pdf' }]
    })).toEqual({
      text: '', controls, skills: [{ name: 'commit', args: '-m "x"' }, { name: 'pdf' }]
    })
    expect(validatePromptInput({
      text: '', controls, skills: [{ name: 'commit', args: '   ' }]
    })).toEqual({
      text: '', controls, skills: [{ name: 'commit' }]
    })
  })

  it('rejects malformed submitted skills', () => {
    expect(() => validatePromptInput({
      text: '继续', controls, skills: [{ name: '' }]
    })).toThrow()
    expect(() => validatePromptInput({
      text: '继续', controls, skills: [42]
    })).toThrow()
    expect(() => validatePromptInput({
      text: '继续', controls, skills: { name: 'commit' }
    })).toThrow()
    expect(() => validatePromptInput({
      text: '继续', controls, skills: []
    })).toThrow()
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

  it('passes picked web elements through with bounds and allows element-only prompts', () => {
    const webElement = {
      selector: 'button.save',
      xpath: '/html/body/button[1]',
      tag: 'button',
      ariaLabel: '保存',
      textSnippet: '保存',
      rect: { x: 0, y: 0, width: 90, height: 36 },
      pageUrl: 'preview://workspace/index.html',
      pageTitle: '预览页',
      styles: {
        display: 'inline-block', position: 'static', fontFamily: 'PingFang SC', fontSize: '13px',
        fontWeight: '600', lineHeight: '1.5', color: '#fff', background: '#1d4ed8',
        padding: '8px 18px', margin: '0px', border: 'none', borderRadius: '6px'
      }
    }
    expect(validatePromptInput({ text: '改样式', controls, webElements: [webElement] })).toEqual({
      text: '改样式', controls, webElements: [webElement]
    })
    expect(validatePromptInput({ text: '', controls, webElements: [webElement] })).toEqual({
      text: '', controls, webElements: [webElement]
    })
    expect(() => validateSideChatPromptInput({ text: '只检查测试', controls, webElements: [webElement] }))
      .toThrow('Kimi Side Chat only accepts text prompts')
    expect(() => validatePromptInput({ text: '继续', controls, webElements: [{ ...webElement, selector: 42 }] }))
      .toThrow('Invalid picked element selector')
  })

  it('keeps BTW Side Chat text-only at the Main trust boundary', () => {
    expect(validateSideChatPromptInput({ text: '只检查测试', controls })).toEqual({ text: '只检查测试', controls })
    expect(() => validateSideChatPromptInput({
      text: '不要接受附件', controls,
      attachments: [{ fileId: 'file-1', name: 'secret.txt', mediaType: 'text/plain', size: 1 }]
    })).toThrow('Kimi Side Chat only accepts text prompts')
  })
})
