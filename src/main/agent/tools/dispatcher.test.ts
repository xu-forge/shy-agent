import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { schemaToJson, toOpenAITools, runToolCalls, type ShyTool } from './dispatcher'

const pingTool: ShyTool<{ note?: string; count?: number }> = {
  name: 'ping',
  description: '健康检查',
  schema: z.object({ note: z.string().optional(), count: z.number().optional() }),
  run: async (args) => JSON.stringify({ ok: true, note: args.note ?? '', count: args.count ?? 0 })
}

const addTool: ShyTool<{ a: number; b: number }> = {
  name: 'add',
  description: '加法',
  schema: z.object({ a: z.number(), b: z.number() }),
  run: async ({ a, b }) => String(a + b)
}

describe('schemaToJson', () => {
  it('zod object → JSON schema（string/number 字段）', () => {
    const json = schemaToJson(addTool.schema)
    expect(json.type).toBe('object')
    const props = (json.properties ?? {}) as Record<string, { type: string }>
    expect(props.a.type).toBe('number')
    expect(props.b.type).toBe('number')
  })

  it('嵌套 object 字段递归转换', () => {
    const schema = z.object({
      config: z.object({ timeout: z.number() })
    })
    const json = schemaToJson(schema) as {
      properties: { config: { type: string; properties: Record<string, { type: string }> } }
    }
    expect(json.properties.config.type).toBe('object')
    expect(json.properties.config.properties.timeout.type).toBe('number')
  })
})

describe('toOpenAITools', () => {
  it('包成 OpenAI function tool 格式', () => {
    const tools = toOpenAITools([pingTool])
    expect(tools[0].type).toBe('function')
    const fn = (
      tools[0] as unknown as {
        function: { name: string; description: string; parameters: { type: string } }
      }
    ).function
    expect(fn.name).toBe('ping')
    expect(fn.description).toBe('健康检查')
    expect(fn.parameters.type).toBe('object')
  })
})

describe('runToolCalls', () => {
  it('成功执行：解析 args → 跑 run → 返回 tool 消息 + emit 结果', async () => {
    const emit = vi.fn()
    const out = await runToolCalls(
      [pingTool],
      [{ id: 't1', name: 'ping', args: '{"note":"hi"}' }],
      'turn_1',
      emit
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ role: 'tool', tool_call_id: 't1' })
    expect(out[0].content).toBe(JSON.stringify({ ok: true, note: 'hi', count: 0 }))
    expect(emit).toHaveBeenCalledWith({
      type: 'turn:tool_result',
      turnId: 'turn_1',
      id: 't1',
      output: JSON.stringify({ ok: true, note: 'hi', count: 0 })
    })
  })

  it('校验失败（zod 类型不符）→ error 工具消息 + emit error', async () => {
    const emit = vi.fn()
    const out = await runToolCalls(
      [addTool],
      [{ id: 't2', name: 'add', args: '{"a":"not-number","b":1}' }],
      'turn_2',
      emit
    )
    expect(out[0].role).toBe('tool')
    expect(out[0].content).toMatch(/Error:/)
    const emitted = emit.mock.calls[0][0] as { type: string; error?: string }
    expect(emitted.type).toBe('turn:tool_result')
    expect(emitted.error).toMatch(/Error|expected/i)
  })

  it('未知工具 → "Unknown tool" 错误', async () => {
    const emit = vi.fn()
    const out = await runToolCalls([], [{ id: 't3', name: 'nope', args: '{}' }], 'turn_3', emit)
    expect(out[0].content).toBe('Unknown tool: nope')
  })

  it('JSON.parse 失败 → error 工具消息（不抛异常）', async () => {
    const emit = vi.fn()
    const out = await runToolCalls(
      [pingTool],
      [{ id: 't4', name: 'ping', args: '{not json' }],
      'turn_4',
      emit
    )
    expect(out[0].role).toBe('tool')
    expect(out[0].content).toMatch(/Error:/)
  })

  it('多个 tool call 依序执行', async () => {
    const emit = vi.fn()
    const out = await runToolCalls(
      [pingTool, addTool],
      [
        { id: 'a', name: 'add', args: '{"a":2,"b":3}' },
        { id: 'b', name: 'ping', args: '{}' }
      ],
      'turn_5',
      emit
    )
    expect(out.map((o) => o.content)).toEqual([
      String(2 + 3),
      JSON.stringify({ ok: true, note: '', count: 0 })
    ])
  })
})
