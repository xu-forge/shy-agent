import { describe, expect, it, vi } from 'vitest'
import { runTurn } from './index'
import type { TurnStepEvent, TurnInput } from './types'

vi.mock('../llm-client', () => ({
  streamChatCompletion: async function* () {
    yield { type: 'content', delta: '<think>先搜广州周末' }
    yield { type: 'content', delta: '</think>\n推荐珠江夜游' }
    yield { type: 'usage', promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    yield { type: 'done' }
  }
}))

const input: TurnInput = {
  sessionId: 'ses-reason',
  history: [{ role: 'user', content: '广州周末去哪玩' }],
  tools: [],
  llm: { baseURL: 'http://test', apiKey: 'test', model: 'gpt-test' }
}

describe('runTurn reasoning 流式事件', () => {
  it('content 含 think 标签时 emit reasoning_delta / reasoning_done / turn:delta', async () => {
    const events: TurnStepEvent[] = []
    const result = await runTurn(input, {
      emit: (e) => events.push(e),
      getReactGuide: () => 'guide',
      tools: [],
      mode: 'act',
      startTurn: 0
    })

    expect(result.status).toBe('done')
    const types = events.map((e) => e.type)
    expect(types).toContain('turn:reasoning_delta')
    expect(types).toContain('turn:reasoning_done')
    expect(types).toContain('turn:delta')

    const reason = events
      .filter((e): e is Extract<TurnStepEvent, { type: 'turn:reasoning_delta' }> => e.type === 'turn:reasoning_delta')
      .map((e) => e.content)
      .join('')
    expect(reason).toBe('先搜广州周末')

    const text = events
      .filter((e): e is Extract<TurnStepEvent, { type: 'turn:delta' }> => e.type === 'turn:delta')
      .map((e) => e.content)
      .join('')
    expect(text).toContain('推荐珠江夜游')
    expect(text).not.toContain('<think>')
  })
})
