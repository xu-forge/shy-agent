import { describe, expect, it, vi } from 'vitest'

// Mock sessions/store before importing goal-tools
vi.mock('../sessions/store', () => ({
  getSession: vi.fn(),
  updateSessionRuntime: vi.fn()
}))

import { buildGoalTools, makeGetGoalTool, makeUpdateGoalTool } from './goal-tools'
import { getSession, updateSessionRuntime } from '../sessions/store'
import type { AgentEvent } from './service'
import type { MockedFunction } from 'vitest'

const mkEvent = (): AgentEvent[] => []
const mkSession = (
  checklist: Array<{ id: string; title: string; done: boolean; check?: string }> = []
): import('../../shared/ipc').SessionDetail => ({
  id: 's1',
  title: 'test',
  mode: 'goal' as const,
  updatedAt: '',
  createdAt: '',
  paused: false,
  runStatus: 'running' as const,
  checklist,
  messages: [],
  shortMemory: ''
})
const mkGetSnapshot =
  (overrides = {}) =>
  () => ({
    goal: '测试目标',
    checklist: [{ id: '1', title: '步骤 1', done: true }],
    runStatus: 'running',
    progress: { done: 1, total: 1 },
    budget: { tokenUsed: 100, tokenBudget: 1000, pct: 10, disabled: false },
    stagnantRounds: 0,
    blockedRounds: 0,
    blockedAuditRounds: 3,
    paused: false,
    checkpoint: null,
    ...overrides
  })

describe('makeGetGoalTool', () => {
  it('name 是 get_goal', () => {
    const tool = makeGetGoalTool({
      sessionId: 's1',
      emit: () => {},
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    expect(tool.name).toBe('get_goal')
  })

  it('调用返回 GoalSnapshot JSON', async () => {
    const tool = makeGetGoalTool({
      sessionId: 's1',
      emit: () => {},
      getSnapshot: mkGetSnapshot({ goal: '我的目标' }),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    const result = await tool.run({})
    const parsed = JSON.parse(String(result))
    expect(parsed.goal).toBe('我的目标')
    expect(parsed.checklist).toEqual([{ id: '1', title: '步骤 1', done: true }])
  })
})

describe('makeUpdateGoalTool', () => {
  it('name 是 update_goal', () => {
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: () => {},
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    expect(tool.name).toBe('update_goal')
  })

  it('auditCheck 未通过 → complete 被拒绝', async () => {
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: () => {},
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: false }, // LLM 自检不通过
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(mkSession())
    const result = await tool.run({ status: 'complete', tokensUsed: 100 })
    const parsed = JSON.parse(String(result))
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('Completion audit gate rejected')
  })

  it('auditCheck 通过 + report off → emit 不触发，但 ok=true', async () => {
    const events: AgentEvent[] = mkEvent()
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: (e) => events.push(e),
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: false
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(mkSession())
    const result = await tool.run({ status: 'complete', tokensUsed: 200 })
    const parsed = JSON.parse(String(result))
    expect(parsed.ok).toBe(true)
    expect(parsed.status).toBe('complete')
    expect(parsed.reported).toBe(false)
    expect(events).toHaveLength(0)
    expect(updateSessionRuntime).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ runStatus: 'completed' })
    )
  })

  it('auditCheck 通过 + report on → emit goal_complete', async () => {
    const events: AgentEvent[] = mkEvent()
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: (e) => events.push(e),
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(
      mkSession([{ id: '1', title: 'a', done: true }])
    )
    await tool.run({ status: 'complete', tokensUsed: 500 })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('goal_complete')
    expect((events[0] as Extract<AgentEvent, { type: 'goal_complete' }>).tokenUsed).toBe(500)
  })

  it('blockedRounds 未达阈值 → blocked 被拒绝', async () => {
    const events: AgentEvent[] = mkEvent()
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: (e) => events.push(e),
      getSnapshot: mkGetSnapshot({ blockedRounds: 1 }),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(mkSession())
    const result = await tool.run({ status: 'blocked', reason: '网络问题' })
    const parsed = JSON.parse(String(result))
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toContain('Blocked audit gate rejected')
    expect(events).toHaveLength(0)
  })

  it('blockedRounds 达阈值 → blocked 触发 + emit', async () => {
    const events: AgentEvent[] = mkEvent()
    const tool = makeUpdateGoalTool({
      sessionId: 's1',
      emit: (e) => events.push(e),
      getSnapshot: mkGetSnapshot({ blockedRounds: 3 }),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(mkSession())
    const result = await tool.run({ status: 'blocked', reason: 'LLM 一直同样失败' })
    const parsed = JSON.parse(String(result))
    expect(parsed.ok).toBe(true)
    expect(parsed.status).toBe('blocked')
    expect(parsed.rounds).toBe(3)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('blocked')
    expect((events[0] as Extract<AgentEvent, { type: 'blocked' }>).rounds).toBe(3)
    expect((events[0] as Extract<AgentEvent, { type: 'blocked' }>).reason).toBe('LLM 一直同样失败')
    expect(updateSessionRuntime).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ runStatus: 'idle', paused: true })
    )
  })

  it('session 不存在 → ok=false', async () => {
    const tool = makeUpdateGoalTool({
      sessionId: 'missing',
      emit: () => {},
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    ;(getSession as unknown as MockedFunction<typeof getSession>).mockReturnValue(null)
    const result = await tool.run({ status: 'complete' })
    const parsed = JSON.parse(String(result))
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toBe('session not found')
  })
})

describe('buildGoalTools', () => {
  it('返回两个工具', () => {
    const tools = buildGoalTools({
      sessionId: 's1',
      emit: () => {},
      getSnapshot: mkGetSnapshot(),
      auditOkRef: { current: true },
      blockedAuditRounds: 3,
      enableGoalCompleteReport: true
    })
    expect(tools).toHaveLength(2)
    expect(tools.map((t) => t.name).sort()).toEqual(['get_goal', 'update_goal'])
  })
})
