import { describe, expect, it, vi } from 'vitest'
import { resumeInterruptedGoals } from './boot-resume'

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

  it('空列表（paused 等未进入扫描）不自动续', () => {
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
