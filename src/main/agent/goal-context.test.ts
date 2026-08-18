import { describe, expect, it } from 'vitest'
import { buildGoalContext } from './goal-context'
import type { GoalChecklistItem } from '../../shared/ipc'

const mk = (overrides: Partial<GoalChecklistItem> = {}): GoalChecklistItem => ({
  id: '1',
  title: 'test',
  done: false,
  ...overrides
})

describe('buildGoalContext', () => {
  it('含全部 10 个字段', () => {
    const out = buildGoalContext(
      {
        goal: '实现目标模式',
        runStatus: 'running',
        checklist: [mk({ id: '1', done: true }), mk({ id: '2' })],
        stagnantRounds: 0,
        blockedRounds: 0,
        tokenUsed: 100
      },
      { tokenBudget: 1000, blockedAuditRounds: 3 },
      '/tmp/work'
    )
    expect(out).toContain('<goal_context source="goal">')
    expect(out).toContain('实现目标模式')
    expect(out).toContain('run_status')
    expect(out).toContain('progress')
    expect(out).toContain('budget')
    expect(out).toContain('stagnant_rounds')
    expect(out).toContain('blocked_rounds')
    expect(out).toContain('<fidelity>')
    expect(out).toContain('<completion_audit>')
    expect(out).toContain('<blocked_audit>')
    expect(out).toContain('<work_from_evidence>')
    expect(out).toContain('/tmp/work')
    expect(out).toContain('</goal_context>')
  })

  it('转义 XML 字符防注入', () => {
    const out = buildGoalContext(
      {
        goal: '<script>alert("xss")</script> & 1<2',
        runStatus: 'running',
        checklist: [],
        stagnantRounds: 0,
        blockedRounds: 0,
        tokenUsed: 0
      },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/cwd'
    )
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
    expect(out).toContain('&amp;')
  })

  it('progress done/total 边界正确', () => {
    const empty = buildGoalContext(
      { goal: 'g', checklist: [], stagnantRounds: 0, blockedRounds: 0, tokenUsed: 0 },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/'
    )
    expect(empty).toContain('<progress>0/0 done</progress>')

    const allDone = buildGoalContext(
      {
        goal: 'g',
        checklist: [mk({ id: '1', done: true }), mk({ id: '2', done: true })],
        stagnantRounds: 0,
        blockedRounds: 0,
        tokenUsed: 0
      },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/'
    )
    expect(allDone).toContain('<progress>2/2 done</progress>')
  })

  it('budget 计算：0/0 禁用、200000/400000 = 50%、超额 clamp 100%', () => {
    const disabled = buildGoalContext(
      { goal: 'g', checklist: [], stagnantRounds: 0, blockedRounds: 0, tokenUsed: 0 },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/'
    )
    expect(disabled).toContain('unlimited')

    const half = buildGoalContext(
      { goal: 'g', checklist: [], stagnantRounds: 0, blockedRounds: 0, tokenUsed: 200000 },
      { tokenBudget: 400000, blockedAuditRounds: 3 },
      '/'
    )
    expect(half).toContain('50%')

    const over = buildGoalContext(
      { goal: 'g', checklist: [], stagnantRounds: 0, blockedRounds: 0, tokenUsed: 800000 },
      { tokenBudget: 400000, blockedAuditRounds: 3 },
      '/'
    )
    expect(over).toContain('100%')
  })

  it('blockedRounds 接近阈值时显示 N/3', () => {
    const out = buildGoalContext(
      { goal: 'g', checklist: [], stagnantRounds: 0, blockedRounds: 2, tokenUsed: 0 },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/'
    )
    expect(out).toContain('<blocked_rounds>2/3</blocked_rounds>')
  })

  it('runStatus 透传', () => {
    const out = buildGoalContext(
      { goal: 'g', runStatus: 'paused', checklist: [], stagnantRounds: 0, blockedRounds: 0, tokenUsed: 0 },
      { tokenBudget: 0, blockedAuditRounds: 3 },
      '/'
    )
    expect(out).toContain('<run_status>paused</run_status>')
  })
})
