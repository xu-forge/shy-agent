import { describe, expect, it } from 'vitest'
import { canTransition, safeTransition } from './state'
import type { GoalStatus } from './types'

describe('goal/state — canTransition', () => {
  const all: GoalStatus[] = ['active', 'paused', 'complete', 'blocked', 'budget_limited']

  it('自我转换始终允许', () => {
    for (const s of all) {
      expect(canTransition(s, s)).toBe(true)
    }
  })

  it('active 可转 paused / complete / blocked / budget_limited', () => {
    for (const to of ['paused', 'complete', 'blocked', 'budget_limited'] as GoalStatus[]) {
      expect(canTransition('active', to)).toBe(true)
    }
  })

  it('active 不能转回 active（除自身）', () => {
    expect(canTransition('active', 'active')).toBe(true) // 自身允许
    // 没有别的状态可从 active 转
  })

  it('paused 可转 active / complete / blocked / budget_limited', () => {
    for (const to of all) {
      expect(canTransition('paused', to)).toBe(true)
    }
  })

  it('complete 是终态,不能转出', () => {
    for (const to of all) {
      if (to === 'complete') continue
      expect(canTransition('complete', to)).toBe(false)
    }
  })

  it('blocked 可转回 active 或 paused（用户决策后）', () => {
    expect(canTransition('blocked', 'active')).toBe(true)
    expect(canTransition('blocked', 'paused')).toBe(true)
    expect(canTransition('blocked', 'complete')).toBe(false)
    expect(canTransition('blocked', 'budget_limited')).toBe(false)
  })

  it('budget_limited 可转回 active 或 paused（用户加预算）', () => {
    expect(canTransition('budget_limited', 'active')).toBe(true)
    expect(canTransition('budget_limited', 'paused')).toBe(true)
    expect(canTransition('budget_limited', 'complete')).toBe(false)
    expect(canTransition('budget_limited', 'blocked')).toBe(false)
  })

  it('5×5=25 状态对全覆盖测试（5 active + 5 paused + 5 complete + ...）', () => {
    // 每个 from 状态都至少有 1 个合法目标（除 complete 终态）
    for (const from of all) {
      if (from === 'complete') continue // complete 是真终态
      const validTargets = all.filter((to) => canTransition(from, to))
      expect(validTargets.length).toBeGreaterThan(0)
    }
    // 完整矩阵：自我转换 5 个 + 跨状态 = 25 个
    let total = 0
    let allowed = 0
    for (const from of all) {
      for (const to of all) {
        total += 1
        if (canTransition(from, to)) allowed += 1
      }
    }
    // 5 self + 4 (active→*) + 4 (paused→*) + 0 (complete→*) + 2 (blocked→*) + 2 (budget_limited→*) = 17
    expect(allowed).toBe(17)
    expect(total).toBe(25)
  })
})

describe('goal/state — safeTransition', () => {
  it('合法转换返回新 state', () => {
    const state = {
      status: 'active' as GoalStatus,
      goal: 'X',
      checklist: [],
      tokenUsed: 0,
      tokenBudget: 0,
      rounds: 0,
      stagnantRounds: 0,
      blockedRounds: 0,
      blockedAuditRounds: 3
    }
    const next = safeTransition(state, 'paused', 'user')
    expect(next.status).toBe('paused')
    expect(next.pausedReason).toBe('user')
  })

  it('非法转换返回原 state(无修改)', () => {
    const state = {
      status: 'complete' as GoalStatus,
      goal: 'X',
      checklist: [],
      tokenUsed: 0,
      tokenBudget: 0,
      rounds: 0,
      stagnantRounds: 0,
      blockedRounds: 0,
      blockedAuditRounds: 3,
      completedAt: 1000
    }
    const next = safeTransition(state, 'active')
    expect(next).toEqual(state)
  })
})
