import { describe, expect, it } from 'vitest'
import type { GoalChecklistItem } from '../../shared/ipc'
import type { CheckRunResult } from './checks'
import {
  applyCheckResults,
  assertCanStart,
  buildFailureFeedback,
  freezeGoal,
  isGoalComplete,
  nextStagnantRounds,
  shouldDeliver,
  stripThink
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
  it('freezeGoal 只在空时写入用户原话', () => {
    expect(freezeGoal(null, '用户原话')).toBe('用户原话')
    expect(freezeGoal('已冻结', 'plan改写')).toBe('已冻结')
  })

  it('stripThink 去掉思维链标签', () => {
    expect(stripThink('<think>foo</think>周末新闻')).toBe('周末新闻')
    expect(stripThink('<think>用户想要我为这个对话生成一个极短的')).not.toContain('<think>')
  })

  it('无 verifyCommand 且清单为空时拒绝开工', () => {
    expect(assertCanStart({ checklist: [] }).ok).toBe(false)
  })

  it('清单有项但全无 check 时允许开工', () => {
    expect(assertCanStart({ checklist: [item({ check: undefined })] }).ok).toBe(true)
    expect(assertCanStart({ checklist: [item({ check: '  ' })] }).ok).toBe(true)
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
    expect(actual[0].lastExitCode).toBe(1)
  })

  it('拒绝确认时子项保持未完成', () => {
    const actual = applyCheckResults([item()], {
      'item-1': result({ denied: true, exitCode: -1, output: '用户拒绝验收命令' })
    })

    expect(actual[0].done).toBe(false)
    expect(actual[0].lastExitCode).toBe(-1)
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

  it('清单为空且 overall exit 0 但 denied 或 timedOut 时目标未完成', () => {
    expect(
      isGoalComplete({
        checklist: [],
        verifyCommand: 'npm test',
        overall: result({ exitCode: 0, denied: true })
      })
    ).toBe(false)
    expect(
      isGoalComplete({
        checklist: [],
        verifyCommand: 'npm test',
        overall: result({ exitCode: 0, timedOut: true })
      })
    ).toBe(false)
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

  it('shouldDeliver：有 check 的项全过才收口；无 check 需已打过工作段', () => {
    expect(
      shouldDeliver({
        checklist: [item({ done: false })],
        hadWorkSegment: true
      })
    ).toBe(false)
    expect(
      shouldDeliver({
        checklist: [item({ done: true })],
        hadWorkSegment: true
      })
    ).toBe(true)
    expect(
      shouldDeliver({
        checklist: [item({ check: undefined, done: false })],
        hadWorkSegment: false
      })
    ).toBe(false)
    expect(
      shouldDeliver({
        checklist: [item({ check: undefined, done: false })],
        hadWorkSegment: true
      })
    ).toBe(true)
  })

  it('无总验收且带 check 的步骤全过则 isGoalComplete', () => {
    expect(isGoalComplete({ checklist: [item({ done: true })] })).toBe(true)
  })
})
