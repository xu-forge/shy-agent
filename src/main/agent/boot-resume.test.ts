import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resumeInterruptedGoals } from './boot-resume'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

describe('resumeInterruptedGoals', () => {
  it('只恢复最新会话并暂停其余运行中会话', () => {
    const resume = vi.fn()
    const pause = vi.fn()

    const result = resumeInterruptedGoals(
      [
        { id: 'older', updatedAt: '2026-08-01T00:00:00.000Z' },
        { id: 'latest', updatedAt: '2026-08-02T00:00:00.000Z' }
      ],
      { resume, pause }
    )

    expect(result).toEqual({ resumed: 'latest', paused: ['older'] })
    expect(resume).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledWith('latest')
    expect(pause).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledWith('older')
  })

  it('空扫描列表不自动续', () => {
    const resume = vi.fn()
    const pause = vi.fn()

    expect(resumeInterruptedGoals([], { resume, pause })).toEqual({
      resumed: null,
      paused: []
    })
    expect(resume).not.toHaveBeenCalled()
    expect(pause).not.toHaveBeenCalled()
  })
})

describe('scan boundary with real session store', () => {
  let tmpDir = ''

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'shy-boot-resume-'))
    process.env.SHY_HOME = tmpDir
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.SHY_HOME
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('只续最新 goal running，paused/completed/cancelled/idle/interactive 不进入回调', async () => {
    const store = await import('../sessions/store')
    const { resumeInterruptedGoals: resumeScan } = await import('./boot-resume')

    const olderRunning = store.createSession('goal', 'running-older')
    await new Promise((r) => setTimeout(r, 15))
    const newerRunning = store.createSession('goal', 'running-newer')
    const paused = store.createSession('goal', 'paused')
    const completed = store.createSession('goal', 'completed')
    const cancelled = store.createSession('goal', 'cancelled')
    const idle = store.createSession('goal', 'idle')
    const interactive = store.createSession('interactive', 'interactive')

    store.updateSessionRuntime(olderRunning.id, { runStatus: 'running' })
    await new Promise((r) => setTimeout(r, 15))
    store.updateSessionRuntime(newerRunning.id, { runStatus: 'running' })
    store.updateSessionRuntime(paused.id, { runStatus: 'paused' })
    store.updateSessionRuntime(completed.id, { runStatus: 'completed' })
    store.updateSessionRuntime(cancelled.id, { runStatus: 'cancelled' })
    store.updateSessionRuntime(interactive.id, { runStatus: 'running' })

    const resume = vi.fn()
    const pause = vi.fn()
    const running = store.listGoalSessionsByRunStatus('running')
    const result = resumeScan(running, { resume, pause })

    const excluded = [paused.id, completed.id, cancelled.id, idle.id, interactive.id]
    expect(result.resumed).toBe(newerRunning.id)
    expect(result.paused).toEqual([olderRunning.id])
    expect(resume).toHaveBeenCalledOnce()
    expect(resume).toHaveBeenCalledWith(newerRunning.id)
    expect(pause).toHaveBeenCalledOnce()
    expect(pause).toHaveBeenCalledWith(olderRunning.id)
    for (const id of excluded) {
      expect(resume.mock.calls.flat()).not.toContain(id)
      expect(pause.mock.calls.flat()).not.toContain(id)
    }
  })
})
