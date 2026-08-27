import { describe, expect, it } from 'vitest'
import { isNearBottom } from './scrollStick'

function box(partial: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
  return partial
}

describe('isNearBottom', () => {
  it('内容不足一屏时视为贴底', () => {
    expect(isNearBottom(box({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 }))).toBe(true)
  })

  it('正好在底部为贴底', () => {
    expect(isNearBottom(box({ scrollTop: 600, scrollHeight: 1000, clientHeight: 400 }))).toBe(true)
  })

  it('距底部在阈值内仍贴底', () => {
    expect(isNearBottom(box({ scrollTop: 530, scrollHeight: 1000, clientHeight: 400 }))).toBe(true)
  })

  it('往上翻超过阈值则不再贴底', () => {
    expect(isNearBottom(box({ scrollTop: 100, scrollHeight: 1000, clientHeight: 400 }))).toBe(false)
  })
})
