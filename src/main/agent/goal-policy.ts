import type { GoalChecklistItem } from '../../shared/ipc'
import type { CheckRunResult } from './checks'

export function freezeGoal(existing: string | null | undefined, userMessage: string): string {
  const frozen = existing?.trim()
  if (frozen) return frozen
  return userMessage.trim()
}

export function stripThink(text: string): string {
  return text
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, ' ')
    .replace(/<think\b[^>]*>[\s\S]*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function assertCanStart(input: {
  verifyCommand?: string
  checklist: GoalChecklistItem[]
}): { ok: true } | { ok: false; reason: string } {
  const hasOverallCheck = Boolean(input.verifyCommand?.trim())
  if (input.checklist.length === 0 && !hasOverallCheck) {
    return { ok: false, reason: '需要步骤或总验收命令' }
  }
  return { ok: true }
}

export function applyCheckResults(
  checklist: GoalChecklistItem[],
  byId: Record<string, CheckRunResult>
): GoalChecklistItem[] {
  return checklist.map((item) => {
    const result = byId[item.id]
    if (!result) return item

    return {
      ...item,
      done: result.exitCode === 0 && !result.denied && !result.timedOut,
      evidence: result.output,
      lastExitCode: result.exitCode
    }
  })
}

export function shouldDeliver(input: {
  checklist: GoalChecklistItem[]
  hadWorkSegment: boolean
}): boolean {
  const withCheck = input.checklist.filter((item) => item.check?.trim())
  if (withCheck.length > 0) return withCheck.every((item) => item.done)
  if (input.checklist.length === 0) return true
  return input.hadWorkSegment
}

export type CompletionAuditCheck = {
  /** LLM 派生的具体需求清单 */
  requirements: string[]
  /** 每条需求是否都有满足证据 */
  eachSatisfied: boolean
}

export function isGoalComplete(input: {
  checklist: GoalChecklistItem[]
  verifyCommand?: string
  overall?: CheckRunResult
  hadWorkSegment?: boolean
  /** completion audit 自检结果（LLM 在 verify 阶段产出） */
  auditCheck?: CompletionAuditCheck | null
}): boolean {
  if (!shouldDeliver({ checklist: input.checklist, hadWorkSegment: input.hadWorkSegment ?? true })) {
    return false
  }
  // completion audit gate：缺省视为通过（向后兼容旧调用路径）；
  // 只有 LLM 显式给 auditCheck.eachSatisfied === false 才拒绝。
  if (input.auditCheck && input.auditCheck.eachSatisfied === false) {
    return false
  }
  const hasOverallCheck = Boolean(input.verifyCommand?.trim())
  if (!hasOverallCheck) return true
  return (
    input.overall != null &&
    input.overall.exitCode === 0 &&
    !input.overall.denied &&
    !input.overall.timedOut
  )
}

export function buildFailureFeedback(
  failures: Array<{ title: string; exitCode: number; evidence: string }>,
  auditFailures?: { requirements: string[]; unsatisfied: string[] }
): string {
  let prefix = '验收未通过。请根据下面的命令输出修改，不要修改验收命令本身。'
  if (auditFailures && auditFailures.unsatisfied.length > 0) {
    prefix +=
      '\n\nCompletion audit 未通过：以下需求缺少可证证据：\n' +
      auditFailures.unsatisfied.map((r) => `- ${r}`).join('\n')
  }

  const details = failures
    .map(
      ({ title, exitCode, evidence }) =>
        `\n\n- ${title}\n  exit code: ${exitCode}\n  evidence:\n${evidence}`
    )
    .join('')

  return `${prefix}${details}`
}

export function nextStagnantRounds(input: {
  prev: number
  passedBefore: number
  passedAfter: number
  overallPassed: boolean
}): number {
  return input.passedAfter > input.passedBefore || input.overallPassed ? 0 : input.prev + 1
}
