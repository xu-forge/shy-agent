import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScheduleTask, WorkflowSchedule } from '../../shared/ipc'
import { checkCalendarTasks, resetScheduleFireDedup, scheduledAtIso } from './runner'

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
    agentMode: 'goal',
    allowAutoConfirm: false,
    projectId: null,
    createdAt: '',
    updatedAt: '',
    ...patch
  } as ScheduleTask
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  const runs = new Map<string, { id: string; status: string; sessionId?: string | null }>()
  return {
    listTasks: () => [] as ScheduleTask[],
    emit: vi.fn(),
    log: vi.fn(),
    waitConfirm: vi.fn(async () => true),
    emitAgent: vi.fn(),
    createRun: vi.fn((input: { taskId: string; action: string; scheduledAt: string }) => {
      const id = `run-${input.taskId}`
      const run = {
        id,
        taskId: input.taskId,
        scheduledAt: input.scheduledAt,
        action: input.action,
        status: 'running',
        startedAt: new Date().toISOString(),
        sessionId: null,
        endedAt: null,
        errorMessage: null
      }
      runs.set(id, run)
      return run
    }),
    updateRun: vi.fn((id: string, patch: Record<string, unknown>) => {
      const cur = runs.get(id)
      if (!cur) return null
      const next = { ...cur, ...patch }
      runs.set(id, next)
      return next
    }),
    getRun: vi.fn((id: string) => runs.get(id) ?? null),
    createSession: vi.fn(() => ({
      id: 'sess-1',
      title: 't',
      mode: 'goal' as const,
      createdAt: '',
      updatedAt: '',
      paused: false,
      runStatus: 'idle' as const
    })),
    bindSessionProject: vi.fn(() => ({ ok: true as const })),
    runAgent: vi.fn(async () => undefined),
    getSession: vi.fn(() => null),
    getSettings: vi.fn(async () => ({ apiKey: 'k', baseURL: '', model: '' })),
    listSkills: vi.fn(async () => [
      { id: 'daily-summary', name: '日报', description: 'd', path: '', rootKind: 'user', enabled: true }
    ]),
    confirmTimeoutMs: 50,
    ...overrides,
    _runs: runs
  }
}

beforeEach(() => {
  resetScheduleFireDedup()
})

describe('checkCalendarTasks', () => {
  it('只执行 enabled 且当前分钟匹配的任务，并优先使用显式 cron', async () => {
    const deps = baseDeps({
      listTasks: () => [
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
    })
    const now = new Date(2026, 7, 11, 9, 30)

    await checkCalendarTasks(now, deps as never)

    expect(deps.emit).toHaveBeenCalledTimes(2)
    expect(deps.createRun).toHaveBeenCalledTimes(2)
    expect(deps.updateRun).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'succeeded' })
    )
  })

  it('同一任务在同一分钟只触发一次', async () => {
    const deps = baseDeps({
      listTasks: () => [task('debounced', 'remind', { message: '去重' })]
    })
    const now = new Date(2026, 7, 11, 9, 30)

    await checkCalendarTasks(now, deps as never)
    await checkCalendarTasks(new Date(now.getTime() + 20_000), deps as never)

    expect(deps.emit).toHaveBeenCalledTimes(1)
  })

  it('跑技能：建会话、绑定项目、调用 runAgent', async () => {
    const deps = baseDeps({
      listTasks: () => [
        task('skill', 'run_skill', { skillId: 'daily-summary' }, { projectId: 'p1' })
      ]
    })
    const now = new Date(2026, 7, 11, 9, 30)

    await checkCalendarTasks(now, deps as never)

    expect(deps.createSession).toHaveBeenCalledWith('goal', 'skill')
    expect(deps.bindSessionProject).toHaveBeenCalledWith('sess-1', 'p1')
    expect(deps.runAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-1',
        mode: 'goal',
        message: expect.stringContaining('daily-summary')
      })
    )
    expect(deps.updateRun).toHaveBeenCalledWith(
      'run-skill',
      expect.objectContaining({ status: 'succeeded', sessionId: 'sess-1' })
    )
    expect(deps.getSession).toHaveBeenCalledWith('sess-1')
  })

  it('缺 apiKey 时 run 标记 failed', async () => {
    const deps = baseDeps({
      listTasks: () => [task('skill', 'run_skill', { skillId: 'daily-summary' })],
      getSettings: vi.fn(async () => ({ apiKey: '', baseURL: '', model: '' }))
    })
    const now = new Date(2026, 7, 11, 9, 30)

    await checkCalendarTasks(now, deps as never)

    expect(deps.runAgent).not.toHaveBeenCalled()
    expect(deps.updateRun).toHaveBeenCalledWith(
      'run-skill',
      expect.objectContaining({
        status: 'failed',
        errorMessage: expect.stringContaining('apiKey')
      })
    )
  })

  it('scheduledAtIso 与分钟对齐', () => {
    const d = new Date('2026-09-03T09:00:30.500Z')
    expect(scheduledAtIso(d)).toBe('2026-09-03T09:00:00.000Z')
  })
})
