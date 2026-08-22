/**
 * 自研工具分发器 — 替代 LangChain ToolNode / DynamicStructuredTool。
 *
 * - `ShyTool`：纯对象工具（name / description / zod schema / run）
 * - `schemaToJson`：zod schema → JSON Schema（给 OpenAI tool format 用）
 * - `runToolCalls`：给出一组 LLM 的 tool_calls，逐个校验 + 执行 + 产出 tool 消息 + emit turn:tool_result
 *
 * 事件沿用 turn-runner 的 turn:tool_call / turn:tool_result，graph.ts → 前端的事件链路不变。
 */
import type { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/index'
import { zodShapeToJsonSchema } from '../llm-client'

/** 工具描述：定义 + 执行分离，不再依赖 LangChain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 异构工具集需要一个宽泛的默认输入类型
export type ShyTool<T = any> = {
  name: string
  description: string
  /** zod schema，用于参数校验 + 转 OpenAI tool format */
  schema: z.ZodType<T>
  /** 执行函数，按 zod 推断的参数类型取值 */
  run: (args: T) => Promise<string>
}

/** 来自 LLM 流式累积的 tool call（args 为 JSON 字符串） */
export type ToolCall = { id: string; name: string; args: string }

/** 工具分发结果：追加回 history 的 tool 消息 */
export type ToolDispatchResult = Array<{
  role: 'tool'
  tool_call_id: string
  content: string
}>

/** zod schema → JSON Schema（供 OpenAI tool format 的 parameters 使用） */
export function schemaToJson(schema: z.ZodType<unknown>): Record<string, unknown> {
  const s = schema as unknown as {
    type?: string
    properties?: Record<string, unknown>
    shape?: Record<string, unknown> | (() => Record<string, unknown>)
    _def?: { shape?: Record<string, unknown> }
  }
  // 已是 JSON schema
  if (s.type === 'object' && s.properties) return { type: 'object', properties: s.properties }
  // zod object
  if (typeof s.shape === 'function') {
    return zodShapeToJsonSchema(s.shape() as Record<string, unknown>)
  }
  if (s.shape && typeof s.shape === 'object') {
    return zodShapeToJsonSchema(s.shape as Record<string, unknown>)
  }
  if (s._def?.shape) return zodShapeToJsonSchema(s._def.shape)
  return { type: 'object', properties: {} }
}

/** ShyTool[] → OpenAI function tool 格式（给非流式/流式 chat 用） */
export function toOpenAITools(tools: ShyTool[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: schemaToJson(t.schema)
    }
  }))
}

/**
 * 执行一批 tool call：校验参数 → 执行 → 产出 tool 消息 + emit turn:tool_result。
 * turn:tool_call 由 turn-runner 的 handleToolCalls 提前 emit，这里只发结果。
 */
export async function runToolCalls(
  tools: ShyTool[],
  toolCalls: ToolCall[],
  turnId: string,
  emit: (e: {
    type: 'turn:tool_result'
    turnId: string
    id: string
    output?: unknown
    error?: string
  }) => void
): Promise<ToolDispatchResult> {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const out: ToolDispatchResult = []
  for (const tc of toolCalls) {
    const tool = byName.get(tc.name)
    if (!tool) {
      const msg = `Unknown tool: ${tc.name}`
      emit({ type: 'turn:tool_result', turnId, id: tc.id, error: msg })
      out.push({ role: 'tool', tool_call_id: tc.id, content: msg })
      continue
    }
    try {
      const obj = JSON.parse(tc.args) as Record<string, unknown>
      const parsed = tool.schema.parse(obj) as Record<string, unknown>
      const result = await tool.run(parsed)
      emit({ type: 'turn:tool_result', turnId, id: tc.id, output: result })
      out.push({ role: 'tool', tool_call_id: tc.id, content: result })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      emit({ type: 'turn:tool_result', turnId, id: tc.id, error: msg })
      out.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${msg}` })
    }
  }
  return out
}
