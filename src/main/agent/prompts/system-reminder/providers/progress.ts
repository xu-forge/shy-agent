/**
 * Progress provider — 目标 / 验收清单 / 当前段 / 进度上下文。
 *
 * 设计参考 minimax mavis-09 §3.3 例 4：
 * - 多条件 gate：team 模式关 + agent role 是 orchestrator + 有 active plans
 * - 缺一即不输出
 * - 含清单进度 + token 预算 + 停滞 / blocked 轮数
 */
import type { ReminderProviderFn } from '../types'

export const progressReminderProvider: ReminderProviderFn = (input) => {
  // gate 1：仅目标模式有 goal
  if (!input.goal) return undefined
  // gate 2：必须至少有 1 个未完成项
  if (input.goal.checklist.length === 0) return undefined

  const lines = ['<goal-progress>']
  lines.push(`  goal: ${input.goal.goal}`)
  lines.push(
    `  checklist: ${input.goal.progress.done}/${input.goal.progress.total} (${input.goal.progress.pct}%)`
  )
  const pending = input.goal.checklist.filter((c) => !c.done)
  if (pending.length > 0 && pending.length <= 3) {
    lines.push(`  pending: ${pending.map((c) => c.title).join(' / ')}`)
  }
  if (!input.goal.budget.disabled) {
    lines.push(
      `  token: ${input.goal.budget.tokenUsed}/${input.goal.budget.tokenBudget} (${input.goal.budget.pct}%)`
    )
  }
  if (input.goal.stagnantRounds > 0) {
    lines.push(`  stagnant_rounds: ${input.goal.stagnantRounds}  # 连续无进展轮数`)
  }
  if (input.goal.blockedRounds > 0) {
    lines.push(`  blocked_rounds: ${input.goal.blockedRounds}  # 同条件重复轮数`)
  }
  lines.push('</goal-progress>')
  return lines.join('\n')
}
