/**
 * Codex goal tools — `get_goal` / `update_goal`，暴露给 LLM 作为 LangChain Tool。
 *
 * 设计严格对齐 Codex prompt 里的硬规则：
 * - `get_goal` 类似 Codex 的 get_goal 工具：返回 goal / checklist / runStatus / budget / blocked 等
 * - `update_goal` 严格按 Codex 规则：
 *   - status="complete" only when 真正达成（auditCheck.eachSatisfied=true）
 *   - status="blocked" only when 同条件连续 blockedAuditRounds 轮
 *   - 不能 pause / resume / 限预算（那些由用户/系统控制）
 *   - 带预算的目标 complete 时报告 tokens_used
 *
 * 注意：本文件只导出**工具工厂**（不自动注册），由 goal-driver 在 defaultRunBurst 里显式调用。
 */
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { getSession, updateSessionRuntime } from '../sessions/store'
import { clampBlockedAuditRounds, isBlocked } from './blocked-audit'
import type { AgentEvent } from './service'

/** get_goal 工具返回的快照（可序列化） */
export type GoalSnapshot = {
  goal: string | null
  checklist: Array<{ id: string; title: string; done: boolean; check?: string }>
  runStatus: string
  progress: { done: number; total: number }
  budget: { tokenUsed: number; tokenBudget: number; pct: number; disabled: boolean }
  stagnantRounds: number
  blockedRounds: number
  blockedAuditRounds: number
  paused: boolean
  checkpoint: string | null
}

/** 工厂依赖 */
export type GoalToolDeps = {
  sessionId: string
  /** emit AgentEvent 到 service（用于 goal_complete / blocked 事件） */
  emit: (event: AgentEvent) => void
  /** 提供最新 snapshot；service / graph 实时注入 */
  getSnapshot: () => GoalSnapshot
  /** 是否允许标 complete（由 verifyNode 的 auditCheck 维护） */
  auditOkRef: { current: boolean }
  /** blockedAuditRounds 设置（已 clamp 到 [1,10]） */
  blockedAuditRounds: number
  /** enableGoalCompleteReport 设置 */
  enableGoalCompleteReport: boolean
}

/** 构造 get_goal 工具 */
export function makeGetGoalTool(deps: GoalToolDeps): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'get_goal',
    description:
      'Get the current active goal snapshot (objective / checklist / runStatus / progress / budget / blocked rounds / paused). ' +
      'Use this before deciding to act, plan, or call update_goal. ' +
      'Do not infer goal state from prior memory — always call get_goal first.',
    schema: z.object({}),
    func: async () => {
      const snap = deps.getSnapshot()
      return JSON.stringify(snap, null, 2)
    }
  })
}

/** 构造 update_goal 工具 */
export function makeUpdateGoalTool(deps: GoalToolDeps): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'update_goal',
    description:
      'Mark the active goal as `complete` or `blocked`. ' +
      'Use `complete` only when the objective has actually been achieved AND no required work remains. ' +
      'Do NOT use complete merely because the checklist is done, the budget is exhausted, or work is stopping. ' +
      'Before calling complete, ensure completion audit has been satisfied (auditCheck.eachSatisfied=true). ' +
      'Use `blocked` only when the same blocking condition has repeated for at least blockedAuditRounds ' +
      'AND the agent cannot make meaningful progress without user input or an external-state change. ' +
      'Do NOT use blocked merely because work is hard, slow, uncertain, or would benefit from clarification. ' +
      'This tool CANNOT pause, resume, budget-limit, or usage-limit a goal; those are controlled by the user or system.',
    schema: z.object({
      status: z.enum(['complete', 'blocked']).describe('Goal end status'),
      reason: z.string().optional().describe('For blocked: short description of the blocking condition'),
      tokensUsed: z.number().optional().describe('For complete: cumulative tokens used (reported to user)')
    }),
    func: async (input) => {
      const { status, reason, tokensUsed } = input as {
        status: 'complete' | 'blocked'
        reason?: string
        tokensUsed?: number
      }

      const session = getSession(deps.sessionId)
      if (!session) {
        return JSON.stringify({ ok: false, error: 'session not found' })
      }

      if (status === 'complete') {
        // Codex 硬规则：
        // - status="complete" only when objective 已经真正达成且 no required work remains
        // - 不能因为预算耗尽或想停手就标 complete
        // - 必须 auditCheck.eachSatisfied === true
        if (!deps.auditOkRef.current) {
          return JSON.stringify({
            ok: false,
            error:
              'Completion audit gate rejected: auditCheck.eachSatisfied must be true before marking complete. ' +
              'Verify each requirement has satisfied evidence (command output / file content / test result) first.'
          })
        }
        updateSessionRuntime(deps.sessionId, { runStatus: 'completed' })
        const snap = deps.getSnapshot()
        if (deps.enableGoalCompleteReport) {
          deps.emit({
            type: 'goal_complete',
            goal: snap.goal ?? '',
            checklist: session.checklist ?? [],
            tokenUsed: tokensUsed ?? snap.budget.tokenUsed,
            rounds: 0,
            durationMs: 0
          })
        }
        return JSON.stringify({
          ok: true,
          status: 'complete',
          reported: deps.enableGoalCompleteReport,
          tokensUsed: tokensUsed ?? snap.budget.tokenUsed
        })
      }

      if (status === 'blocked') {
        // Codex 硬规则：
        // - status="blocked" only when blockedRounds >= blockedAuditRounds
        // - 且 agent 在没有 user input / external state change 下无法推进
        const blockedRounds = deps.getSnapshot().blockedRounds
        const auditRounds = clampBlockedAuditRounds(deps.blockedAuditRounds)
        if (!isBlocked(blockedRounds, auditRounds)) {
          return JSON.stringify({
            ok: false,
            error:
              `Blocked audit gate rejected: blockedRounds=${blockedRounds} < blockedAuditRounds=${auditRounds}. ` +
              'Wait until the same blocking condition has repeated for the configured number of rounds.'
          })
        }
        updateSessionRuntime(deps.sessionId, { runStatus: 'idle', paused: true })
        deps.emit({
          type: 'blocked',
          rounds: blockedRounds,
          reason
        })
        return JSON.stringify({ ok: true, status: 'blocked', rounds: blockedRounds })
      }

      return JSON.stringify({ ok: false, error: `unknown status: ${String(status)}` })
    }
  })
}

/** 工具工厂（便捷返回两个） */
export function buildGoalTools(deps: GoalToolDeps): DynamicStructuredTool[] {
  return [makeGetGoalTool(deps), makeUpdateGoalTool(deps)]
}
