import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TurnInput, TurnResult } from './turn-runner/types'

const { runTurn } = vi.hoisted(() => ({
  runTurn: vi.fn()
}))

vi.mock('./turn-runner', () => ({ runTurn }))

function emptyTurnResult(): TurnResult {
  return {
    status: 'done',
    turnId: 'turn_deadbeef',
    finalContent: 'ok',
    stepsExecuted: 1,
    tokenUsed: { prompt: 10, completion: 5 },
    stepDurations: {
      incrementTurn: 0,
      collectInput: 0,
      buildContext: 0,
      callLLM: 0,
      handleToolCalls: 0,
      runTools: 0,
      appendHistory: 0,
      decideNext: 0,
      done: 0
    }
  }
}

const graphState = {
  messages: [{ role: 'user' as const, content: '这段怎么改' }],
  mode: 'interactive' as const,
  goal: '',
  checklist: [],
  round: 0,
  lastDoneCount: 0,
  stagnantRounds: 0,
  lastAction: '',
  tokenUsed: 0,
  toolActivityCount: 0,
  lastVerifyToolActivityCount: 0
}

describe('buildAgentGraph system-reminder wiring', () => {
  beforeEach(() => {
    runTurn.mockReset().mockResolvedValue(emptyTurnResult())
  })

  it('把 opts.activeView 传入 runTurn，并接入默认 SystemReminderService', async () => {
    const { buildAgentGraph } = await import('./graph')
    const graph = buildAgentGraph({
      llm: { baseURL: 'http://mock', apiKey: '', model: 'gpt-test' },
      tools: [],
      emit: () => undefined,
      skillBlock: '',
      memoryBlock: '',
      sessionId: 'sess-1',
      activeView: { kind: 'code', relativePath: 'src/a.ts' }
    })

    await graph.invoke(graphState)

    expect(runTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        activeView: { kind: 'code', relativePath: 'src/a.ts' }
      }),
      expect.objectContaining({
        systemReminder: expect.objectContaining({
          buildReminder: expect.any(Function)
        })
      })
    )
  })

  it('未传 activeView 时 TurnInput 不含该字段', async () => {
    const { buildAgentGraph } = await import('./graph')
    const graph = buildAgentGraph({
      llm: { baseURL: 'http://mock', apiKey: '', model: 'gpt-test' },
      tools: [],
      emit: () => undefined,
      skillBlock: '',
      memoryBlock: '',
      sessionId: 'sess-1'
    })

    await graph.invoke(graphState)

    const turnInput = runTurn.mock.calls[0]?.[0] as TurnInput
    expect(turnInput).not.toHaveProperty('activeView')
  })
})
