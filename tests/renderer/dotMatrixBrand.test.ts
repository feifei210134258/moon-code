// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DotMatrixBrand from '../../src/renderer/src/components/DotMatrixBrand.vue'

describe('DotMatrixBrand', () => {
  it('renders an accessible brand canvas', () => {
    const wrapper = mount(DotMatrixBrand)
    const canvas = wrapper.get('canvas')
    expect(canvas.attributes('role')).toBe('img')
    expect(canvas.attributes('aria-label')).toBe('Moon Code')
    expect(canvas.classes()).toContain('dot-matrix-brand')
    wrapper.unmount()
  })
})
