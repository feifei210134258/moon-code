import { describe, expect, it } from 'vitest'
import {
  validateCompactInstruction,
  validateMarkdownImageSource,
  validateUndoCount
} from '../../src/main/security/conversationInputs.js'

describe('conversation IPC input validation', () => {
  it('normalizes optional Compact instructions and bounds Undo count', () => {
    expect(validateCompactInstruction('  保留当前约束  ')).toBe('保留当前约束')
    expect(validateCompactInstruction('   ')).toBeUndefined()
    expect(validateUndoCount(undefined)).toBe(1)
    expect(validateUndoCount(3)).toBe(3)
    expect(() => validateUndoCount(0)).toThrow('Invalid Kimi undo count')
    expect(() => validateUndoCount(101)).toThrow('Invalid Kimi undo count')
  })

  it('accepts local Markdown image sources but rejects remote and malformed values', () => {
    expect(validateMarkdownImageSource('./assets/preview.png')).toBe('./assets/preview.png')
    expect(validateMarkdownImageSource('/workspace/assets/preview.png')).toBe('/workspace/assets/preview.png')
    expect(() => validateMarkdownImageSource('https://example.com/tracker.png')).toThrow(
      'Invalid Kimi Markdown image source'
    )
    expect(() => validateMarkdownImageSource('data:image/png;base64,AA==')).toThrow(
      'Invalid Kimi Markdown image source'
    )
  })
})
