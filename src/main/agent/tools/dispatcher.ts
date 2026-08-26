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

/**
 * LLM 常把 number 参数写成字符串（"5"）。只对 zod 判定为 number 的路径做强制转换，
 * 避免把本该是 string 的纯数字路径（如 "1"）误转成 number。
 */
export function parseToolArgs(schema: z.ZodType<unknown>, obj: Record<string, unknown>): unknown {
  const first = schema.safeParse(obj)
  if (first.success) return first.data
  const { next, changed } = coerceNumberStrings(obj, first.error.issues)
  if (!changed) throw first.error
  return schema.parse(next)
}

function getAt(obj: unknown, path: readonly PropertyKey[]): unknown {
  let cur = obj
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<PropertyKey, unknown>)[k]
  }
  return cur
}

function setAt(obj: unknown, path: readonly PropertyKey[], value: unknown): void {
  let cur = obj
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null || typeof cur !== 'object') return
    cur = (cur as Record<PropertyKey, unknown>)[path[i]!]
  }
  const last = path[path.length - 1]
  if (cur != null && typeof cur === 'object' && last !== undefined) {
    ;(cur as Record<PropertyKey, unknown>)[last] = value
  }
}

function coerceNumberStrings(
  obj: Record<string, unknown>,
  issues: z.ZodIssue[]
): { next: Record<string, unknown>; changed: boolean } {
  const next = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let changed = false
  for (const issue of issues) {
    if (issue.code !== 'invalid_type') continue
    const expected = (issue as { expected?: unknown }).expected
    if (expected !== 'number' || issue.path.length === 0) continue
    const raw = getAt(next, issue.path)
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const n = Number(trimmed)
    if (!Number.isFinite(n)) continue
    setAt(next, issue.path, n)
    changed = true
  }
  return { next, changed }
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
      const parsed = parseToolArgs(tool.schema, obj) as Record<string, unknown>
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
