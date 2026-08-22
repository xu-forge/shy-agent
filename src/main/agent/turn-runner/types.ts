/**
 * Turn-runner 8 步生命周期类型定义（参考 minimax mavis-06）。
 *
 * 8 步：
 *   1. incrementTurn        → turn counter 自增
 *   2. collect input         → 收集本轮 input（用户消息 / 续段信号 / resume）
 *   3. build context         → 历史 + system reminder + skill block + memory block
 *   4. call LLM              → 流式调用，emit content_delta
 *   5. handle tool calls     → 解析 tool_calls，emit tool_call 事件
 *   6. run tools             → 执行工具，emit tool_result
 *   7. append history        → 本轮 assistant + tool_result 写入 history
 *   8. decide next           → 工具调用 → 跳到 [6] 跑下一个；无 → done
 *
 * 这一版是"独立模块 + 纯函数"，service.ts 还在用 LangGraph 旧实现。
 * Stage 1.5 集成时切换。
 */

export type TurnStep =
  | 'incrementTurn' // 1
  | 'collectInput' // 2
  | 'buildContext' // 3
  | 'callLLM' // 4
  | 'handleToolCalls' // 5
  | 'runTools' // 6
  | 'appendHistory' // 7
  | 'decideNext' // 8
  | 'done' // 终结

export const TURN_STEPS: TurnStep[] = [
  'incrementTurn',
  'collectInput',
  'buildContext',
  'callLLM',
  'handleToolCalls',
  'runTools',
  'appendHistory',
  'decideNext'
] as const

export type TurnStatus = 'continue' | 'done' | 'blocked' | 'paused' | 'cancelled' | 'errored'

/** 单步预算：用于 observability / 单步超时 */
export type TurnBudget = {
  /** 单次 step 最长执行时间（ms），0=无限 */
  perStepTimeoutMs: number
  /** 单轮 invoke 最大 LLM 步数（一个 tool call 算一步），0=无限 */
  maxStepsPerTurn: number
}

/** LLM 调用 + 工具执行的输入（一次性传齐，避免 step 间反复传参） */
export type TurnInput = {
  sessionId: string
  /** 当前 goal 状态（与 goal/state.ts 集成） */
  goal?: {
    goal: string
    checklist: ReadonlyArray<{ id: string; title: string; done: boolean }>
  }
  /** 历史消息（user / assistant / tool 三种） */
  history: ReadonlyArray<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
    toolCallId?: string
  }>
  /** 可用工具 schema（OpenAI 格式） */
  tools: ReadonlyArray<{
    name: string
    description: string
    parameters: Record<string, unknown>
  }>
  /** LLM 配置 */
  llm: {
    baseURL: string
    apiKey: string
    model: string
    temperature?: number
  }
  /** 已匹配技能 block（plan 阶段从 skills/match.ts 拿） */
  skillBlock?: string
  /** 长期记忆 block（来自 memory/db.ts） */
  memoryBlock?: string
  /** abort signal */
  signal?: AbortSignal
  /** 预算 */
  budget?: Partial<TurnBudget>
  /** Stage 2.4: 上下文压缩设置(可选,默认 DEFAULT_COMPACTION_SETTINGS) */
  compaction?: {
    enabled?: boolean
    contextWindow?: number
    maxTokens?: number
    /** Stage 2.5: LLM 总结函数(可选,不传走本地模板) */
    generateSummary?: (
      messages: ReadonlyArray<{
        role: 'user' | 'assistant' | 'tool'
        content: string
        toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
        toolCallId?: string
      }>
    ) => Promise<string>
  }
}

/** 单步执行结果（用于 observability） */
export type TurnStepEvent =
  | { type: 'step:start'; step: TurnStep; turnId: string; stepIndex: number }
  | {
      type: 'step:end'
      step: TurnStep
      turnId: string
      stepIndex: number
      durationMs: number
      ok: boolean
    }
  | { type: 'turn:delta'; turnId: string; content: string }
  | { type: 'turn:tool_call'; turnId: string; id: string; name: string; input: unknown }
  | { type: 'turn:tool_result'; turnId: string; id: string; output?: unknown; error?: string }
  | { type: 'turn:usage'; turnId: string; promptTokens: number; completionTokens: number }
  | {
      type: 'compaction:applied'
      turnId: string
      level: 'off' | 'light' | 'standard' | 'aggressive'
      tokensBefore: number
      tokensAfter: number
      skipped?: string
    }

/** Turn 终结结果 */
export type TurnResult = {
  status: TurnStatus
  turnId: string
  /** 最终输出文本（无 tool call 的 LLM 终结时填） */
  finalContent: string
  /** 跑了多少步（含 LLM invoke + tool execution） */
  stepsExecuted: number
  /** 累计 token */
  tokenUsed: { prompt: number; completion: number }
  /** 每步耗时 */
  stepDurations: Record<TurnStep, number>
  /** 错误信息（status=errored 时填） */
  error?: string
  /** 下一步应该从哪个 step 继续（status=continue 时填） */
  nextStep?: TurnStep
}

/* ────────── turn hooks（minimax-feature-port，参考 pi-turn-runner/hooks.ts） ────────── */

export type TurnHistoryMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
  toolCallId?: string
}

/** beforeLlmCall：每次 LLM 请求前触发（compaction 等决策钩子） */
export type BeforeLlmCallDecision =
  | 'continue'
  | { type: 'skip'; reason: string }
  | { type: 'replaceMessages'; messages: TurnHistoryMessage[]; reason: string }
  | { type: 'abort'; reason: string }

export type BeforeLlmCallHook = (input: {
  turnId: string
  sessionId: string
  phase: 'initial' | 'iteration'
  messages: ReadonlyArray<TurnHistoryMessage>
  systemPrompt: string
}) => Promise<BeforeLlmCallDecision>

/** afterLlmCall：assistant 响应产出后、工具执行前触发 */
export type AfterLlmCallDecision =
  | 'continue'
  | { type: 'retry'; reason: string; prompt: string }
  | { type: 'fail'; reason: string }

export type AfterLlmCallHook = (input: {
  turnId: string
  sessionId: string
  content: string
  toolCalls: ReadonlyArray<{ id: string; name: string; args: string }>
}) => Promise<AfterLlmCallDecision>

/** beforeToolCall：单个工具执行前；返回 skip 则不执行 */
export type BeforeToolCallHook = (input: {
  turnId: string
  sessionId: string
  name: string
  args: unknown
}) => Promise<{ type: 'skip'; reason: string } | undefined>

/** afterToolCall：单个工具执行后 */
export type AfterToolCallHook = (input: {
  turnId: string
  sessionId: string
  name: string
  args: unknown
  output: string
}) => Promise<void>

/** onHistoryChanged：appendHistory 后触发 */
export type OnHistoryChangedHook = (input: {
  turnId: string
  sessionId: string
  reason: 'append'
  messages: ReadonlyArray<TurnHistoryMessage>
}) => Promise<void>

/** onStepEnd：一个 step（LLM 响应 + 工具执行）结束时触发 */
export type OnStepEndHook = (input: {
  turnId: string
  sessionId: string
  content: string
  toolResults: ReadonlyArray<{ tool_call_id: string; content: string }>
}) => Promise<void>

export type TurnHooks = {
  beforeLlmCall?: BeforeLlmCallHook[]
  afterLlmCall?: AfterLlmCallHook[]
  beforeToolCall?: BeforeToolCallHook[]
  afterToolCall?: AfterToolCallHook[]
  onHistoryChanged?: OnHistoryChangedHook[]
  onStepEnd?: OnStepEndHook[]
}
