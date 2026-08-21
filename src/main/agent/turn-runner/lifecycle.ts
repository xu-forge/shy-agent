/**
 * 8 步生命周期纯函数（每步独立可测）。
 *
 * 设计原则：
 * - 每步一个独立函数，输入输出明确
 * - stepStartTimeMs 由 runTurn 跟踪
 * - throwable 错误由 runTurn 捕获并标记为 status=errored
 * - emit 回调用于 observability（step:start / step:end / turn:delta 等）
 *
 * 注意：callLLM / runTools 这两个 step 涉及 LLM 调用和工具执行，
 * 留给 runTurn 在 index.ts 里用 llm-client / tools/registry 串起来。
 * 本文件只放「纯逻辑 + 数据转换」步骤。
 */
import { randomUUID } from 'crypto'
import type { TurnStep, TurnStepEvent } from './types'

/** 1. incrementTurn — 单纯自增 turn counter */
export function incrementTurn(
  currentTurn: number,
  emit: (event: TurnStepEvent) => void,
  turnId: string
): { turn: number } {
  const next = currentTurn + 1
  emit({ type: 'step:start', step: 'incrementTurn', turnId, stepIndex: 0 })
  emit({ type: 'step:end', step: 'incrementTurn', turnId, stepIndex: 0, durationMs: 0, ok: true })
  return { turn: next }
}

/** 2. collectInput — 解析"本轮要做什么"
 *  输入：用户消息 / 自动续段信号 / resume 信号
 *  输出：本轮 prompt（拼成 user message）
 *
 * 纯函数：拼接 + 三元合并
 */
export function collectInput(
  input: { userMessage?: string; resumeHint?: string; autoSegmentContinue?: boolean },
  emit: (event: TurnStepEvent) => void,
  turnId: string
): { prompt: string; isResume: boolean } {
  const start = Date.now()
  emit({ type: 'step:start', step: 'collectInput', turnId, stepIndex: 1 })
  const isResume = Boolean(input.resumeHint)
  let prompt = input.userMessage ?? input.resumeHint ?? ''
  if (input.autoSegmentContinue) {
    prompt = `请从上次落盘点继续推进未完成目标，对照验收清单执行（勿重复已完成项）。`
  }
  emit({ type: 'step:end', step: 'collectInput', turnId, stepIndex: 1, durationMs: Date.now() - start, ok: true })
  return { prompt, isResume }
}

/** 3. buildContext — 拼装 system prompt + skill/memory block + history
 *
 *  纯函数拼接；不做截断/压缩（由 caller 决定 history 多长）
 */
export function buildContext(
  parts: { skillBlock?: string; memoryBlock?: string; reactGuide: string; goalBlock?: string },
  emit: (event: TurnStepEvent) => void,
  turnId: string
): { systemPrompt: string } {
  const start = Date.now()
  emit({ type: 'step:start', step: 'buildContext', turnId, stepIndex: 2 })
  const lines: string[] = []
  if (parts.goalBlock) lines.push(parts.goalBlock)
  lines.push(parts.reactGuide)
  if (parts.skillBlock) lines.push(`【匹配到的技能】\n${parts.skillBlock}`)
  if (parts.memoryBlock) lines.push(`【长期记忆摘录】\n${parts.memoryBlock}`)
  const systemPrompt = lines.join('\n\n')
  emit({ type: 'step:end', step: 'buildContext', turnId, stepIndex: 2, durationMs: Date.now() - start, ok: true })
  return { systemPrompt }
}

/** 5. handleToolCalls — 解析 LLM 响应里的 tool_calls
 *
 *  纯函数：input: AI 响应文本，output: 工具调用列表
 */
export function handleToolCalls(
  llmResponse: { toolCalls: ReadonlyArray<{ id: string; name: string; args: string }>; content: string },
  emit: (event: TurnStepEvent) => void,
  turnId: string
): { toolCalls: ReadonlyArray<{ id: string; name: string; args: string }>; content: string } {
  const start = Date.now()
  emit({ type: 'step:start', step: 'handleToolCalls', turnId, stepIndex: 3 })
  for (const tc of llmResponse.toolCalls) {
    let input: unknown = tc.args
    try {
      input = JSON.parse(tc.args)
    } catch {
      // 解析失败时保留原始字符串
      input = tc.args
    }
    emit({ type: 'turn:tool_call', turnId, id: tc.id, name: tc.name, input })
  }
  emit({ type: 'step:end', step: 'handleToolCalls', turnId, stepIndex: 3, durationMs: Date.now() - start, ok: true })
  return llmResponse
}

/** 6. runTools — 纯包装（实际工具执行由 runTurn 在 index.ts 串起来）
 *
 *  本文件只放 emit 框架逻辑。真正调用 LangChain ToolNode 在 index.ts。
 */
export function emitToolResult(
  toolResult: { id: string; output: string; error?: string },
  emit: (event: TurnStepEvent) => void,
  turnId: string
): void {
  emit({
    type: 'turn:tool_result',
    turnId,
    id: toolResult.id,
    output: toolResult.output,
    error: toolResult.error
  })
}

/** 7. appendHistory — 把本轮消息追加到 history
 *
 *  纯函数：返回新 history（不修改入参）
 */
export function appendHistory(
  history: ReadonlyArray<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
    toolCallId?: string
  }>,
  newMessages: ReadonlyArray<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
    toolCallId?: string
  }>,
  emit: (event: TurnStepEvent) => void,
  turnId: string
): {
  history: typeof history extends ReadonlyArray<infer T> ? T[] : never
} {
  const start = Date.now()
  emit({ type: 'step:start', step: 'appendHistory', turnId, stepIndex: 6 })
  // 把 readonly T[] 转成可写数组（创建新数组）
  const result = [...history, ...newMessages] as Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: { id: string; name: string; args: string }[]
    toolCallId?: string
  }>
  emit({ type: 'step:end', step: 'appendHistory', turnId, stepIndex: 6, durationMs: Date.now() - start, ok: true })
  // 类型断言：把可写数组转回 readonly 视角
  return { history: result as never }
}

/** 8. decideNext — 决定下一步
 *
 *  - 有 tool call → 回到 step 6 (runTools)
 *  - 无 tool call + 无续段 → status=done
 *  - 有 autoSegmentContinue → status=continue
 */
export function decideNext(
  args: {
    hasToolCalls: boolean
    autoSegmentContinue?: boolean
  },
  emit: (event: TurnStepEvent) => void,
  turnId: string
): { status: 'continue' | 'done'; nextStep?: TurnStep } {
  const start = Date.now()
  emit({ type: 'step:start', step: 'decideNext', turnId, stepIndex: 7 })
  let result: { status: 'continue' | 'done'; nextStep?: TurnStep }
  if (args.hasToolCalls) {
    result = { status: 'continue', nextStep: 'runTools' }
  } else if (args.autoSegmentContinue) {
    result = { status: 'continue', nextStep: 'callLLM' }
  } else {
    result = { status: 'done' }
  }
  emit({ type: 'step:end', step: 'decideNext', turnId, stepIndex: 7, durationMs: Date.now() - start, ok: true })
  return result
}

/** 生成 turn id */
export function newTurnId(): string {
  return `turn_${randomUUID().slice(0, 8)}`
}
