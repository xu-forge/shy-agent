/**
 * Goal 状态机纯函数（参考 minimax mavis-07）。
 *
 * 设计原则：
 * - 全部纯函数，无 IO
 * - canTransition 兜底非法转换
 * - apply* 函数返回新 state，不修改入参
 * - 集成方在 service.ts / goal-driver.ts 调这些函数，但底层数据流不变
 *
 * 5 状态转换图：
 *       ┌─→ active ──→ complete
 *       │     │
 *       │     ↓
 * new ──┤   paused ──→ active (resume)
 *       │     │
 *       │     ↓
 *       │   blocked ──→ active (用户决策后)
 *       │     │
 *       │     ↓
 *       └─ budget_limited ──→ active (用户加预算)
 *
 * blocked 是显式终态，但用户 reopen 后回 active；
 * complete 也是终态，reopen 时强制走新 goal（不能在原 goal 上 reopen）。
 */
import type { GoalState, GoalStatus } from './types'

/** canTransition: 是否允许从 from 转到 to */
export function canTransition(from: GoalStatus, to: GoalStatus): boolean {
  // 自我转换始终允许（同状态重设）
  if (from === to) return true

  switch (from) {
    case 'active':
      return ['paused', 'complete', 'blocked', 'budget_limited'].includes(to)
    case 'paused':
      return ['active', 'complete', 'blocked', 'budget_limited'].includes(to)
    case 'complete':
      // 终态；不能从 complete 转出（用户必须开新 goal）
      return false
    case 'blocked':
      return ['active', 'paused'].includes(to)
    case 'budget_limited':
      return ['active', 'paused'].includes(to)
    default:
      return false
  }
}

/** 安全的状态转换：非法转换返回原状态并 console.warn */
export function safeTransition(state: GoalState, to: GoalStatus, reason?: string): GoalState {
  if (!canTransition(state.status, to)) {
    // 静默：业务侧会做更详细的 audit
    return state
  }
  return { ...state, status: to, ...(reason ? { pausedReason: reason as GoalState['pausedReason'] } : {}) }
}

/** 推进 round（每次 LLM invoke 后） */
export function applyRound(state: GoalState): GoalState {
  return { ...state, rounds: state.rounds + 1 }
}

/** 推进 token 计数 */
export function applyTokens(state: GoalState, deltaTokens: number): GoalState {
  const next = { ...state, tokenUsed: state.tokenUsed + Math.max(0, deltaTokens) }
  // 立即检查 budget
  if (state.tokenBudget > 0 && next.tokenUsed >= state.tokenBudget) {
    return { ...next, status: 'budget_limited', pausedReason: 'budget' }
  }
  return next
}

/** 推进停滞检测（清单连续无进展多少 verify 轮） */
export function applyStagnation(state: GoalState, passedBefore: number, passedAfter: number): GoalState {
  const progressed = passedAfter > passedBefore
  const next: GoalState = {
    ...state,
    stagnantRounds: progressed ? 0 : state.stagnantRounds + 1
  }
  // 达到 stagnation 上限（默认 20）→ 暂停
  if (next.stagnantRounds >= 20 && next.status === 'active') {
    return { ...next, status: 'paused', pausedReason: 'stagnation' }
  }
  return next
}

/** 推进 blocked audit（verify LLM 报告"同条件重复"时调用） */
export function applyBlockedAudit(state: GoalState, sameCondition: boolean): GoalState {
  const nextBlockedRounds = sameCondition ? state.blockedRounds + 1 : 0
  const next: GoalState = { ...state, blockedRounds: nextBlockedRounds }
  // 达到 blocked 阈值 → 终态
  if (nextBlockedRounds >= state.blockedAuditRounds && next.status !== 'complete') {
    return { ...next, status: 'blocked', pausedReason: 'safety' }
  }
  return next
}

/** 用户主动暂停 */
export function applyUserPause(state: GoalState): GoalState {
  if (state.status !== 'active') return state
  return { ...state, status: 'paused', pausedReason: 'user' }
}

/** 用户 resume（从 paused / blocked / budget_limited → active） */
export function applyUserResume(state: GoalState): GoalState {
  if (state.status === 'complete') return state
  if (['paused', 'blocked', 'budget_limited'].includes(state.status)) {
    return { ...state, status: 'active', blockedRounds: 0, stagnantRounds: 0 }
  }
  return state
}

/** 标记完成（仅从 active/paused 转 complete） */
export function applyComplete(
  state: GoalState,
  payload: { content: string; reportPath?: string }
): GoalState {
  if (!canTransition(state.status, 'complete')) return state
  return {
    ...state,
    status: 'complete',
    completedAt: Date.now(),
    resultContent: payload.content,
    resultReportPath: payload.reportPath
  }
}
