import { describe, expect, it } from 'vitest'
import { formatToolIo } from './formatToolIo'

describe('formatToolIo', () => {
  it('对象格式化为 JSON', () => {
    expect(formatToolIo({ query: '广州' })).toContain('"query"')
  })

  it('JSON 字符串再 pretty print', () => {
    expect(formatToolIo('{"a":1}')).toBe('{\n  "a": 1\n}')
  })

  it('空值返回空串', () => {
    expect(formatToolIo(null)).toBe('')
    expect(formatToolIo(undefined)).toBe('')
  })
})
