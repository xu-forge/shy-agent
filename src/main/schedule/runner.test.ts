import { describe, expect, it, vi } from 'vitest'
import type { ScheduleTask, WorkflowSchedule } from '../../shared/ipc'
import { checkCalendarTasks } from './runner'

const baseSchedule: WorkflowSchedule = {
  enabled: true,
  frequency: 'daily',
  time: '09:30',
  weekdays: [],
  dayOfMonth: 1,
  minute: 0,
  cron: ''
}

function task(
  id: string,
  action: ScheduleTask['action'],
  payload: ScheduleTask['payload'],
  patch: Partial<ScheduleTask> = {}
): ScheduleTask {
  return {
    id,
    title: id,
    enabled: true,
    schedule: baseSchedule,
    action,
    payload,
    createdAt: '',
    updatedAt: '',
    ...patch
  } as ScheduleTask
}

describe('checkCalendarTasks', () => {
  it('只执行 enabled 且当前分钟匹配的任务，并优先使用显式 cron', async () => {
    const emit = vi.fn()
    const now = new Date(2026, 7, 11, 9, 30)
    const tasks = [
      task('matching', 'remind', { message: '提醒 A' }),
      task('disabled', 'remind', { message: '不应执行' }, { enabled: false }),
      task(
        'cron-authoritative',
        'remind',
        { message: 'cron 覆盖' },
        {
          schedule: { ...baseSchedule, time: '10:45', cron: '30 9 * * *' }
        }
      ),
      task(
        'not-matching',
        'remind',
        { message: '不命中' },
        {
          schedule: { ...baseSchedule, cron: '31 9 * * *' }
        }
      )
    ]

    await checkCalendarTasks(now, {
      listTasks: () => tasks,
      emit,
      log: vi.fn()
    })

    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'matching', message: '提醒 A' })
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'cron-authoritative', message: 'cron 覆盖' })
    )
  })

  it('同一任务在同一分钟只触发一次', async () => {
    const emit = vi.fn()
    const now = new Date(2026, 7, 11, 9, 30)
    const deps = {
      listTasks: () => [task('debounced', 'remind', { message: '去重' })],
      emit,
      log: vi.fn()
    }

    await checkCalendarTasks(now, deps)
    await checkCalendarTasks(new Date(now.getTime() + 20_000), deps)

    expect(emit).toHaveBeenCalledTimes(1)
  })

  it('分发提醒，并对技能执行记录明确的预留日志', async () => {
    const emit = vi.fn()
    const log = vi.fn()
    const now = new Date(2026, 7, 11, 9, 30)

    await checkCalendarTasks(now, {
      listTasks: () => [
        task('reminder', 'remind', { message: '喝水' }),
        task('skill', 'run_skill', { skillId: 'daily-summary' })
      ],
      emit,
      log
    })

    expect(emit).toHaveBeenCalledWith({
      type: 'schedule_remind',
      taskId: 'reminder',
      title: 'reminder',
      message: '喝水',
      at: now.toISOString()
    })
    expect(log).toHaveBeenCalledWith(
      'info',
      expect.stringContaining('daily-summary'),
      expect.objectContaining({ taskId: 'skill', skillId: 'daily-summary' })
    )
  })
})
