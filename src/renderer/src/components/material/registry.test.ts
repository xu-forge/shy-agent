import { afterEach, describe, expect, it } from 'vitest'
import { materialEditors, registerMaterialEditor, type MaterialEditor } from './registry'

const sample: MaterialEditor = {
  id: 'image-crop',
  kinds: ['image'],
  mime: ['image/png'],
  label: '裁剪'
}

afterEach(() => {
  materialEditors.length = 0
})

describe('materialEditors registry', () => {
  it('starts empty so v1 has no editor plugins', () => {
    expect(materialEditors).toEqual([])
  })

  it('registerMaterialEditor appends to the shared list', () => {
    registerMaterialEditor(sample)
    expect(materialEditors).toEqual([sample])
  })
})
