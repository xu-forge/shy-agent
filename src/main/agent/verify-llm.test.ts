import { describe, expect, it, vi } from 'vitest'

// Mock settings/store 返回空 apiKey
vi.mock('../settings/store', () => ({
  getSettings: vi.fn(async () => ({
    baseURL: 'https://example.com',
    apiKey: '',
    model: 'test-model',
    blockedAuditRounds: 3,
    enableGoalCompleteReport: true
  }))
}))

import {
  applyBlockedAudit,
  extractVerifyLLMOutput,
  runVerifyLLM
} from './verify-llm'

describe('extractVerifyLLMOutput', () => {
  it('抽取完整结构', () => {
    const out = extractVerifyLLMOutput({
      auditCheck: { requirements: ['r1', 'r2'], eachSatisfied: true },
      blocked: { sameCondition: false, reason: 'ok' }
    })
    expect(out.auditCheck.requirements).toEqual(['r1', 'r2'])
    expect(out.auditCheck.eachSatisfied).toBe(true)
    expect(out.blocked.sameCondition).toBe(false)
  })

  it('requirements 非数组兜底为空数组', () => {
    const out = extractVerifyLLMOutput({ auditCheck: { eachSatisfied: true } })
    expect(out.auditCheck.requirements).toEqual([])
  })

  it('eachSatisfied 非布尔视为 false', () => {
    const out = extractVerifyLLMOutput({ auditCheck: { requirements: [], eachSatisfied: 'true' } })
    expect(out.auditCheck.eachSatisfied).toBe(false)
  })

  it('blocked 字段缺省视为空对象', () => {
    const out = extractVerifyLLMOutput({ auditCheck: {} })
    expect(out.blocked.sameCondition).toBeUndefined()
    expect(out.blocked.reason).toBeUndefined()
  })

  it('空对象兜底', () => {
    const out = extractVerifyLLMOutput({})
    expect(out.auditCheck.eachSatisfied).toBe(false)
    expect(out.blocked.sameCondition).toBeUndefined()
  })

  it('null 兜底', () => {
    const out = extractVerifyLLMOutput(null)
    expect(out.auditCheck.eachSatisfied).toBe(false)
  })
})

describe('applyBlockedAudit', () => {
  it('sameCondition=true → +1', () => {
    const r = applyBlockedAudit({
      prevBlockedRounds: 0,
      blocked: { sameCondition: true },
      blockedAuditRounds: 3
    })
    expect(r.newBlockedRounds).toBe(1)
    expect(r.shouldPause).toBe(false)
  })

  it('sameCondition=true 连续 3 轮触发 shouldPause', () => {
    const r = applyBlockedAudit({
      prevBlockedRounds: 2,
      blocked: { sameCondition: true },
      blockedAuditRounds: 3
    })
    expect(r.newBlockedRounds).toBe(3)
    expect(r.shouldPause).toBe(true)
  })

  it('sameCondition=false → 重置', () => {
    const r = applyBlockedAudit({
      prevBlockedRounds: 2,
      blocked: { sameCondition: false },
      blockedAuditRounds: 3
    })
    expect(r.newBlockedRounds).toBe(0)
    expect(r.shouldPause).toBe(false)
  })

  it('sameCondition 缺省视为 false → 重置', () => {
    const r = applyBlockedAudit({
      prevBlockedRounds: 2,
      blocked: {},
      blockedAuditRounds: 3
    })
    expect(r.newBlockedRounds).toBe(0)
    expect(r.shouldPause).toBe(false)
  })

  it('阈值=5 不会因 3 轮触发', () => {
    const r = applyBlockedAudit({
      prevBlockedRounds: 3,
      blocked: { sameCondition: true },
      blockedAuditRounds: 5
    })
    expect(r.newBlockedRounds).toBe(4)
    expect(r.shouldPause).toBe(false)
  })
})

describe('runVerifyLLM', () => {
  it('apiKey 缺失时返回 ok=false', async () => {
    // 用 vi.mock 但默认 getSettings 返回无 apiKey
    const r = await runVerifyLLM({ goal: 'g', checklist: [] })
    // 默认 settings 是占位 baseURL + 空 apiKey → 期望 ok=false
    expect(r.ok).toBe(false)
  })
})
