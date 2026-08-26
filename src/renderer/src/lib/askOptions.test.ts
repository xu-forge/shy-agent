import { describe, expect, it } from 'vitest'
import { normalizeAskOptions } from './askOptions'

describe('normalizeAskOptions', () => {
  it('字符串数组原样', () => {
    expect(normalizeAskOptions(['省钱', '舒适'])).toEqual([
      { value: '省钱', label: '省钱', description: '' },
      { value: '舒适', label: '舒适', description: '' }
    ])
  })

  it('兼容 {label, description} 对象', () => {
    const out = normalizeAskOptions([
      { label: '省钱', description: '地铁+青旅' },
      { label: '舒适', description: '打车+酒店' }
    ])
    expect(out[0]).toEqual({ value: '省钱', label: '省钱', description: '地铁+青旅' })
    expect(out[1].label).toBe('舒适')
  })

  it('非数组返回空', () => {
    expect(normalizeAskOptions(null)).toEqual([])
  })
})
