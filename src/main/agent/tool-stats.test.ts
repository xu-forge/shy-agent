import { describe, expect, it, beforeEach } from 'vitest'
import {
  getToolStat,
  getToolStats,
  resetToolStats,
  trackToolCall
} from './tool-stats'

describe('tool-stats', () => {
  beforeEach(() => {
    resetToolStats()
  })

  it('trackToolCall 累计 calls', () => {
    trackToolCall('shell', 100, 50, 1000)
    trackToolCall('shell', 200, 80, 2000)
    const stat = getToolStat('shell')
    expect(stat?.calls).toBe(2)
    expect(stat?.totalInputTokens).toBe(300)
    expect(stat?.totalOutputTokens).toBe(130)
  })

  it('avgDurationMs 加权平均', () => {
    trackToolCall('shell', 0, 0, 1000) // avg = 1000
    trackToolCall('shell', 0, 0, 3000) // avg = (1000 + 3000) / 2 = 2000
    trackToolCall('shell', 0, 0, 5000) // avg = (2000*2 + 5000) / 3 = 3000
    expect(getToolStat('shell')?.avgDurationMs).toBeCloseTo(3000, 0)
  })

  it('负数 token / duration 兜底为 0', () => {
    trackToolCall('shell', -100, -50, -1000)
    const stat = getToolStat('shell')
    expect(stat?.totalInputTokens).toBe(0)
    expect(stat?.totalOutputTokens).toBe(0)
    expect(stat?.avgDurationMs).toBe(0)
  })

  it('getToolStats 按 call 数倒序', () => {
    trackToolCall('a', 0, 0, 100)
    trackToolCall('b', 0, 0, 100)
    trackToolCall('b', 0, 0, 100)
    trackToolCall('c', 0, 0, 100)
    trackToolCall('c', 0, 0, 100)
    trackToolCall('c', 0, 0, 100)
    const all = getToolStats()
    expect(all[0].name).toBe('c')
    expect(all[1].name).toBe('b')
    expect(all[2].name).toBe('a')
  })

  it('resetToolStats 清空', () => {
    trackToolCall('shell', 100, 50, 1000)
    resetToolStats()
    expect(getToolStat('shell')).toBeUndefined()
    expect(getToolStats()).toEqual([])
  })

  it('未 track 的工具返回 undefined', () => {
    expect(getToolStat('unknown')).toBeUndefined()
  })
})
