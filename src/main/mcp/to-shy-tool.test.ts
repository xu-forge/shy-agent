import { describe, expect, it, vi } from 'vitest'
import { mcpToolsToShy } from './to-shy-tool'
import { toOpenAITools } from '../agent/tools/dispatcher'

describe('mcpToolsToShy', () => {
  it('run 转发 callTool，名称用 exposedName', async () => {
    const call = vi.fn(async () => '{"ok":true}')
    const tools = mcpToolsToShy(
      [
        {
          exposedName: 'web_search',
          originalName: 'web_search',
          serverId: 'MiniMax',
          description: 'search the web',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query']
          }
        }
      ],
      call
    )
    expect(tools).toHaveLength(1)
    expect(tools[0]?.name).toBe('web_search')
    const out = await tools[0]!.run({ query: '广州周末' })
    expect(out).toBe('{"ok":true}')
    expect(call).toHaveBeenCalledWith('web_search', { query: '广州周末' })
  })

  it('有 inputSchema 时 OpenAI parameters 用该 schema', () => {
    const tools = mcpToolsToShy(
      [
        {
          exposedName: 'web_search',
          originalName: 'web_search',
          serverId: 'MiniMax',
          description: 's',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } }
          }
        }
      ],
      async () => ''
    )
    const oa = toOpenAITools(tools)
    const first = oa[0]
    expect(first && 'function' in first ? first.function.parameters : undefined).toMatchObject({
      type: 'object',
      properties: { query: { type: 'string' } }
    })
  })
})
