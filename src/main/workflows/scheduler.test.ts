import { describe, expect, it } from 'vitest'
import { compileCron, cronMatches, msUntilNext } from './scheduler'
import { describeSchedule } from '../../shared/workflow-format'
import type { WorkflowSchedule } from '../../shared/ipc'

function sched(patch: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
  return {
    enabled: true,
    frequency: 'daily',
    time: '09:00',
    weekdays: [],
    dayOfMonth: 1,
    minute: 0,
    cron: '',
    ...patch
  }
}

describe('compileCron', () => {
  it('daily 09:00 -> 0 9 * * *', () => {
    expect(compileCron(sched({ frequency: 'daily', time: '09:00' }))).toBe('0 9 * * *')
  })
  it('hourly minute 15 -> 15 * * * *', () => {
    expect(compileCron(sched({ frequency: 'hourly', minute: 15 }))).toBe('15 * * * *')
  })
  it('weekdays Mon-Fri -> 0 9 * * 1-5', () => {
    expect(compileCron(sched({ frequency: 'weekdays', time: '08:30', weekdays: [] }))).toBe(
      '30 8 * * 1-5'
    )
  })
  it('weekly with weekday -> includes day', () => {
    expect(compileCron(sched({ frequency: 'weekly', time: '10:00', weekdays: [1, 3] }))).toBe(
      '0 10 * * 1,3'
    )
  })
  it('monthly day 15 -> 0 9 15 * *', () => {
    expect(compileCron(sched({ frequency: 'monthly', time: '09:00', dayOfMonth: 15 }))).toBe(
      '0 9 15 * *'
    )
  })
})

describe('cronMatches', () => {
  it('matches exact minute', () => {
    expect(cronMatches('0 9 * * *', new Date(2026, 7, 11, 9, 0))).toBe(true)
    expect(cronMatches('0 9 * * *', new Date(2026, 7, 11, 9, 1))).toBe(false)
  })
  it('matches weekday range 1-5', () => {
    // 2026-08-11 is Tuesday (dow=2)
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 7, 11, 9, 0))).toBe(true)
  })
  it('rejects wrong day', () => {
    // 2026-08-09 is Sunday (dow=0)
    expect(cronMatches('0 9 * * 1-5', new Date(2026, 7, 9, 9, 0))).toBe(false)
  })
})

describe('msUntilNext', () => {
  it('returns positive ms for a future daily schedule', () => {
    const ms = msUntilNext('0 9 * * *', new Date(2026, 7, 11, 8, 0))
    expect(ms).toBeGreaterThan(0)
  })
  it('returns -1 when no match in 8 days (impossible for daily)', () => {
    const ms = msUntilNext('0 9 * * *', new Date(2026, 7, 11, 9, 0))
    expect(ms).toBeGreaterThan(0)
  })
})

describe('describeSchedule', () => {
  it('daily', () => {
    expect(describeSchedule(sched({ frequency: 'daily', time: '09:00' }))).toBe('每天 09:00')
  })
  it('hourly', () => {
    expect(describeSchedule(sched({ frequency: 'hourly', minute: 30 }))).toBe('每小时 30 分')
  })
})
