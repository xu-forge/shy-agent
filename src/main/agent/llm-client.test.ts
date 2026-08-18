import { describe, expect, it } from 'vitest'
import { accumulateToolCalls, langchainToolsToOpenAITools } from './llm-client'

describe('accumulateToolCalls', () => {
  it('空 chunks 返回空数组', () => {
    expect(accumulateToolCalls([])).toEqual([])
  })

  it('单个 chunk 含完整 tool_call', () => {
    const result = accumulateToolCalls([
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: 'abc', type: 'function', function: { name: 'shell', arguments: '{"cmd":"ls"}' } }
      ]}}]}
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('abc')
    expect(result[0].function.name).toBe('shell')
    expect(result[0].function.arguments).toBe('{"cmd":"ls"}')
  })

  it('跨多 chunk 累积 arguments（关键：之前 LangChain AIMessageChunk 没 concat 的 bug）', () => {
    const result = accumulateToolCalls([
      { choices: [{ delta: { tool_calls: [
        { index: 0, id: 'abc', type: 'function', function: { name: 'shell', arguments: '{"cmd' } }
      ]}}]},
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { arguments: '":"ls' } }
      ]}}]},
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { arguments: '-la"}' } }
      ]}}]}
    ])
    expect(result).toHaveLength(1)
    expect(result[0].function.arguments).toBe('{"cmd":"ls-la"}')
  })

  it('多个 tool_calls 按 index 并行累积', () => {
    // 第一 chunk 提供 id + name + arguments 起始
    const chunk1 = {
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, id: 'a', function: { name: 'shell', arguments: 'start_a' } },
            { index: 1, id: 'b', function: { name: 'read', arguments: 'start_b' } }
          ]
        }
      }]
    }
    // 第二 chunk 只追加 arguments
    const chunk2 = {
      choices: [{
        delta: {
          tool_calls: [
            { index: 0, function: { arguments: '_end_a' } },
            { index: 1, function: { arguments: '_end_b' } }
          ]
        }
      }]
    }
    const result = accumulateToolCalls([chunk1, chunk2])
    expect(result).toHaveLength(2)
    expect(result[0].function.name).toBe('shell')
    expect(result[0].function.arguments).toBe('start_a_end_a')
    expect(result[1].function.name).toBe('read')
    expect(result[1].function.arguments).toBe('start_b_end_b')
  })

  it('缺 id / name 的 chunk 被过滤', () => {
    const result = accumulateToolCalls([
      { choices: [{ delta: { tool_calls: [
        { index: 0, function: { name: 'shell', arguments: '{}' } }  // 缺 id
      ]}}]},
      { choices: [{ delta: { tool_calls: [
        { index: 1, id: 'a', function: { arguments: '{}' } }  // 缺 name
      ]}}]}
    ])
    expect(result).toEqual([])
  })
})

describe('langchainToolsToOpenAITools', () => {
  it('空数组返回空数组', () => {
    expect(langchainToolsToOpenAITools([])).toEqual([])
  })

  it('简单 string schema', () => {
    const tools = langchainToolsToOpenAITools([{
      name: 'shell',
      description: '执行命令',
      schema: { type: 'object', properties: { cmd: { type: 'string' } } }
    }])
    expect(tools[0].type).toBe('function')
    expect(tools[0].function.name).toBe('shell')
    expect(tools[0].function.parameters.type).toBe('object')
  })

  it('zod shape（v4: type=string/number）', () => {
    const tools = langchainToolsToOpenAITools([{
      name: 'browser_fetch',
      description: '抓网页',
      schema: {
        shape: {
          url: { type: 'string', description: 'URL' },
          waitMs: { type: 'number', description: '等待时间' }
        }
      }
    }])
    const props = (tools[0].function.parameters as { properties: any }).properties
    expect(props.url.type).toBe('string')
    expect(props.waitMs.type).toBe('number')
  })

  it('zod enum 字段', () => {
    const tools = langchainToolsToOpenAITools([{
      name: 'foo',
      description: 'test',
      schema: {
        // zod v4 ZodEnum: { def: { type: 'enum', entries: {...} } }
        shape: {
          mode: { type: 'enum', entries: { a: 'a', b: 'b', c: 'c' }, description: '模式' }
        }
      }
    }])
    const props = (tools[0].function.parameters as { properties: any }).properties
    expect(props.mode.type).toBe('string')
    expect(props.mode.enum).toEqual(['a', 'b', 'c'])
  })

  it('zod object 嵌套', () => {
    const tools = langchainToolsToOpenAITools([{
      name: 'nested',
      description: 'test',
      schema: {
        // 模拟 zod v4 ZodObject: { def: { type: 'object', shape: {...} } }
        shape: {
          config: { type: 'object', shape: {
            timeout: { type: 'number', description: '超时' }
          } }
        }
      }
    }])
    const props = (tools[0].function.parameters as { properties: any }).properties
    expect(props.config.type).toBe('object')
    expect(props.config.properties.timeout.type).toBe('number')
  })
})
