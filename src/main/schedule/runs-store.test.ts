import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-schedule-runs-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('schedule runs store', () => {
  it('创建并按 taskId+scheduledAt 取最新', async () => {
    const store = await import('./runs-store')
    const at = '2026-09-03T01:00:00.000Z'
    const first = store.createScheduleRun({
      taskId: 't1',
      scheduledAt: at,
      action: 'remind',
      status: 'failed',
      errorMessage: 'old',
      startedAt: '2026-09-03T01:00:01.000Z'
    })
    const second = store.createScheduleRun({
      taskId: 't1',
      scheduledAt: at,
      action: 'remind',
      status: 'succeeded',
      startedAt: '2026-09-03T01:00:05.000Z'
    })
    expect(store.getScheduleRunByTaskAt('t1', at)?.id).toBe(second.id)
    expect(store.getScheduleRun(first.id)?.status).toBe('failed')
  })

  it('按同一分钟对齐查找 run（ISO 字符串可以不同）', async () => {
    const store = await import('./runs-store')
    const run = store.createScheduleRun({
      taskId: 't-minute',
      scheduledAt: '2026-09-03T16:18:00.000Z',
      action: 'remind',
      status: 'succeeded'
    })
    expect(store.getScheduleRunByTaskAt('t-minute', '2026-09-03T16:18:00.000Z')?.id).toBe(run.id)
    expect(store.getScheduleRunByTaskAt('t-minute', '2026-09-03T16:18:30.500Z')?.id).toBe(run.id)
  })

  it('更新状态与结束时间', async () => {
    const store = await import('./runs-store')
    const run = store.createScheduleRun({
      taskId: 't2',
      scheduledAt: '2026-09-03T02:00:00.000Z',
      action: 'run_skill'
    })
    const updated = store.updateScheduleRun(run.id, {
      status: 'succeeded',
      sessionId: 'sess-1',
      endedAt: '2026-09-03T02:00:10.000Z'
    })
    expect(updated).toMatchObject({
      status: 'succeeded',
      sessionId: 'sess-1',
      endedAt: '2026-09-03T02:00:10.000Z'
    })
  })

  it('按时间范围列出', async () => {
    const store = await import('./runs-store')
    store.createScheduleRun({
      taskId: 'a',
      scheduledAt: '2026-09-03T01:00:00.000Z',
      action: 'remind'
    })
    store.createScheduleRun({
      taskId: 'b',
      scheduledAt: '2026-09-03T03:00:00.000Z',
      action: 'remind'
    })
    store.createScheduleRun({
      taskId: 'c',
      scheduledAt: '2026-09-04T01:00:00.000Z',
      action: 'remind'
    })
    const list = store.listScheduleRunsInRange(
      new Date('2026-09-03T00:00:00.000Z'),
      new Date('2026-09-03T23:59:59.000Z')
    )
    expect(list.map((r) => r.taskId)).toEqual(['a', 'b'])
  })
})
