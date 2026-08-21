import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC, type ScheduleTask } from '../../shared/ipc'

const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }
  }
}))

import { registerScheduleIpc } from './ipc'

const task: ScheduleTask = {
  id: 'task-1',
  title: '日报',
  enabled: true,
  action: 'remind',
  payload: { message: '提醒' },
  schedule: {
    enabled: true,
    frequency: 'daily',
    time: '09:00',
    weekdays: [],
    dayOfMonth: 1,
    minute: 0,
    cron: '0 9 * * *'
  },
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z'
}

beforeEach(() => {
  handlers.clear()
})

describe('schedule task IPC', () => {
  it('注册 CRUD 与范围展开通道，warnings 永远空数组', async () => {
    const listTasks = vi.fn(() => [task])
    const createTask = vi.fn(() => task)
    const updateTask = vi.fn(() => task)
    const expand = vi.fn(() => [])

    registerScheduleIpc({
      listTasks,
      getTask: vi.fn(() => task),
      createTask,
      updateTask,
      deleteTask: vi.fn(() => true),
      expand
    })

    expect([...handlers.keys()]).toEqual(
      expect.arrayContaining([
        IPC.scheduleTasksList,
        IPC.scheduleTasksGet,
        IPC.scheduleTasksCreate,
        IPC.scheduleTasksUpdate,
        IPC.scheduleTasksDelete,
        IPC.scheduleTasksExpand
      ])
    )

    const listResult = await handlers.get(IPC.scheduleTasksList)!({})
    expect(listResult).toMatchObject({ tasks: [task], warnings: [] })

    const createInput = {
      title: task.title,
      enabled: task.enabled,
      action: task.action,
      payload: task.payload,
      schedule: task.schedule
    }
    const createResult = await handlers.get(IPC.scheduleTasksCreate)!({}, createInput)
    expect(createTask).toHaveBeenCalledWith(createInput)
    expect(createResult).toMatchObject({ task, warnings: [] })

    const patch = { title: '新日报' }
    const updateResult = await handlers.get(IPC.scheduleTasksUpdate)!({}, {
      id: task.id,
      patch
    })
    expect(updateTask).toHaveBeenCalledWith(task.id, patch)
    expect(updateResult).toMatchObject({ task, warnings: [] })

    const rangeStart = '2026-08-01T00:00:00.000Z'
    const rangeEnd = Date.parse('2026-08-31T23:59:00.000Z')
    await handlers.get(IPC.scheduleTasksExpand)!({}, { rangeStart, rangeEnd })
    expect(expand).toHaveBeenCalledWith([task], new Date(rangeStart), new Date(rangeEnd))
  })
})
