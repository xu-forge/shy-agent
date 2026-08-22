import { describe, expect, it } from 'vitest'
import type { ChatCompletionMessageToolCall } from 'openai/resources/index'
import { accumulateToolCalls } from './llm-client'

// OpenAI SDK 7.x 把 ChatCompletionMessageToolCall 改成 union，需要 narrow 到 function 分支。
type FunctionCallShape = { name: string; arguments?: string; parameters?: unknown }
type FunctionToolCall = ChatCompletionMessageToolCall & { function: FunctionCallShape }
const asFunction = (t: ChatCompletionMessageToolCall): FunctionToolCall =>
  t as unknown as FunctionToolCall

describe('accumulateToolCalls', () => {
  it('空 chunks 返回空数组', () => {
    expect(accumulateToolCalls([])).toEqual([])
  })

  it('单个 chunk 含完整 tool_call', () => {
    const result = accumulateToolCalls([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'abc',
                  type: 'function',
                  function: { name: 'shell', arguments: '{"cmd":"ls"}' }
                }
              ]
            }
          }
        ]
      }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('abc')
    expect(asFunction(result[0]).function.name).toBe('shell')
    expect(asFunction(result[0]).function.arguments).toBe('{"cmd":"ls"}')
  })

  it('跨多 chunk 累积 arguments（关键：之前 LangChain AIMessageChunk 没 concat 的 bug）', () => {
    const result = accumulateToolCalls([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'abc',
                  type: 'function',
                  function: { name: 'shell', arguments: '{"cmd' }
                }
              ]
            }
          }
        ]
      },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '":"ls' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '-la"}' } }] } }] }
    ])
    expect(result).toHaveLength(1)
    expect(asFunction(result[0]).function.arguments).toBe('{"cmd":"ls-la"}')
  })

  it('多个 tool_calls 按 index 并行累积', () => {
    // 第一 chunk 提供 id + name + arguments 起始
    const chunk1 = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: 'a', function: { name: 'shell', arguments: 'start_a' } },
              { index: 1, id: 'b', function: { name: 'read', arguments: 'start_b' } }
            ]
          }
        }
      ]
    }
    // 第二 chunk 只追加 arguments
    const chunk2 = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, function: { arguments: '_end_a' } },
              { index: 1, function: { arguments: '_end_b' } }
            ]
          }
        }
      ]
    }
    const result = accumulateToolCalls([chunk1, chunk2])
    expect(result).toHaveLength(2)
    expect(asFunction(result[0]).function.name).toBe('shell')
    expect(asFunction(result[0]).function.arguments).toBe('start_a_end_a')
    expect(asFunction(result[1]).function.name).toBe('read')
    expect(asFunction(result[1]).function.arguments).toBe('start_b_end_b')
  })

  it('缺 id / name 的 chunk 被过滤', () => {
    const result = accumulateToolCalls([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, function: { name: 'shell', arguments: '{}' } } // 缺 id
              ]
            }
          }
        ]
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 1, id: 'a', function: { arguments: '{}' } } // 缺 name
              ]
            }
          }
        ]
      }
    ])
    expect(result).toEqual([])
  })
})
