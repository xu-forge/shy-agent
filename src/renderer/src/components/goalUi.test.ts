import { describe, expect, it } from 'vitest'
import { normalizeVerifyCommand, truncateEvidence } from './goalUi'

describe('目标模式 UI 入参', () => {
  it('总验收命令去除首尾空白，空命令转为 undefined', () => {
    expect(normalizeVerifyCommand('  npm test  ')).toBe('npm test')
    expect(normalizeVerifyCommand('   ')).toBeUndefined()
  })

  it('未完成项的长证据截断并保留省略号', () => {
    expect(truncateEvidence('abcdef', 5)).toBe('abcd…')
    expect(truncateEvidence('abc', 5)).toBe('abc')
  })
})
