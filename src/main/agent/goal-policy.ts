import type { GoalChecklistItem } from '../../shared/ipc'
import type { CheckRunResult } from './checks'

export function assertCanStart(input: {
  verifyCommand?: string
  checklist: GoalChecklistItem[]
}): { ok: true } | { ok: false; reason: string } {
  const hasOverallCheck = Boolean(input.verifyCommand?.trim())

  if (input.checklist.length === 0 && !hasOverallCheck) {
    return { ok: false, reason: '需要补验收命令' }
  }

  if (input.checklist.some((item) => !item.check?.trim())) {
    return { ok: false, reason: '清单项缺少 check' }
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

export function isGoalComplete(input: {
  checklist: GoalChecklistItem[]
  verifyCommand?: string
  overall?: CheckRunResult
}): boolean {
  const hasOverallCheck = Boolean(input.verifyCommand?.trim())
  const overallPassed =
    input.overall != null &&
    input.overall.exitCode === 0 &&
    !input.overall.denied &&
    !input.overall.timedOut

  if (input.checklist.length === 0) {
    return hasOverallCheck && overallPassed
  }

  return input.checklist.every((item) => item.done) && (!hasOverallCheck || overallPassed)
}

export function buildFailureFeedback(
  failures: Array<{ title: string; exitCode: number; evidence: string }>
): string {
  const prefix = '验收未通过。请根据下面的命令输出修改，不要修改验收命令本身。'
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
