import { describe, expect, it } from 'vitest'
import {
  clampBlockedAuditRounds,
  extractVerifyBlocked,
  isBlocked,
  nextBlockedRounds
} from './blocked-audit'

describe('extractVerifyBlocked', () => {
  it('从 LLM 输出抽取 blocked 段', () => {
    expect(
      extractVerifyBlocked({ sameCondition: true, reason: 'compile error' })
    ).toEqual({ sameCondition: true, reason: 'compile error' })
  })

  it('无 blocked 字段返回 null', () => {
    expect(extractVerifyBlocked({ other: 'field' })).toBeNull()
    expect(extractVerifyBlocked(null)).toBeNull()
    expect(extractVerifyBlocked('string')).toBeNull()
  })

  it('sameCondition 非布尔视为未定义', () => {
    expect(extractVerifyBlocked({ sameCondition: 'true' })).toEqual({ sameCondition: undefined })
  })
})

describe('nextBlockedRounds', () => {
  it('sameCondition=true → +1', () => {
    expect(nextBlockedRounds(0, { sameCondition: true })).toBe(1)
    expect(nextBlockedRounds(2, { sameCondition: true })).toBe(3)
  })

  it('sameCondition=false → 0', () => {
    expect(nextBlockedRounds(2, { sameCondition: false })).toBe(0)
  })

  it('blocked=null（LLM 没给）→ 0', () => {
    expect(nextBlockedRounds(2, null)).toBe(0)
  })

  it('sameCondition 缺省视为 false → 0', () => {
    expect(nextBlockedRounds(2, { reason: 'no sameCondition' })).toBe(0)
  })
})

describe('isBlocked', () => {
  it('达到阈值返回 true', () => {
    expect(isBlocked(3, 3)).toBe(true)
    expect(isBlocked(5, 3)).toBe(true)
  })

  it('未达阈值返回 false', () => {
    expect(isBlocked(2, 3)).toBe(false)
    expect(isBlocked(0, 3)).toBe(false)
  })

  it('threshold=0 视为禁用', () => {
    expect(isBlocked(5, 0)).toBe(false)
  })

  it('threshold 负值视为禁用', () => {
    expect(isBlocked(5, -1)).toBe(false)
  })
})

describe('clampBlockedAuditRounds', () => {
  it('合法值原样返回', () => {
    expect(clampBlockedAuditRounds(3)).toBe(3)
    expect(clampBlockedAuditRounds(1)).toBe(1)
    expect(clampBlockedAuditRounds(10)).toBe(10)
  })

  it('clamp 到 [1, 10]', () => {
    expect(clampBlockedAuditRounds(0)).toBe(1)
    expect(clampBlockedAuditRounds(100)).toBe(10)
    expect(clampBlockedAuditRounds(-5)).toBe(1)
  })

  it('非法值用 fallback', () => {
    expect(clampBlockedAuditRounds(undefined)).toBe(3)
    expect(clampBlockedAuditRounds(null)).toBe(3)
    expect(clampBlockedAuditRounds('3')).toBe(3)
    expect(clampBlockedAuditRounds(NaN)).toBe(3)
  })

  it('支持自定义 fallback', () => {
    expect(clampBlockedAuditRounds(undefined, 5)).toBe(5)
  })
})
