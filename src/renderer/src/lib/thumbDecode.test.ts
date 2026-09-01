import { describe, expect, it } from 'vitest'
import { shouldDecodeThumb } from './thumbDecode'

describe('shouldDecodeThumb', () => {
  it('未相交时不解码', () => {
    expect(shouldDecodeThumb({ isIntersecting: false, width: 220 })).toBe(false)
  })

  it('缩得太小（适应画布）时不解码', () => {
    expect(shouldDecodeThumb({ isIntersecting: true, width: 40 })).toBe(false)
  })

  it('在视口内且够大时才解码', () => {
    expect(shouldDecodeThumb({ isIntersecting: true, width: 160 })).toBe(true)
  })
})
