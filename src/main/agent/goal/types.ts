/**
 * Goal 状态机类型定义（参考 minimax mavis-07）。
 *
 * 5 状态 + 3 surface 不对称拆分：
 * - LLM surface：看不到 budget_limited（担心 LLM 借机逃避）
 * - Renderer surface：看到全部 5 状态（UI 需要分别展示）
 * - Internal surface：5 + 中间态（creating / resuming / archiving）
 *
 * 状态转换见 ./state.ts 的 canTransition()。
 */

export type GoalStatus =
  | 'active' // 正常推进
  | 'paused' // 用户主动暂停 / 停滞 / 预算
  | 'complete' // 全部完成（终态）
  | 'blocked' // 3 轮同条件未解决（终态）
  | 'budget_limited' // token 用尽（用户可加预算后 reopen）

/** 5 状态元信息（label / color / 是否终态） */
export const GOAL_STATUS_META: Record<
  GoalStatus,
  { label: string; terminal: boolean; surface: GoalStatus[] }
> = {
  active: { label: '推进中', terminal: false, surface: ['active', 'paused', 'complete', 'blocked'] },
  paused: { label: '已暂停', terminal: false, surface: ['active', 'paused', 'complete', 'blocked'] },
  complete: { label: '已完成', terminal: true, surface: ['active', 'paused', 'complete', 'blocked', 'budget_limited'] },
  blocked: { label: '需用户决策', terminal: true, surface: ['active', 'paused', 'complete', 'blocked', 'budget_limited'] },
  budget_limited: { label: '预算耗尽', terminal: true, surface: ['active', 'paused', 'complete', 'blocked', 'budget_limited'] }
} as const

/** Intermediate states — 只 Internal surface 可见 */
export type GoalInternalStatus = 'creating' | 'resuming' | 'archiving'

/** 完整的 goal 状态对象 */
export type GoalState = {
  status: GoalStatus
  /** goal 文本（来自用户） */
  goal: string
  /** 清单项 */
  checklist: ReadonlyArray<{ id: string; title: string; done: boolean }>
  /** 累计 token */
  tokenUsed: number
  /** token 预算（0=无限） */
  tokenBudget: number
  /** 当前 round（LLM invoke 次数） */
  rounds: number
  /** 停滞计数（清单连续无进展多少轮） */
  stagnantRounds: number
  /** blocked 计数（同条件重复多少轮） */
  blockedRounds: number
  /** blocked audit 阈值（默认 3） */
  blockedAuditRounds: number
  /** 暂停原因 */
  pausedReason?: 'user' | 'budget' | 'stagnation' | 'safety'
  /** 完成时间（status=complete 时填） */
  completedAt?: number
  /** 最终结果内容（status=complete 时填） */
  resultContent?: string
  /** 最终结果报告路径（落盘的 markdown 报告） */
  resultReportPath?: string
}

/** 从 GoalState 过滤出 LLM surface 可见字段（屏蔽 budget_limited 等） */
export type GoalStateLLMSurface = Pick<
  GoalState,
  'status' | 'goal' | 'checklist' | 'rounds' | 'stagnantRounds' | 'blockedRounds'
>

/** Renderer surface — 看到全部 5 状态 + 进度信息 */
export type GoalStateRendererSurface = GoalState

/** Internal surface — 全部 + 中间态 */
export type GoalStateInternalSurface = GoalState & { internalStatus: GoalInternalStatus | null }
