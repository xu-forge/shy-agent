import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { schemaToJson, toOpenAITools, runToolCalls, parseToolArgs, type ShyTool } from './dispatcher'

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

  it('数字参数写成字符串时强制转换后成功（LLM 常见）', async () => {
    const emit = vi.fn()
    const out = await runToolCalls(
      [addTool],
      [{ id: 't2s', name: 'add', args: '{"a":"2","b":"3"}' }],
      'turn_2s',
      emit
    )
    expect(out[0].content).toBe('5')
    expect(emit).toHaveBeenCalledWith({
      type: 'turn:tool_result',
      turnId: 'turn_2s',
      id: 't2s',
      output: '5'
    })
  })

  it('嵌套 number 字段的数字字符串也能强制转换', async () => {
    const nested: ShyTool<{ config: { timeout: number } }> = {
      name: 'nested',
      description: '嵌套',
      schema: z.object({ config: z.object({ timeout: z.number() }) }),
      run: async ({ config }) => String(config.timeout)
    }
    const emit = vi.fn()
    const out = await runToolCalls(
      [nested],
      [{ id: 'tn', name: 'nested', args: '{"config":{"timeout":"30"}}' }],
      'turn_n',
      emit
    )
    expect(out[0].content).toBe('30')
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

  it('array 参数写成 JSON 字符串时强制转换', async () => {
    const present: ShyTool<{ paths?: string[] }> = {
      name: 'present_artifact',
      description: '呈现',
      schema: z.object({ paths: z.array(z.string()).optional() }),
      run: async ({ paths }) => JSON.stringify({ paths: paths ?? [] })
    }
    const emit = vi.fn()
    const out = await runToolCalls(
      [present],
      [{ id: 'p1', name: 'present_artifact', args: JSON.stringify({ paths: '["a.html"]' }) }],
      'turn_p',
      emit
    )
    expect(JSON.parse(out[0].content)).toEqual({ paths: ['a.html'] })
  })

  it('单字符串 paths 包成数组', async () => {
    const present: ShyTool<{ paths?: string[] }> = {
      name: 'present_artifact',
      description: '呈现',
      schema: z.object({ paths: z.array(z.string()).optional() }),
      run: async ({ paths }) => JSON.stringify({ paths: paths ?? [] })
    }
    const emit = vi.fn()
    const out = await runToolCalls(
      [present],
      [{ id: 'p2', name: 'present_artifact', args: '{"paths":"攻略.html"}' }],
      'turn_p2',
      emit
    )
    expect(JSON.parse(out[0].content)).toEqual({ paths: ['攻略.html'] })
  })

  it('{item:[...]} 解成数组（ask_user options）', () => {
    const schema = z.object({
      options: z.array(z.union([z.string(), z.object({ label: z.string() })])).optional()
    })
    const parsed = parseToolArgs(schema, {
      options: { item: [{ label: '经典打卡' }, { label: '美食' }] }
    }) as { options: Array<{ label: string }> }
    expect(parsed.options.map((o) => o.label)).toEqual(['经典打卡', '美食'])
  })

  it('同轮第二个 ask_user 跳过', async () => {
    const ask: ShyTool<{ question: string }> = {
      name: 'ask_user',
      description: '问',
      schema: z.object({ question: z.string() }),
      run: async ({ question }) => JSON.stringify({ ok: true, question })
    }
    const emit = vi.fn()
    const out = await runToolCalls(
      [ask],
      [
        { id: 'a1', name: 'ask_user', args: '{"question":"风格？"}' },
        { id: 'a2', name: 'ask_user', args: '{"question":"预算？"}' }
      ],
      'turn_ask',
      emit
    )
    expect(JSON.parse(out[0].content).ok).toBe(true)
    expect(JSON.parse(out[1].content).skipped).toBe(true)
  })

  it('fs_write html 后自动 present_artifact', async () => {
    const write: ShyTool<{ path: string; content: string }> = {
      name: 'fs_write',
      description: '写',
      schema: z.object({ path: z.string(), content: z.string() }),
      run: async ({ path }) => JSON.stringify({ ok: true, path })
    }
    const present: ShyTool<{ paths?: string[] }> = {
      name: 'present_artifact',
      description: '呈现',
      schema: z.object({ paths: z.array(z.string()).optional() }),
      run: async ({ paths }) => JSON.stringify({ paths: paths ?? [], auto: true })
    }
    const emit = vi.fn()
    const out = await runToolCalls(
      [write, present],
      [{ id: 'w1', name: 'fs_write', args: '{"path":"/tmp/a.html","content":"<p>x</p>"}' }],
      'turn_html',
      emit
    )
    expect(out).toHaveLength(1)
    expect(JSON.parse(out[0].content)).toEqual({ ok: true, path: '/tmp/a.html' })
    const calls = emit.mock.calls.map(
      (c) => c[0] as { type: string; name?: string; output?: unknown }
    )
    expect(calls.some((e) => e.type === 'turn:tool_call' && e.name === 'present_artifact')).toBe(
      true
    )
    const presentResult = calls.find(
      (e) => e.type === 'turn:tool_result' && String(e.output ?? '').includes('auto')
    )
    expect(presentResult).toBeTruthy()
  })
})
