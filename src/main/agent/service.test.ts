import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const { runGoalDriver, buildAgentGraph, getSession, appendMessage, updateSessionRuntime } =
  vi.hoisted(() => ({
    runGoalDriver: vi.fn(async () => undefined),
    buildAgentGraph: vi.fn(),
    getSession: vi.fn(),
    appendMessage: vi.fn(),
    updateSessionRuntime: vi.fn()
  }))

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

vi.mock('../settings/store', () => ({
  getSettings: () =>
    Promise.resolve({
      baseURL: 'http://mock',
      apiKey: 'test-key',
      model: 'gpt-test',
      stagnationRounds: 20,
      tokenBudget: 0,
      segmentSteps: 60
    })
}))

vi.mock('./goal-driver', () => ({ runGoalDriver }))
vi.mock('./graph', () => ({ buildAgentGraph }))
vi.mock('../sessions/store', () => ({
  getSession,
  appendMessage,
  updateSessionRuntime
}))

vi.mock('../memory/compress', () => ({
  compressWithLlm: async () => ''
}))

vi.mock('../sessions/title', () => ({
  summarizeSessionTitle: async () => null
}))

vi.mock('../memory/db', () => ({
  listLongMemory: () => [],
  upsertSessionTask: (record: unknown) => record,
  deleteSessionTask: () => undefined
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-agent-service-'))
  process.env.SHY_HOME = tmpDir
  runGoalDriver.mockReset().mockResolvedValue(undefined)
  buildAgentGraph.mockReset().mockReturnValue({
    invoke: vi.fn(async () => ({
      round: 0,
      checklist: [],
      goal: '',
      tokenUsed: 0,
      stagnantRounds: 0
    }))
  })
  getSession.mockReset().mockReturnValue({
    id: 'sess-1',
    title: 't',
    mode: 'interactive',
    messages: [],
    checklist: [],
    goal: '',
    shortMemory: '',
    paused: false,
    runStatus: 'idle'
  })
  appendMessage.mockReset()
  updateSessionRuntime.mockReset()
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('runAgent mode routing', () => {
  it('interactive 不走 GoalDriver，也不要求 verifyCommand 或子项 check', async () => {
    const { runAgent } = await import('./service')
    const events: Array<{ type: string; message?: string }> = []

    await runAgent({
      sessionId: 'sess-interactive',
      message: '随便聊聊',
      mode: 'interactive',
      emit: (event) => events.push(event),
      waitConfirm: async () => true
    })

    expect(runGoalDriver).not.toHaveBeenCalled()
    expect(buildAgentGraph).toHaveBeenCalled()
    expect(events.some((e) => e.type === 'error')).toBe(false)
    expect(events.some((e) => /verifyCommand|验收|check/i.test(e.message ?? ''))).toBe(false)
  })

  it('goal 走 GoalDriver，并传入 verifyCommand', async () => {
    getSession.mockReturnValue({
      id: 'sess-goal',
      title: 'g',
      mode: 'goal',
      messages: [],
      checklist: [],
      goal: '完成目标',
      shortMemory: '',
      paused: false,
      runStatus: 'idle'
    })
    const { runAgent } = await import('./service')

    await runAgent({
      sessionId: 'sess-goal',
      message: '完成目标',
      mode: 'goal',
      verifyCommand: 'npm test',
      emit: () => undefined,
      waitConfirm: async () => true
    })

    expect(runGoalDriver).toHaveBeenCalledOnce()
    expect(runGoalDriver).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-goal',
        message: '完成目标',
        verifyCommand: 'npm test'
      })
    )
    expect(buildAgentGraph).not.toHaveBeenCalled()
  })
})

describe('pause / resume waiters', () => {
  it('pauseAgent 后 waitIfPaused 直到 resumeAgent 才解除，且不启动第二次运行', async () => {
    const { waitIfPaused, pauseAgent, resumeAgent, ensureAgentRuntime } = await import('./service')
    const rt = ensureAgentRuntime('sess-1')
    const emit = vi.fn()
    pauseAgent('sess-1')

    let resolved = false
    const waiting = waitIfPaused('sess-1', emit).then(() => {
      resolved = true
    })
    await new Promise((r) => setTimeout(r, 20))
    expect(resolved).toBe(false)
    expect(rt.paused).toBe(true)
    expect(rt.pauseWaiters.length).toBeGreaterThan(0)
    expect(emit).toHaveBeenCalledWith({ type: 'status', message: '已暂停，等待恢复…' })

    resumeAgent('sess-1', emit, async () => true)
    await waiting

    expect(resolved).toBe(true)
    expect(rt.paused).toBe(false)
    expect(rt.pauseWaiters.length).toBe(0)
    expect(runGoalDriver).not.toHaveBeenCalled()
    expect(buildAgentGraph).not.toHaveBeenCalled()
  })

  it('cancelAgent 立即持久化 cancelled', async () => {
    const { cancelAgent, ensureAgentRuntime, getAgentRuntime } = await import('./service')
    ensureAgentRuntime('sess-1')
    cancelAgent('sess-1')
    expect(updateSessionRuntime).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ runStatus: 'cancelled' })
    )
    expect(getAgentRuntime('sess-1')).toBeUndefined()
  })
})
