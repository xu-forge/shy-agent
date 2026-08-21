import { describe, expect, it } from 'vitest'
import { runStatusToGoalStatus, goalStatusToRunStatus, buildGoalState, llmSurface } from './service'

describe('goal/service — runStatus ↔ GoalStatus', () => {
  it('idle → active', () => {
    expect(runStatusToGoalStatus('idle', false)).toBe('active')
  })
  it('running → active', () => {
    expect(runStatusToGoalStatus('running', false)).toBe('active')
  })
  it('paused → paused', () => {
    expect(runStatusToGoalStatus('paused', true)).toBe('paused')
  })
  it('completed → complete', () => {
    expect(runStatusToGoalStatus('completed', false)).toBe('complete')
  })
  it('cancelled → paused（用户可 resume）', () => {
    expect(runStatusToGoalStatus('cancelled', true)).toBe('paused')
  })

  it('goalStatusToRunStatus: active → running/!paused', () => {
    expect(goalStatusToRunStatus('active')).toEqual({ runStatus: 'running', paused: false })
  })
  it('goalStatusToRunStatus: paused → paused/true', () => {
    expect(goalStatusToRunStatus('paused')).toEqual({ runStatus: 'paused', paused: true })
  })
  it('goalStatusToRunStatus: complete → completed/!paused', () => {
    expect(goalStatusToRunStatus('complete')).toEqual({ runStatus: 'completed', paused: false })
  })
  it('goalStatusToRunStatus: blocked → paused/true（不烧 token）', () => {
    expect(goalStatusToRunStatus('blocked')).toEqual({ runStatus: 'paused', paused: true })
  })
  it('goalStatusToRunStatus: budget_limited → paused/true', () => {
    expect(goalStatusToRunStatus('budget_limited')).toEqual({ runStatus: 'paused', paused: true })
  })
})

describe('goal/service — buildGoalState', () => {
  it('从 session 数据构造完整 GoalState', () => {
    const state = buildGoalState({
      goal: '测试',
      checklist: [{ id: '1', title: 'A', done: false }, { id: '2', title: 'B', done: true }],
      runStatus: 'running',
      paused: false,
      tokenUsed: 100,
      tokenBudget: 1000,
      rounds: 3
    })
    expect(state.status).toBe('active')
    expect(state.goal).toBe('测试')
    expect(state.checklist).toEqual([{ id: '1', title: 'A', done: false }, { id: '2', title: 'B', done: true }])
    expect(state.tokenUsed).toBe(100)
    expect(state.rounds).toBe(3)
    expect(state.blockedAuditRounds).toBe(3) // 默认
  })
})

describe('goal/service — llmSurface', () => {
  it('隐藏 budget_limited,降级为 paused（不让 LLM 借机逃避）', () => {
    const state = buildGoalState({
      goal: 'X',
      checklist: [],
      runStatus: 'paused',
      paused: true,
      tokenUsed: 1000,
      tokenBudget: 1000,
      rounds: 5,
      pausedReason: 'budget'
    })
    // 模拟 budget_limited 状态
    const view = llmSurface({ ...state, status: 'budget_limited' })
    expect(view.status).toBe('paused') // 降级,不是 budget_limited
  })

  it('active/paused/complete/blocked 都按原状态透出', () => {
    for (const status of ['active', 'paused', 'complete', 'blocked'] as const) {
      const state = buildGoalState({
        goal: 'X',
        checklist: [],
        runStatus: status === 'active' ? 'running' : status === 'paused' ? 'paused' : 'completed',
        paused: status === 'paused',
        tokenUsed: 0,
        tokenBudget: 0,
        rounds: 0
      })
      // 强制 status（模拟 state 已设置好）
      const view = llmSurface({ ...state, status })
      expect(view.status).toBe(status)
    }
  })
})
