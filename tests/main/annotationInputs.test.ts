import { describe, expect, it } from 'vitest'
import {
  validateAnnotationDraftId,
  validateAnnotationMode,
  validateAnnotationSubmitInput
} from '../../src/main/security/annotationInputs.js'

describe('annotation inputs', () => {
  it('accepts only the bounded element and region modes', () => {
    expect(validateAnnotationMode('element')).toBe('element')
    expect(validateAnnotationMode('region')).toBe('region')
    expect(() => validateAnnotationMode('dom')).toThrow()
  })

  it('validates editable submission fields without accepting extra shapes', () => {
    expect(validateAnnotationSubmitInput({
      draftId: 'a3b3b07a-18e5-4d99-8354-55f31a1f8210',
      comment: '  调整这个按钮的间距  ',
      pageUrl: ' preview://workspace/index.html ',
      includeSelector: true,
      includeText: false,
      includeScreenshot: true
    })).toEqual({
      draftId: 'a3b3b07a-18e5-4d99-8354-55f31a1f8210',
      comment: '调整这个按钮的间距',
      pageUrl: 'preview://workspace/index.html',
      includeSelector: true,
      includeText: false,
      includeScreenshot: true
    })
    expect(() => validateAnnotationSubmitInput({ draftId: 'x', comment: '' })).toThrow()
    expect(() => validateAnnotationDraftId('../draft')).toThrow()
  })
})
