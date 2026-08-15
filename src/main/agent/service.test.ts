import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const {
  runGoalDriver,
  buildAgentGraph,
  getSession,
  appendMessage,
  updateSessionRuntime
} = vi.hoisted(() => ({
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

vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    bindTools(): this {
      return this
    }
    async invoke(): Promise<{ content: string }> {
      return { content: '' }
    }
  }
  return { ChatOpenAI: MockChatOpenAI }
})

vi.mock('../skills/match', () => ({
  matchSkills: async () => [],
  formatSkillsForPrompt: () => ''
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
