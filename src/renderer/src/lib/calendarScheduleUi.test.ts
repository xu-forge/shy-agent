import { describe, expect, it } from 'vitest'
import type { WorkflowSchedule } from '../../../shared/ipc'
import {
  buildMondayGrid,
  formatScheduleLabel,
  mondayIndex,
  occurrenceStatus,
  occurrenceStatusLabel,
  scheduleRunKey,
  startOfWeekMonday,
  weekDays
} from './calendarScheduleUi'

function sched(partial: Partial<WorkflowSchedule>): WorkflowSchedule {
  return {
    enabled: true,
    frequency: 'daily',
    time: '09:00',
    weekdays: [],
    dayOfMonth: 1,
    minute: 0,
    cron: '',
    ...partial
  }
}

describe('mondayIndex / startOfWeekMonday / weekDays', () => {
  it('周三对应 mondayIndex=2', () => {
    // 2026-09-02 是周三
    expect(mondayIndex(new Date(2026, 8, 2))).toBe(2)
  })

  it('含周三的一周从周一开始', () => {
    const start = startOfWeekMonday(new Date(2026, 8, 2))
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(7) // Aug
    expect(start.getDate()).toBe(31)
    expect(start.getDay()).toBe(1)
  })

  it('weekDays 返回 7 天且首尾为周一周日', () => {
    const days = weekDays(new Date(2026, 8, 3))
    expect(days).toHaveLength(7)
    expect(days[0]!.getDay()).toBe(1)
    expect(days[6]!.getDay()).toBe(0)
  })
})

describe('buildMondayGrid', () => {
  it('2026-09-01 为周二时，网格以周一开始且 1 日落在第二列', () => {
    // 2026-09-01 = Tuesday
    expect(new Date(2026, 8, 1).getDay()).toBe(2)
    const grid = buildMondayGrid(2026, 8)
    expect(grid).toHaveLength(42)
    expect(grid[0]!.getDay()).toBe(1)
    expect(grid[1]!.getFullYear()).toBe(2026)
    expect(grid[1]!.getMonth()).toBe(8)
    expect(grid[1]!.getDate()).toBe(1)
  })

  it('1 日为周三时第一格为上周一且 1 日在第三列', () => {
    // Find a month where day 1 is Wednesday: 2025-10-01 is Wednesday
    expect(new Date(2025, 9, 1).getDay()).toBe(3)
    const grid = buildMondayGrid(2025, 9)
    expect(grid[0]!.getDay()).toBe(1)
    expect(grid[2]!.getDate()).toBe(1)
    expect(grid[2]!.getMonth()).toBe(9)
  })
})

describe('occurrenceStatus', () => {
  const now = new Date('2026-09-03T12:00:00.000Z')

  it('未启用 → paused', () => {
    expect(
      occurrenceStatus({ at: '2026-09-04T01:00:00.000Z' }, { enabled: false }, now)
    ).toBe('paused')
    expect(occurrenceStatusLabel('paused')).toBe('已暂停')
  })

  it('已过且无 run → missed（未执行）', () => {
    expect(
      occurrenceStatus({ at: '2026-09-01T01:00:00.000Z' }, { enabled: true }, now)
    ).toBe('missed')
    expect(occurrenceStatusLabel('missed')).toBe('未执行')
  })

  it('未来 → pending', () => {
    expect(
      occurrenceStatus({ at: '2026-09-10T01:00:00.000Z' }, { enabled: true }, now)
    ).toBe('pending')
    expect(occurrenceStatusLabel('pending')).toBe('待执行')
  })

  it('有 run 时优先映射 run.status', () => {
    const base = { at: '2026-09-01T01:00:00.000Z' }
    const task = { enabled: true }
    const runBase = {
      id: 'r1',
      taskId: 't1',
      scheduledAt: base.at,
      action: 'run_skill' as const,
      startedAt: '2026-09-01T01:00:00.000Z'
    }
    expect(
      occurrenceStatus(base, task, now, { ...runBase, status: 'succeeded' })
    ).toBe('succeeded')
    expect(occurrenceStatusLabel('succeeded')).toBe('执行成功')
    expect(occurrenceStatus(base, task, now, { ...runBase, status: 'failed' })).toBe('failed')
    expect(occurrenceStatusLabel('failed')).toBe('执行失败')
    expect(occurrenceStatus(base, task, now, { ...runBase, status: 'running' })).toBe('running')
    expect(occurrenceStatusLabel('running')).toBe('执行中')
    expect(
      occurrenceStatus(base, task, now, { ...runBase, status: 'waiting_confirm' })
    ).toBe('waiting_confirm')
    expect(occurrenceStatusLabel('waiting_confirm')).toBe('等待确认')
  })
})

describe('scheduleRunKey', () => {
  it('同一分钟的不同 ISO 映射到同一 key', () => {
    const a = scheduleRunKey('t1', '2026-09-03T16:18:00.000Z')
    const b = scheduleRunKey('t1', '2026-09-03T16:18:30.000Z')
    expect(a).toBe(b)
    expect(scheduleRunKey('t2', '2026-09-03T16:18:00.000Z')).not.toBe(a)
  })
})

describe('formatScheduleLabel', () => {
  it('每天', () => {
    expect(formatScheduleLabel(sched({ frequency: 'daily', time: '09:00' }))).toBe('每天 09:00')
  })

  it('工作日', () => {
    expect(formatScheduleLabel(sched({ frequency: 'weekdays', time: '08:30' }))).toBe(
      '工作日 08:30'
    )
  })

  it('每周选日', () => {
    expect(
      formatScheduleLabel(sched({ frequency: 'weekly', time: '09:00', weekdays: [1, 3] }))
    ).toBe('每周一、三 09:00')
  })

  it('每月', () => {
    expect(
      formatScheduleLabel(sched({ frequency: 'monthly', time: '10:00', dayOfMonth: 15 }))
    ).toBe('每月 15 日 10:00')
  })

  it('每小时', () => {
    expect(formatScheduleLabel(sched({ frequency: 'hourly', minute: 5 }))).toBe('每小时 第 5 分')
  })
})
