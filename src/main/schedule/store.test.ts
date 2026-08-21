import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkflowSchedule } from '../../shared/ipc'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-schedule-store-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

const dailySchedule: WorkflowSchedule = {
  enabled: false,
  frequency: 'daily',
  time: '09:30',
  weekdays: [],
  dayOfMonth: 1,
  minute: 0,
  cron: '30 9 * * *'
}

describe('schedule task store', () => {
  it('创建任务并持久化 JSON 字段', async () => {
    const store = await import('./store')

    const created = store.createScheduleTask({
      title: '晨间提醒',
      enabled: true,
      action: 'remind',
      payload: { message: '开始工作' },
      schedule: dailySchedule
    })

    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(created.createdAt).toBe(created.updatedAt)
    expect(created.schedule.enabled).toBe(true)
    expect(store.getScheduleTask(created.id)).toEqual(created)
    expect(store.listScheduleTasks()).toEqual([created])
  })

  it('更新任务时保留未修改字段并同步启用态', async () => {
    const store = await import('./store')
    const created = store.createScheduleTask({
      title: '运行日报',
      enabled: true,
      action: 'remind',
      payload: { message: '早间提醒' },
      schedule: dailySchedule
    })

    const updated = store.updateScheduleTask(created.id, {
      title: '暂停日报',
      enabled: false
    })

    expect(updated).toMatchObject({
      id: created.id,
      title: '暂停日报',
      enabled: false,
      action: 'remind',
      payload: { message: '早间提醒' }
    })
    expect(updated?.schedule.enabled).toBe(false)
    expect(updated?.createdAt).toBe(created.createdAt)
    expect(updated?.updatedAt).toBeDefined()
    expect(updated!.updatedAt >= created.updatedAt).toBe(true)
  })

  it('删除任务后 get/list 不再返回，并对缺失项安全处理', async () => {
    const store = await import('./store')
    const created = store.createScheduleTask({
      title: '运行技能',
      enabled: true,
      action: 'run_skill',
      payload: { skillId: 'skill-1' },
      schedule: dailySchedule
    })

    expect(store.deleteScheduleTask(created.id)).toBe(true)
    expect(store.getScheduleTask(created.id)).toBeNull()
    expect(store.listScheduleTasks()).toEqual([])
    expect(store.updateScheduleTask('missing', { title: '无效' })).toBeNull()
    expect(store.deleteScheduleTask('missing')).toBe(false)
  })

  it('重复建表保持幂等', async () => {
    const store = await import('./store')

    expect(() => {
      store.ensureScheduleTables()
      store.ensureScheduleTables()
    }).not.toThrow()
  })
})
