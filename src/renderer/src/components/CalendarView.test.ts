import { describe, expect, it } from 'vitest'
import type { ScheduleOccurrence } from '../../../shared/ipc'
import { groupOccurrencesByDay } from '../lib/calendarOccurrences'

describe('groupOccurrencesByDay', () => {
  it('保留同一任务在同一天的多个实例并按时间排序', () => {
    const occurrences: ScheduleOccurrence[] = [
      { taskId: 'hourly', at: '2026-08-11T10:00:00.000Z', title: '整点提醒', action: 'remind' },
      { taskId: 'hourly', at: '2026-08-11T08:00:00.000Z', title: '整点提醒', action: 'remind' },
      { taskId: 'daily', at: '2026-08-11T09:00:00.000Z', title: '日报', action: 'run_workflow' }
    ]

    expect(groupOccurrencesByDay(occurrences).get('2026-08-11')).toEqual([
      occurrences[1],
      occurrences[2],
      occurrences[0]
    ])
  })
})
