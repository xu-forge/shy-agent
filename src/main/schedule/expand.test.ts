import { describe, expect, it } from 'vitest'
import type { ScheduleTask, Workflow, WorkflowSchedule } from '../../shared/ipc'
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

function workflow(id: string, scheduleEnabled: boolean): Workflow {
  return {
    id,
    name: id,
    description: '',
    nodes: [],
    edges: [],
    schedule: schedule({ enabled: scheduleEnabled }),
    outputConfig: {},
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z'
  }
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
})

describe('detectWorkflowScheduleConflicts', () => {
  it('仅为目标工作流自带定时已启用的 run_workflow 任务生成警告', () => {
    const tasks = [
      task({
        id: 'conflict',
        title: '运行日报',
        action: 'run_workflow',
        payload: { workflowId: 'workflow-enabled' }
      }),
      task({
        id: 'workflow-disabled',
        title: '运行周报',
        action: 'run_workflow',
        payload: { workflowId: 'workflow-disabled' }
      }),
      task({ id: 'reminder', title: '普通提醒' })
    ]

    expect(
      detectWorkflowScheduleConflicts(tasks, [
        workflow('workflow-enabled', true),
        workflow('workflow-disabled', false)
      ])
    ).toEqual([
      {
        type: 'workflow_schedule_conflict',
        taskId: 'conflict',
        workflowId: 'workflow-enabled',
        message: '日历任务“运行日报”与工作流“workflow-enabled”的定时均已启用，可能重复运行'
      }
    ])
  })

  it('目标工作流不存在时不生成警告', () => {
    expect(
      detectWorkflowScheduleConflicts(
        [
          task({
            id: 'missing',
            title: '运行缺失工作流',
            action: 'run_workflow',
            payload: { workflowId: 'missing-workflow' }
          })
        ],
        []
      )
    ).toEqual([])
  })
})
