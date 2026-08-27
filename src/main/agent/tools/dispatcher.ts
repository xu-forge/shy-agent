/**
 * 自研工具分发器 — 替代 LangChain ToolNode / DynamicStructuredTool。
 *
 * - `ShyTool`：纯对象工具（name / description / zod schema / run）
 * - `schemaToJson`：zod schema → JSON Schema（给 OpenAI tool format 用）
 * - `runToolCalls`：给出一组 LLM 的 tool_calls，逐个校验 + 执行 + 产出 tool 消息 + emit turn:tool_result
 *
 * 事件沿用 turn-runner 的 turn:tool_call / turn:tool_result，graph.ts → 前端的事件链路不变。
 */
import { z } from 'zod'
import type { ChatCompletionTool } from 'openai/resources/index'
import { zodShapeToJsonSchema } from '../llm-client'

/** 工具描述：定义 + 执行分离，不再依赖 LangChain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 异构工具集需要一个宽泛的默认输入类型
export type ShyTool<T = any> = {
  name: string
  description: string
  /** zod schema，用于参数校验 + 转 OpenAI tool format */
  schema: z.ZodType<T>
  /** 若提供，优先作为 OpenAI function.parameters（MCP JSON Schema） */
  jsonSchema?: Record<string, unknown>
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
 * LLM 常把 number 写成 "5"、把 array 写成 JSON 字符串或 {item:[...]}。
 * 按 zod 报错路径做有限次强制转换，避免 MiniMax 一类模型反复 schema 失败。
 */
export function parseToolArgs(schema: z.ZodType<unknown>, obj: Record<string, unknown>): unknown {
  let current: Record<string, unknown> = obj
  let lastError: z.ZodError | undefined
  for (let i = 0; i < 4; i++) {
    const parsed = schema.safeParse(current)
    if (parsed.success) return parsed.data
    lastError = parsed.error
    const { next, changed } = coerceLlmArgs(current, parsed.error.issues)
    if (!changed) break
    current = next
  }
  throw lastError ?? new Error('tool args invalid')
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

function tryParseJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const start = trimmed[0]
  if (start !== '{' && start !== '[') return undefined
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return undefined
  }
}

/** MiniMax 等会把数组编成 { item: T | T[] } / { items: T[] } */
export function unwrapItemWrapper(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const rec = raw as Record<string, unknown>
  if ('item' in rec) {
    const item = rec.item
    return Array.isArray(item) ? item : item === undefined ? [] : [item]
  }
  if ('items' in rec && Array.isArray(rec.items)) return rec.items
  return raw
}

function coerceLlmArgs(
  obj: Record<string, unknown>,
  issues: z.ZodIssue[]
): { next: Record<string, unknown>; changed: boolean } {
  const next = JSON.parse(JSON.stringify(obj)) as Record<string, unknown>
  let changed = false
  for (const issue of issues) {
    if (issue.code !== 'invalid_type') continue
    const expected = (issue as { expected?: unknown }).expected
    if (issue.path.length === 0) continue
    const raw = getAt(next, issue.path)

    if (expected === 'number' && typeof raw === 'string') {
      const n = Number(raw.trim())
      if (!Number.isFinite(n)) continue
      setAt(next, issue.path, n)
      changed = true
      continue
    }

    if (expected === 'array') {
      if (typeof raw === 'string') {
        const parsed = tryParseJson(raw)
        const unwrapped = unwrapItemWrapper(parsed ?? raw)
        if (Array.isArray(unwrapped)) {
          setAt(next, issue.path, unwrapped)
          changed = true
        } else if (raw.trim()) {
          setAt(next, issue.path, [raw])
          changed = true
        }
      } else if (raw && typeof raw === 'object') {
        const unwrapped = unwrapItemWrapper(raw)
        if (Array.isArray(unwrapped)) {
          setAt(next, issue.path, unwrapped)
          changed = true
        }
      }
      continue
    }

    if (expected === 'object' && typeof raw === 'string') {
      const parsed = tryParseJson(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setAt(next, issue.path, parsed)
        changed = true
      }
    }
  }
  return { next, changed }
}

function htmlWritePaths(toolName: string, result: string): string[] {
  if (toolName !== 'fs_write') return []
  try {
    const parsed = JSON.parse(result) as { ok?: boolean; path?: unknown }
    if (!parsed?.ok || typeof parsed.path !== 'string') return []
    return /\.html?$/i.test(parsed.path) ? [parsed.path] : []
  } catch {
    return []
  }
}

export type ToolDispatchEmit = (
  e:
    | { type: 'turn:tool_result'; turnId: string; id: string; output?: unknown; error?: string }
    | { type: 'turn:tool_call'; turnId: string; id: string; name: string; input: unknown }
) => void

/** ShyTool[] → OpenAI function tool 格式（给非流式/流式 chat 用） */
export function toOpenAITools(tools: ShyTool[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.jsonSchema ?? schemaToJson(t.schema)
    }
  }))
}

/**
 * 执行一批 tool call：校验参数 → 执行 → 产出 tool 消息 + emit turn:tool_result。
 * 写完 html 会自动 present 到 UI，但不写入 LLM history（否则 tool id 对不上，API 400）。
 */
export async function runToolCalls(
  tools: ShyTool[],
  toolCalls: ToolCall[],
  turnId: string,
  emit: ToolDispatchEmit
): Promise<ToolDispatchResult> {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const out: ToolDispatchResult = []
  let askUserRan = false
  const presentedHtml = new Set<string>()
  let wroteHtml: string[] = []

  for (const tc of toolCalls) {
    const tool = byName.get(tc.name)
    if (!tool) {
      const msg = `Unknown tool: ${tc.name}`
      emit({ type: 'turn:tool_result', turnId, id: tc.id, error: msg })
      out.push({ role: 'tool', tool_call_id: tc.id, content: msg })
      continue
    }
    if (tc.name === 'ask_user' && askUserRan) {
      const skipped = JSON.stringify({
        ok: false,
        skipped: true,
        error: '本轮已有 ask_user，请根据用户回答再提问，不要并行多个'
      })
      emit({ type: 'turn:tool_result', turnId, id: tc.id, output: skipped })
      out.push({ role: 'tool', tool_call_id: tc.id, content: skipped })
      continue
    }
    try {
      const obj = JSON.parse(tc.args) as Record<string, unknown>
      const parsed = parseToolArgs(tool.schema, obj) as Record<string, unknown>
      const result = await tool.run(parsed)
      emit({ type: 'turn:tool_result', turnId, id: tc.id, output: result })
      out.push({ role: 'tool', tool_call_id: tc.id, content: result })
      if (tc.name === 'ask_user') askUserRan = true
      if (tc.name === 'present_artifact') {
        try {
          const p = JSON.parse(result) as { paths?: unknown }
          if (Array.isArray(p.paths)) {
            for (const path of p.paths) if (typeof path === 'string') presentedHtml.add(path)
          }
        } catch {
          /* ignore */
        }
      }
      wroteHtml = [...wroteHtml, ...htmlWritePaths(tc.name, result)]
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      emit({ type: 'turn:tool_result', turnId, id: tc.id, error: msg })
      out.push({ role: 'tool', tool_call_id: tc.id, content: `Error: ${msg}` })
    }
  }

  const present = byName.get('present_artifact')
  const pendingHtml = wroteHtml.filter((p) => !presentedHtml.has(p))
  if (present && pendingHtml.length > 0) {
    const id = `auto_present_${turnId}`
    const input = { paths: pendingHtml }
    emit({ type: 'turn:tool_call', turnId, id, name: 'present_artifact', input })
    try {
      const parsed = parseToolArgs(present.schema, input) as Record<string, unknown>
      const result = await present.run(parsed)
      emit({ type: 'turn:tool_result', turnId, id, output: result })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      emit({ type: 'turn:tool_result', turnId, id, error: msg })
    }
  }

  return out
}
