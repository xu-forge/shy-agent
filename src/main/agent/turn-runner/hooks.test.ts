import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runTurn } from './index'
import type { TurnInput, TurnHooks, TurnStepEvent } from './types'
import { buildTools } from '../tools/registry'

let callCount = 0
vi.mock('../llm-client', () => ({
  streamChatCompletion: async function* () {
    callCount += 1
    if (callCount === 1) {
      yield { type: 'content', delta: '调用工具' }
      yield {
        type: 'tool_calls',
        toolCalls: [
          { id: 'tc-1', type: 'function', function: { name: 'runtime_ping', arguments: '{}' } }
        ]
      }
      yield { type: 'usage', promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      yield { type: 'done' }
    } else {
      yield { type: 'content', delta: '完成' }
      yield { type: 'usage', promptTokens: 8, completionTokens: 4, totalTokens: 12 }
      yield { type: 'done' }
    }
  }
}))

const baseInput: TurnInput = {
  sessionId: 'ses-hooks',
  history: [{ role: 'user', content: '跑一下' }],
  tools: [{ name: 'runtime_ping', description: 'x', parameters: { type: 'object', properties: {} } }],
  llm: { baseURL: 'http://t', apiKey: 'k', model: 'm' },
  compaction: { enabled: false }
}

function deps(hooks: TurnHooks, events: TurnStepEvent[] = []) {
  const tools = buildTools({
    emit: () => undefined,
    confirmHighRisk: async () => true,
    workspaceDir: '/tmp/shy-test-workspace',
    sessionId: 'ses-hooks'
  }).filter((t) => t.name === 'runtime_ping')
  return {
    emit: (e: TurnStepEvent) => events.push(e),
    getReactGuide: () => 'guide',
    tools,
    mode: 'act' as const,
    startTurn: 0,
    hooks
  }
}

describe('turn hooks（minimax-feature-port）', () => {
  beforeEach(() => {
    callCount = 0
  })

  it('触发顺序：beforeLlmCall → afterLlmCall → beforeToolCall → afterToolCall → onHistoryChanged → onStepEnd', async () => {
    const order: string[] = []
    await runTurn(baseInput, {
      ...deps({
        beforeLlmCall: [async () => ((order.push('beforeLlmCall'), 'continue'))],
        afterLlmCall: [async () => ((order.push('afterLlmCall'), 'continue'))],
        beforeToolCall: [async () => (order.push('beforeToolCall'), undefined)],
        afterToolCall: [async () => (order.push('afterToolCall'), undefined)],
        onHistoryChanged: [async () => (order.push('onHistoryChanged'), undefined)],
        onStepEnd: [async () => (order.push('onStepEnd'), undefined)]
      })
    })
    expect(order).toEqual([
      'beforeLlmCall',
      'afterLlmCall',
      'beforeToolCall',
      'afterToolCall',
      'onHistoryChanged',
      'onStepEnd',
      'beforeLlmCall',
      'afterLlmCall' // 第二轮 LLM（无工具 → done）
    ])
  })

  it('beforeToolCall skip：工具不执行，结果含 skipped 原因', async () => {
    const events: TurnStepEvent[] = []
    const result = await runTurn(baseInput, {
      ...deps(
        { beforeToolCall: [async () => ({ type: 'skip' as const, reason: '测试跳过' })] },
        events
      )
    })
    expect(result.status).toBe('done')
    const toolResult = events.find((e) => e.type === 'turn:tool_result') as
      | { output?: unknown }
      | undefined
    expect(String(toolResult?.output)).toContain('测试跳过')
  })

  it('beforeLlmCall replaceMessages：替换后的消息生效', async () => {
    const seen: unknown[] = []
    await runTurn(baseInput, {
      ...deps({
        beforeLlmCall: [
          async ({ phase, messages }) => {
            seen.push({ phase, count: messages.length })
            if (phase === 'initial') {
              return {
                type: 'replaceMessages' as const,
                messages: [{ role: 'user' as const, content: '替换后的消息' }],
                reason: 'test'
              }
            }
            return 'continue'
          }
        ]
      })
    })
    expect(seen[1]).toMatchObject({ count: 3 }) // 替换 1 条 + assistant + tool
  })

  it('beforeLlmCall skip：直接以 reason 终结', async () => {
    const result = await runTurn(baseInput, {
      ...deps({
        beforeLlmCall: [async () => ({ type: 'skip' as const, reason: '跳过本轮' })]
      })
    })
    expect(result.status).toBe('done')
    expect(result.finalContent).toBe('跳过本轮')
  })

  it('afterLlmCall fail：整轮 errored', async () => {
    const result = await runTurn(baseInput, {
      ...deps({
        afterLlmCall: [async () => ({ type: 'fail' as const, reason: '响应不合格' })]
      })
    })
    expect(result.status).toBe('errored')
    expect(result.error).toContain('响应不合格')
  })
})
