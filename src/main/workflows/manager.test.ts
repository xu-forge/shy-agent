import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const runWorkflowMock = vi.fn()
const listWorkflowsMock = vi.fn()

vi.mock('./engine', () => ({
  runWorkflow: (id: string, trigger: string, emit: (run: unknown) => void) => {
    runWorkflowMock(id, trigger)
    const run = { id: 'r1', workflowId: id, status: 'success' as const, trigger, logs: [] }
    emit(run)
    return Promise.resolve(run)
  }
}))

vi.mock('./db', () => ({
  listWorkflows: () => listWorkflowsMock(),
  getWorkflow: (id: string) => ({
    id,
    name: 'wf',
    nodes: [],
    edges: [],
    schedule: {},
    outputConfig: {},
    createdAt: '',
    updatedAt: ''
  }),
  listRuns: () => []
}))

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('../memory/db', () => ({
  getDb: () => ({
    exec: () => undefined,
    prepare: () => ({ run: () => undefined, get: () => undefined, all: () => [] })
  })
}))

import { checkSchedules, stopScheduler } from './manager'

function wf(
  id: string,
  enabled: boolean,
  cron: string
): {
  id: string
  name: string
  description: string
  nodes: never[]
  edges: never[]
  schedule: {
    enabled: boolean
    frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly'
    time: string
    weekdays: never[]
    dayOfMonth: number
    minute: number
    cron: string
  }
  outputConfig: Record<string, never>
  createdAt: string
  updatedAt: string
} {
  return {
    id,
    name: id,
    description: '',
    nodes: [],
    edges: [],
    schedule: {
      enabled,
      frequency: 'daily',
      time: '09:00',
      weekdays: [],
      dayOfMonth: 1,
      minute: 0,
      cron
    },
    outputConfig: {},
    createdAt: '',
    updatedAt: ''
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  runWorkflowMock.mockResolvedValue(undefined)
})

afterEach(() => {
  stopScheduler()
})

describe('checkSchedules（定时触发）', () => {
  it('cron 匹配时触发执行', async () => {
    // 构造一个匹配当前分钟的 cron：分 时 * * *
    const now = new Date()
    const cron = `${now.getMinutes()} ${now.getHours()} * * *`
    listWorkflowsMock.mockReturnValue([wf('w1', true, cron)])
    await checkSchedules()
    expect(runWorkflowMock).toHaveBeenCalledTimes(1)
    expect(runWorkflowMock).toHaveBeenCalledWith('w1', 'schedule')
  })

  it('cron 不匹配时跳过', async () => {
    // 一个绝不可能匹配的 cron：用分钟 61（非法）→ 实际用不同分钟
    const now = new Date()
    const badMinute = (now.getMinutes() + 1) % 60
    const cron = `${badMinute} ${now.getHours()} * * *`
    listWorkflowsMock.mockReturnValue([wf('w1', true, cron)])
    await checkSchedules()
    expect(runWorkflowMock).not.toHaveBeenCalled()
  })

  it('未启用定时的工作流跳过', async () => {
    const now = new Date()
    const cron = `${now.getMinutes()} ${now.getHours()} * * *`
    listWorkflowsMock.mockReturnValue([wf('w1', false, cron)])
    await checkSchedules()
    expect(runWorkflowMock).not.toHaveBeenCalled()
  })
})
