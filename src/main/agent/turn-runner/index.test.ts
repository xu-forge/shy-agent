import { describe, expect, it, vi } from 'vitest'
import { runTurn } from './index'
import type { TurnStepEvent, TurnInput } from './types'
import { buildTools } from '../tools/registry'

// Mock llm-client — 第一次 yield tool_call,第二次 yield plain content
let callCount = 0
const seenSystemPrompts: string[] = []
vi.mock('../llm-client', () => ({
  streamChatCompletion: async function* (
    _config: unknown,
    messages: unknown
  ) {
    callCount += 1
    const sysMsg = (messages as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'system'
    )
    if (sysMsg) seenSystemPrompts.push(sysMsg.content)
    if (callCount === 1) {
      yield { type: 'content', delta: '我先执行 ping：' }
      yield {
        type: 'tool_calls',
        toolCalls: [{ id: 'tc-1', type: 'function', function: { name: 'runtime_ping', arguments: '{"note":"first"}' } }]
      }
      yield { type: 'usage', promptTokens: 100, completionTokens: 50, totalTokens: 150 }
      yield { type: 'done' }
    } else {
      yield { type: 'content', delta: 'pong 完成' }
      yield { type: 'usage', promptTokens: 80, completionTokens: 30, totalTokens: 110 }
      yield { type: 'done' }
    }
  }
}))

const baseInput: TurnInput = {
  sessionId: 'ses-test',
  history: [{ role: 'user', content: 'ping 一下' }],
  tools: [
    {
      name: 'runtime_ping',
      description: '健康检查',
      parameters: { type: 'object', properties: {} }
    }
  ],
  llm: { baseURL: 'http://test', apiKey: 'test', model: 'gpt-test' }
}

describe('runTurn 端到端', () => {
  it('完整 8 步走完 + 1 个 tool_call + 历史写入 + 第二轮 done', async () => {
    // 用 registry 里的真 LangChain tool（runtime_ping）
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-test'
    })
    // 过滤只留 runtime_ping（避免其他工具混入）
    const pingOnly = tools.filter((t) => t.name === 'runtime_ping')

    const events: TurnStepEvent[] = []
    const result = await runTurn(baseInput, {
      emit: (e) => events.push(e),
      getReactGuide: (mode) => `【${mode}】`,
      tools: pingOnly,
      mode: 'act',
      startTurn: 0
    })

    expect(result.status).toBe('done')
    expect(result.turnId).toMatch(/^turn_[0-9a-f]{8}$/)
    expect(result.tokenUsed.prompt).toBe(180) // 100 + 80
    expect(result.tokenUsed.completion).toBe(80) // 50 + 30
    expect(result.stepsExecuted).toBe(3) // 2 次 LLM + 1 次 tool call
    expect(result.finalContent).toBe('pong 完成')
    // 8 步都触发了（部分会出现多次：callLLM 2 次、handleToolCalls 2 次、runTools 1 次等）
    const startSteps = events
      .filter((e) => e.type === 'step:start')
      .map((e) => (e.type === 'step:start' ? e.step : ''))
    expect(startSteps).toContain('incrementTurn')
    expect(startSteps).toContain('collectInput')
    expect(startSteps).toContain('buildContext')
    expect(startSteps).toContain('callLLM')
    expect(startSteps).toContain('handleToolCalls')
    expect(startSteps).toContain('runTools')
    expect(startSteps).toContain('appendHistory')
    expect(startSteps).toContain('decideNext')
    // turn:tool_call 至少触发 1 次
    const toolCalls = events.filter((e) => e.type === 'turn:tool_call')
    expect(toolCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('system-reminder 接入:buildReminder 被调且 block 拼到 systemPrompt', async () => {
    callCount = 0
    seenSystemPrompts.length = 0
    const events: TurnStepEvent[] = []
    const systemReminder = {
      buildReminder: vi.fn(
        () => '<system-reminder>\n<agent-context>test-agent</agent-context>\n</system-reminder>'
      )
    }
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-test'
    }).filter((t) => t.name === 'runtime_ping')

    await runTurn(baseInput, {
      emit: (e) => events.push(e),
      getReactGuide: (mode) => `【${mode}】`,
      tools,
      mode: 'act',
      startTurn: 0,
      systemReminder
    })

    // buildReminder 被调 1 次
    expect(systemReminder.buildReminder).toHaveBeenCalledTimes(1)
    // system prompt 包含 SR block(LLM mock 抓到了 system message)
    expect(seenSystemPrompts.length).toBeGreaterThan(0)
    const sysPrompt = seenSystemPrompts[0]
    expect(sysPrompt).toContain('test-agent')
    expect(sysPrompt).toContain('<system-reminder>')
  })

  it('Stage 2.4 compaction 集成:长 history 触发 light 档压缩', async () => {
    callCount = 0
    seenSystemPrompts.length = 0
    const events: TurnStepEvent[] = []
    // DEFAULT trimThresholdChars=8000,所以 tool content 要 > 8000 才被截
    // 4 条 10000 chars tool + 1 user = 4*4004 + 5 = 16021,trigger=1500
    // 压前 16021,压后 4*(2000 chars)+user = 4*804+5 = 3221,还是 > 1500,aggressive
    // → 让 trigger 更高:contextWindow 8000,trigger 4800
    // 压前 16021,压后 4*804+5 = 3221 < 4800 → light
    const longHistory: TurnInput['history'] = [
      { role: 'user', content: 'q' },
      { role: 'tool', content: 'x'.repeat(10_000), toolCallId: 't1' },
      { role: 'tool', content: 'y'.repeat(10_000), toolCallId: 't2' },
      { role: 'tool', content: 'z'.repeat(10_000), toolCallId: 't3' },
      { role: 'tool', content: 'w'.repeat(10_000), toolCallId: 't4' }
    ]
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-test'
    }).filter((t) => t.name === 'runtime_ping')

    const result = await runTurn(
      { ...baseInput, history: longHistory, compaction: { enabled: true, contextWindow: 8000 } },
      {
        emit: (e) => events.push(e),
        getReactGuide: (mode) => `【${mode}】`,
        tools,
        mode: 'act',
        startTurn: 0
      }
    )

    expect(result.status).toBe('done')
    const compactionEvents = events.filter((e) => e.type === 'compaction:applied')
    expect(compactionEvents.length).toBeGreaterThanOrEqual(1)
    const lastCompaction = compactionEvents[compactionEvents.length - 1] as
      | Extract<TurnStepEvent, { type: 'compaction:applied' }>
      | undefined
    expect(lastCompaction).toBeDefined()
    expect(lastCompaction!.level).toBe('light')
    expect(lastCompaction!.tokensAfter).toBeLessThan(lastCompaction!.tokensBefore)
  })

  it('Stage 2.4 compaction 关闭:enabled=false 不压缩', async () => {
    callCount = 0
    seenSystemPrompts.length = 0
    const events: TurnStepEvent[] = []
    const longHistory: TurnInput['history'] = [
      { role: 'user', content: 'q' },
      { role: 'tool', content: 'x'.repeat(5000), toolCallId: 't1' }
    ]
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-test'
    }).filter((t) => t.name === 'runtime_ping')

    await runTurn(
      { ...baseInput, history: longHistory, compaction: { enabled: false } },
      {
        emit: (e) => events.push(e),
        getReactGuide: (mode) => `【${mode}】`,
        tools,
        mode: 'act',
        startTurn: 0
      }
    )

    // compaction:applied 仍然会 emit,但 level=off + skipped
    const compactionEvents = events.filter((e) => e.type === 'compaction:applied')
    // enabled=false 时,我们的代码直接走 else 分支,根本不 emit
    // 这就对了:不开就不 emit
    expect(compactionEvents.length).toBe(0)
  })
})
