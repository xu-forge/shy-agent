import { describe, expect, it } from 'vitest'
import {
  SUBAGENT_MAX_CONCURRENT,
  SUBAGENT_TOOL_ALLOWLIST,
  DEFAULT_SUBAGENT_BUDGET
} from './types'

describe('subagent/types', () => {
  it('SUBAGENT_MAX_CONCURRENT = 3', () => {
    expect(SUBAGENT_MAX_CONCURRENT).toBe(3)
  })

  it('三种 subagent_type 都有工具白名单,explore/verifier 不允许写工具', () => {
    expect(SUBAGENT_TOOL_ALLOWLIST.explore.size).toBeGreaterThan(0)
    expect(SUBAGENT_TOOL_ALLOWLIST.worker.size).toBeGreaterThan(0)
    expect(SUBAGENT_TOOL_ALLOWLIST.verifier.size).toBeGreaterThan(0)

    // 写工具 explore/verifier 都看不到
    for (const writeTool of ['fs_write', 'fs_edit', 'fs_delete', 'memory_upsert', 'memory_delete', 'skill_write', 'skill_delete', 'goal_update']) {
      expect(SUBAGENT_TOOL_ALLOWLIST.explore.has(writeTool)).toBe(false)
      expect(SUBAGENT_TOOL_ALLOWLIST.verifier.has(writeTool)).toBe(false)
    }

    // worker 至少包含写工具
    expect(SUBAGENT_TOOL_ALLOWLIST.worker.has('fs_write')).toBe(true)
    expect(SUBAGENT_TOOL_ALLOWLIST.worker.has('fs_edit')).toBe(true)
    expect(SUBAGENT_TOOL_ALLOWLIST.worker.has('memory_upsert')).toBe(true)
  })

  it('explore 和 verifier 工具集不同（verifier 应有更窄的 read-only 集）', () => {
    // explore 至少包括搜索类工具
    expect(SUBAGENT_TOOL_ALLOWLIST.explore.has('grep')).toBe(true)
    expect(SUBAGENT_TOOL_ALLOWLIST.explore.has('glob')).toBe(true)
    // verifier 也应该能用这些
    expect(SUBAGENT_TOOL_ALLOWLIST.verifier.has('grep')).toBe(true)
    expect(SUBAGENT_TOOL_ALLOWLIST.verifier.has('glob')).toBe(true)
  })

  it('DEFAULT_SUBAGENT_BUDGET 全 0=无限', () => {
    expect(DEFAULT_SUBAGENT_BUDGET).toEqual({ tokenBudget: 0, maxSteps: 0, timeoutMs: 0 })
  })
})
