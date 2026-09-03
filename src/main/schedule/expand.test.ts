import { describe, expect, it } from 'vitest'
import type { ScheduleTask, WorkflowSchedule } from '../../shared/ipc'
import { detectWorkflowScheduleConflicts, expandOccurrences } from './expand'

function schedule(patch: Partial<WorkflowSchedule> = {}): WorkflowSchedule {
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

function task(patch: Partial<ScheduleTask> & Pick<ScheduleTask, 'id' | 'title'>): ScheduleTask {
  return {
    enabled: true,
    action: 'remind',
    payload: { message: '提醒' },
    schedule: schedule(),
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...patch
  } as ScheduleTask
}

describe('expandOccurrences', () => {
  it('按本地时间展开每日任务并保留实例字段', () => {
    const occurrences = expandOccurrences(
      [task({ id: 'daily', title: '晨间提醒', schedule: schedule({ time: '09:30' }) })],
      new Date(2026, 7, 10, 0, 0),
      new Date(2026, 7, 12, 23, 59)
    )

    expect(occurrences).toEqual([
      {
        taskId: 'daily',
        at: new Date(2026, 7, 10, 9, 30).toISOString(),
        title: '晨间提醒',
        action: 'remind'
      },
      {
        taskId: 'daily',
        at: new Date(2026, 7, 11, 9, 30).toISOString(),
        title: '晨间提醒',
        action: 'remind'
      },
      {
        taskId: 'daily',
        at: new Date(2026, 7, 12, 9, 30).toISOString(),
        title: '晨间提醒',
        action: 'remind'
      }
    ])
  })

  it('按星期展开 weekly 任务', () => {
    const occurrences = expandOccurrences(
      [
        task({
          id: 'weekly',
          title: '周会',
          schedule: schedule({ frequency: 'weekly', time: '10:15', weekdays: [1, 3] })
        })
      ],
      new Date(2026, 7, 9, 0, 0),
      new Date(2026, 7, 15, 23, 59)
    )

    expect(occurrences.map((occurrence) => new Date(occurrence.at).getDay())).toEqual([1, 3])
  })

  it('按日期展开 monthly 任务', () => {
    const occurrences = expandOccurrences(
      [
        task({
          id: 'monthly',
          title: '月报',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          schedule: schedule({ frequency: 'monthly', time: '18:00', dayOfMonth: 15 })
        })
      ],
      new Date(2026, 6, 1, 0, 0),
      new Date(2026, 8, 30, 23, 59)
    )

    expect(occurrences.map((occurrence) => new Date(occurrence.at).getDate())).toEqual([15, 15, 15])
  })

  it('范围两端按分钟闭区间处理，且包含停用任务供日历灰态展示', () => {
    const disabled = task({
      id: 'disabled',
      title: '停用提醒',
      enabled: false,
      schedule: schedule({ enabled: false, time: '09:00' })
    })

    expect(
      expandOccurrences(
        [disabled],
        new Date(2026, 7, 10, 9, 0, 30),
        new Date(2026, 7, 11, 9, 0, 15)
      ).map((occurrence) => occurrence.at)
    ).toEqual([
      new Date(2026, 7, 10, 9, 0).toISOString(),
      new Date(2026, 7, 11, 9, 0).toISOString()
    ])
  })

  it('空范围不返回实例', () => {
    expect(
      expandOccurrences(
        [task({ id: 'daily', title: '提醒' })],
        new Date(2026, 7, 12),
        new Date(2026, 7, 11)
      )
    ).toEqual([])
  })

  it('不展开早于 createdAt 的实例', () => {
    const created = new Date(2026, 7, 11, 12, 0)
    const occurrences = expandOccurrences(
      [
        task({
          id: 'daily',
          title: '新建日报',
          createdAt: created.toISOString(),
          updatedAt: created.toISOString(),
          schedule: schedule({ time: '09:00' })
        })
      ],
      new Date(2026, 7, 10, 0, 0),
      new Date(2026, 7, 12, 23, 59)
    )

    // 8/10、8/11 09:00 都早于创建时刻 12:00，只剩 8/12
    expect(occurrences.map((o) => o.at)).toEqual([
      new Date(2026, 7, 12, 9, 0).toISOString()
    ])
  })

  it('创建当日若触发点尚未早于创建分钟，仍展开该次', () => {
    const created = new Date(2026, 7, 11, 8, 0)
    const occurrences = expandOccurrences(
      [
        task({
          id: 'daily',
          title: '上午建',
          createdAt: created.toISOString(),
          updatedAt: created.toISOString(),
          schedule: schedule({ time: '09:00' })
        })
      ],
      new Date(2026, 7, 11, 0, 0),
      new Date(2026, 7, 11, 23, 59)
    )

    expect(occurrences.map((o) => o.at)).toEqual([
      new Date(2026, 7, 11, 9, 0).toISOString()
    ])
  })
})

describe('detectWorkflowScheduleConflicts', () => {
  it('workflow 砍掉后永远返回空数组', () => {
    expect(
      detectWorkflowScheduleConflicts([
        task({ id: 'reminder', title: '普通提醒' })
      ])
    ).toEqual([])
  })
})
