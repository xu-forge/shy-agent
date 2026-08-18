/**
 * llm-client — 原生 OpenAI SDK 的轻量包装。
 *
 * 设计目标：
 * - 替换 LangChain ChatOpenAI + AIMessageChunk 的 stream 黑盒
 * - 提供直观的 chunk 累积（content + tool_calls + usage）
 * - 保留 LangChain ToolNode / StateGraph / AIMessage（用于 tools 节点和图状态）
 *
 * 流式 chunk 类型（OpenAI 标准）：
 * - chunk.choices[0].delta.content: string | null（content 增量）
 * - chunk.choices[0].delta.tool_calls?: Array<{ index, id?, type?, function?: { name?, arguments? } }>
 *   - tool_calls 按 index 分组，多个 chunk 累积成完整 tool_call
 *   - 第一个 chunk 提供 id + type + function.name；后续 chunk 提供 arguments 增量
 * - chunk.usage?（仅末 chunk 含 usage，prompt_tokens / completion_tokens）
 */
import OpenAI from 'openai'
import type {
  ChatCompletionChunk,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from 'openai/resources/index'

export type LLMMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string; tool_calls?: ChatCompletionMessageToolCall[]; tool_call_id?: string }
  | { role: 'tool'; content: string; tool_call_id: string }

export type LLMClientConfig = {
  baseURL: string
  apiKey: string
  model: string
}

export type LLMStreamEvent =
  | { type: 'content'; delta: string }
  | { type: 'tool_calls'; toolCalls: ChatCompletionMessageToolCall[] }
  | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number }
  | { type: 'done' }

/**
 * 调用 LLM stream — 返回 AsyncIterable<LLMStreamEvent>，累积 tool_calls 后一次性 emit。
 */
export async function* streamChatCompletion(
  config: LLMClientConfig,
  messages: LLMMessage[],
  tools: ChatCompletionTool[],
  options?: { signal?: AbortSignal }
): AsyncGenerator<LLMStreamEvent> {
  const openai = new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey
  })

  const stream = await openai.chat.completions.create(
    {
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.2,
      stream: true,
      stream_options: { include_usage: true }
    },
    { signal: options?.signal }
  )

  /** tool_calls 累积（按 index 分组） */
  type AccumulatedToolCall = { id?: string; name?: string; arguments: string }
  const toolCallsAcc: AccumulatedToolCall[] = []
  let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | null = null

  for await (const chunk of stream as AsyncIterable<ChatCompletionChunk>) {
    const delta = chunk.choices?.[0]?.delta
    // 1. content 增量
    if (delta?.content) {
      yield { type: 'content', delta: delta.content }
    }
    // 2. tool_calls 增量累积
    if (delta?.tool_calls && delta.tool_calls.length > 0) {
      for (const tc of delta.tool_calls) {
        const i = tc.index
        if (!toolCallsAcc[i]) {
          toolCallsAcc[i] = { arguments: '' }
        }
        if (tc.id) toolCallsAcc[i].id = tc.id
        if (tc.function?.name) toolCallsAcc[i].name = tc.function.name
        if (tc.function?.arguments !== undefined) {
          toolCallsAcc[i].arguments += tc.function.arguments
        }
      }
    }
    // 3. usage（仅末 chunk 含）
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        totalTokens: chunk.usage.total_tokens
      }
    }
  }

  // 4. 一次性 emit 完整 tool_calls
  const validToolCalls: ChatCompletionMessageToolCall[] = toolCallsAcc
    .filter((tc) => Boolean(tc.id) && Boolean(tc.name))
    .map((tc) => ({
      id: tc.id!,
      type: 'function' as const,
      function: { name: tc.name!, arguments: tc.arguments }
    }))
  if (validToolCalls.length > 0) {
    yield { type: 'tool_calls', toolCalls: validToolCalls }
  }

  if (usage) {
    yield { type: 'usage', ...usage }
  }
  yield { type: 'done' }
}

/**
 * 把 LangChain DynamicStructuredTool 转成 OpenAI tool format (ChatCompletionTool)。
 * 保留 LangChain ToolNode（工具 schema 定义 + 执行），只是换成 OpenAI 原生 tool 格式。
 */
type LangChainToolLike = {
  name: string
  description?: string
  schema?: unknown
}
export function langchainToolsToOpenAITools(tools: LangChainToolLike[]): ChatCompletionTool[] {
  return tools.map((t) => {
    // 优先从 schema 拿 zod → JSON Schema；fallback 到空对象
    let parameters: Record<string, unknown> = { type: 'object', properties: {} }
    if (t.schema) {
      const s = t.schema as Record<string, unknown>
      // t.schema 可能是 zod schema 或已经转换的 JSON Schema
      if (s.type === 'object' && s.properties) {
        parameters = s
      } else if (s.shape && typeof s.shape === 'object') {
        // zod raw schema: { shape: {...} }
        parameters = zodShapeToJsonSchema(s.shape as Record<string, unknown>)
      } else if (s.shape && typeof s.shape === 'function') {
        // zod raw schema: { shape: {...}, typeName: 'ZodObject' }
        parameters = zodShapeToJsonSchema(s.shape as Record<string, unknown>)
      }
    }
    return {
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters
      }
    }
  })
}

/** 把 zod shape 转 JSON Schema（zod v4 优先：字段有 type getter；fallback 到 v3 _def.typeName） */
function zodShapeToJsonSchema(shape: Record<string, unknown>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(shape)) {
    const field = value as { type?: string; description?: string; _def?: unknown }
    const desc = field.description ?? ''
    // zod v4: 字段本身有 type getter
    const t = field.type ?? ''
    if (t === 'string') {
      properties[key] = { type: 'string', description: desc }
    } else if (t === 'number') {
      properties[key] = { type: 'number', description: desc }
    } else if (t === 'boolean') {
      properties[key] = { type: 'boolean', description: desc }
    } else if (t === 'enum') {
      const entries = (field as { entries?: Record<string, string> }).entries ?? (field._def as { entries?: Record<string, string> } | undefined)?.entries ?? {}
      properties[key] = { type: 'string', enum: Object.values(entries), description: desc }
    } else if (t === 'array') {
      properties[key] = { type: 'array', description: desc }
    } else if (t === 'object') {
      const innerShape = (field as { shape?: Record<string, unknown> }).shape ?? (field._def as { shape?: Record<string, unknown> } | undefined)?.shape ?? {}
      const nested = zodShapeToJsonSchema(innerShape)
      properties[key] = { type: 'object', properties: nested.properties, description: desc }
    } else {
      // 兜底
      properties[key] = { type: 'string', description: desc }
    }
  }
  return { type: 'object', properties }
}


/**
 * 非流式 invoke — 用于 plan / verify 等只需返回 JSON 的场景。
 */
export async function invokeChatCompletion(
  config: LLMClientConfig,
  messages: LLMMessage[],
  options?: { signal?: AbortSignal; temperature?: number }
): Promise<{ content: string; toolCalls: ChatCompletionMessageToolCall[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const openai = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey })
  const res = await openai.chat.completions.create(
    {
      model: config.model,
      messages,
      temperature: options?.temperature ?? 0.2
    },
    { signal: options?.signal }
  )
  const msg = res.choices[0]?.message
  const content = msg?.content ?? ''
  const toolCalls = (msg?.tool_calls ?? []) as ChatCompletionMessageToolCall[]
  return {
    content,
    toolCalls,
    usage: {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0
    }
  }
}


/**
 * 纯函数：从 OpenAI stream chunks 累积出完整 tool_calls 列表（按 index 分组）。
 * 单测可独立测这个函数，不依赖 OpenAI SDK。
 */
type RawChunk = {
  choices?: Array<{
    delta?: {
      tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>
    }
  }>
}
export function accumulateToolCalls(chunks: RawChunk[]): ChatCompletionMessageToolCall[] {
  type Acc = { id?: string; name?: string; arguments: string }
  const acc: Acc[] = []
  for (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta
    if (!delta?.tool_calls) continue
    for (const tc of delta.tool_calls) {
      if (!acc[tc.index]) acc[tc.index] = { arguments: '' }
      if (tc.id) acc[tc.index].id = tc.id
      if (tc.function?.name) acc[tc.index].name = tc.function.name
      if (tc.function?.arguments !== undefined) acc[tc.index].arguments += tc.function.arguments
    }
  }
  return acc
    .filter((tc): tc is { id: string; name: string; arguments: string } => Boolean(tc.id) && Boolean(tc.name))
    .map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: { name: tc.name, arguments: tc.arguments }
    }))
}
