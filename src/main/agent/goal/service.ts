/**
 * Goal 桥接层：现有 RunStatus ↔ 新 GoalStatus。
 *
 * 设计：goal-driver.ts / service.ts 不动（避免破坏 675 行大文件），
 * 桥接层只在需要新 5 状态机时调。同时给 LLM/Renderer/Internal 三 surface
 * 暴露 view 函数。
 */
import type { RunStatus, GoalChecklistItem } from '../../../shared/ipc'
import type { GoalState, GoalStatus, GoalStateLLMSurface, GoalStateRendererSurface } from './types'
import { GOAL_STATUS_META } from './types'
import { canTransition } from './state'

/** 把旧 RunStatus 映射到新 GoalStatus */
export function runStatusToGoalStatus(runStatus: RunStatus, paused: boolean): GoalStatus {
  if (paused && runStatus === 'paused') return 'paused'
  switch (runStatus) {
    case 'idle':
      return 'active' // 默认进入 active
    case 'running':
      return 'active'
    case 'paused':
      return 'paused'
    case 'completed':
      return 'complete'
    case 'cancelled':
      return 'paused' // cancelled → 当作暂停，用户可 resume 续跑
    default:
      return 'active'
  }
}

/** 把新 GoalStatus 映射回旧 RunStatus（写回 sessions.runStatus） */
export function goalStatusToRunStatus(status: GoalStatus): { runStatus: RunStatus; paused: boolean } {
  switch (status) {
    case 'active':
      return { runStatus: 'running', paused: false }
    case 'paused':
      return { runStatus: 'paused', paused: true }
    case 'complete':
      return { runStatus: 'completed', paused: false }
    case 'blocked':
    case 'budget_limited':
      return { runStatus: 'paused', paused: true } // blocked/budget 当作 paused（不继续烧 token）
    default:
      return { runStatus: 'running', paused: false }
  }
}

/** 从 session 数据构造 GoalState（供 service.ts 集成） */
export function buildGoalState(input: {
  goal: string
  checklist: GoalChecklistItem[]
  runStatus: RunStatus
  paused: boolean
  tokenUsed: number
  tokenBudget: number
  rounds: number
  stagnantRounds?: number
  blockedRounds?: number
  blockedAuditRounds?: number
  resultContent?: string
  resultReportPath?: string
  completedAt?: number
  pausedReason?: GoalState['pausedReason']
}): GoalState {
  return {
    status: runStatusToGoalStatus(input.runStatus, input.paused),
    goal: input.goal,
    checklist: input.checklist.map((c) => ({ id: c.id, title: c.title, done: c.done })),
    tokenUsed: input.tokenUsed,
    tokenBudget: input.tokenBudget,
    rounds: input.rounds,
    stagnantRounds: input.stagnantRounds ?? 0,
    blockedRounds: input.blockedRounds ?? 0,
    blockedAuditRounds: input.blockedAuditRounds ?? 3,
    resultContent: input.resultContent,
    resultReportPath: input.resultReportPath,
    completedAt: input.completedAt,
    pausedReason: input.pausedReason
  }
}

/** LLM surface view：只暴露 LLM 看到的字段（屏蔽 budget_limited） */
export function llmSurface(state: GoalState): GoalStateLLMSurface {
  const visibleStatuses = GOAL_STATUS_META.active.surface // 共享 surface 元数据
  const effectiveStatus = visibleStatuses.includes(state.status) ? state.status : 'paused'
  return {
    status: effectiveStatus,
    goal: state.goal,
    checklist: state.checklist,
    rounds: state.rounds,
    stagnantRounds: state.stagnantRounds,
    blockedRounds: state.blockedRounds
  }
}

/** Renderer surface view：全部 5 状态 + 进度 */
export function rendererSurface(state: GoalState): GoalStateRendererSurface {
  return state
}

/** 状态转换（带合法性检查） */
export function transition(
  state: GoalState,
  to: GoalStatus,
  reason?: GoalState['pausedReason']
): GoalState {
  if (!canTransition(state.status, to)) {
    // 非法转换：返回原 state（business 层应避免触发此情况）
    return state
  }
  return { ...state, status: to, pausedReason: reason ?? state.pausedReason }
}
