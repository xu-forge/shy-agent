import { describe, expect, it } from 'vitest'
import type { GoalChecklistItem } from '../../shared/ipc'
import type { CheckRunResult } from './checks'
import {
  applyCheckResults,
  assertCanStart,
  buildFailureFeedback,
  isGoalComplete,
  nextStagnantRounds
} from './goal-policy'

function item(overrides: Partial<GoalChecklistItem> = {}): GoalChecklistItem {
  return {
    id: 'item-1',
    title: '验收项',
    done: false,
    check: 'npm test',
    ...overrides
  }
}

function result(overrides: Partial<CheckRunResult> = {}): CheckRunResult {
  return {
    command: 'npm test',
    exitCode: 0,
    output: 'ok',
    timedOut: false,
    denied: false,
    ...overrides
  }
}

describe('goal policy', () => {
  it('无 verifyCommand 且清单无任何 check 时拒绝开工', () => {
    expect(assertCanStart({ checklist: [] }).ok).toBe(false)
  })

  it('清单有一项缺 check 时拒绝开工', () => {
    expect(assertCanStart({ checklist: [item({ check: '  ' })] }).ok).toBe(false)
  })

  it('清单为空但有 verifyCommand 时允许开工', () => {
    expect(assertCanStart({ checklist: [], verifyCommand: ' npm test ' }).ok).toBe(true)
  })

  it('applyCheckResults 在 exitCode 1 时写入失败和 evidence', () => {
    const checklist = [item()]
    const actual = applyCheckResults(checklist, {
      'item-1': result({ exitCode: 1, output: 'failure evidence' })
    })

    expect(actual[0].done).toBe(false)
    expect(actual[0].evidence).toBe('failure evidence')
  })

  it('子项全绿但 overall exit 1 时目标未完成', () => {
    expect(
      isGoalComplete({
        checklist: [item({ done: true })],
        verifyCommand: 'npm test',
        overall: result({ exitCode: 1 })
      })
    ).toBe(false)
  })

  it('清单为空且 overall exit 0 时目标完成', () => {
    expect(
      isGoalComplete({
        checklist: [],
        verifyCommand: 'npm test',
        overall: result()
      })
    ).toBe(true)
  })

  it('失败回灌包含标题、退出码、证据和验收命令约束', () => {
    const feedback = buildFailureFeedback([
      { title: '单元测试', exitCode: 1, evidence: 'expected true' }
    ])

    expect(feedback).toContain('单元测试')
    expect(feedback).toContain('1')
    expect(feedback).toContain('expected true')
    expect(feedback).toContain('不要修改验收命令')
  })

  it('验收无进展时停滞轮次加一', () => {
    expect(
      nextStagnantRounds({
        prev: 2,
        passedBefore: 1,
        passedAfter: 1,
        overallPassed: false
      })
    ).toBe(3)
  })
})
