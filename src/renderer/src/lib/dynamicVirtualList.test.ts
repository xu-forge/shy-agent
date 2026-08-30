import { describe, expect, it } from 'vitest'
import { getVirtualRange } from './dynamicVirtualList'

describe('dynamic virtual list', () => {
  it('keeps only the viewport plus overscan and accounts for measured heights', () => {
    const result = getVirtualRange(100, 500, 200, new Map([[0, 300], [1, 40]]), 50, 0)
    expect(result.start).toBe(2)
    expect(result.end).toBeGreaterThan(2)
    expect(result.offsets[2]).toBe(340)
    expect(result.total).toBe(5240)
  })
})
