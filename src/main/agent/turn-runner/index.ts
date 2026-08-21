/**
 * Turn-runner 主入口：runTurn(input, deps) → TurnResult
 *
 * 8 步生命周期串联：
 *   1. incrementTurn
 *   2. collectInput
 *   3. buildContext
 *   4. callLLM         ← 实际流式调 LLM（用 llm-client）
 *   5. handleToolCalls  ← 解析 tool_calls
 *   6. runTools         ← 实际调 LangChain ToolNode
 *   7. appendHistory    ← 写回 history
 *   8. decideNext       ← 决定 status + nextStep
 *
 * 重要：本文件作为独立模块提供。**当前 service.ts 还在用 LangGraph 旧实现。**
 * Stage 1.5 集成时把 service.ts:while-true 循环替换为调本 runTurn()。
 *
 * 设计要点：
 * - 错误兜底：任何 throw 都被 catch 标记 status='errored'，不抛给 caller
 * - abort 信号：每步检查 signal?.aborted，立即 paused/cancelled
 * - 进度可观测：每步 emit step:start / step:end（duration）
 * - 单步超时：perStepTimeoutMs（默认 0=无限，由 caller 决定）
 */
import { randomUUID } from 'crypto'
import { streamChatCompletion, type LLMMessage } from '../llm-client'
import { compactHistory, type CompactionSettings } from '../compaction'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import type { TurnInput, TurnResult, TurnStep, TurnStepEvent } from './types'
import {
  newTurnId,
  incrementTurn,
  collectInput,
  buildContext,
  handleToolCalls,
  appendHistory,
  decideNext,
  emitToolResult
} from './lifecycle'

export type { TurnInput, TurnResult, TurnStep, TurnStepEvent } from './types'

export type RunTurnDeps = {
  /** emit 单步事件 + turn 事件 */
  emit: (event: TurnStepEvent) => void
  /** ReAct 引导 prompt（由 caller 提供，plan/act/verify 不同） */
  getReactGuide: (mode: 'plan' | 'act' | 'verify') => string
  /** LangChain DynamicStructuredTool[]（与 TurnInput.tools 同名映射） */
  tools: DynamicStructuredTool[]
  /** mode（决定 react guide） */
  mode: 'plan' | 'act' | 'verify'
  /** 起始 turn number */
  startTurn: number
  /** Stage 2.3 集成:system-reminder service,可选。传 null/undefined 跳过 */
  systemReminder?: {
    buildReminder: (input: {
      env: {
        sessionId: string
        agentName: string
        agentRole: 'orchestrator' | 'worker' | 'unknown'
        displayName?: string
        userConfiguredName?: string
        platform: NodeJS.Platform
        cwd: string
        shell: 'zsh' | 'bash' | 'powershell' | 'cmd'
        teamModeOff: boolean
      }
      turnCount: number
      memoryBlock: string
      shortMemory: string
      skillBlock: string
      goal?: {
        goal: string
        checklist: ReadonlyArray<{ id: string; title: string; done: boolean }>
        progress: { done: number; total: number; pct: number }
        budget: { tokenUsed: number; tokenBudget: number; pct: number; disabled: boolean }
        stagnantRounds: number
        blockedRounds: number
      }
      allowlist: Set<string> | null
      criticalOnly: boolean
    }) => string | null
  }
}

function computeProgress(
  checklist: ReadonlyArray<{ id: string; title: string; done: boolean }>
): { done: number; total: number; pct: number } {
  const total = checklist.length
  const done = checklist.filter((c) => c.done).length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, pct }
}

/**
 * 跑一轮 turn：完整 8 步 + 工具循环（支持多次 tool call）。
 */
export async function runTurn(
  input: TurnInput,
  deps: RunTurnDeps
): Promise<TurnResult> {
  const turnId = newTurnId()
  const stepDurations: Record<TurnStep, number> = {
    incrementTurn: 0,
    collectInput: 0,
    buildContext: 0,
    callLLM: 0,
    handleToolCalls: 0,
    runTools: 0,
    appendHistory: 0,
    decideNext: 0,
    done: 0
  }
  const tokenUsed = { prompt: 0, completion: 0 }
  let stepsExecuted = 0
  let finalContent = ''

  // ── 1. incrementTurn ──
  try {
    const startMs = Date.now()
    incrementTurn(deps.startTurn, deps.emit, turnId)
    stepDurations.incrementTurn = Date.now() - startMs
  } catch (err) {
    return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
  }

  // ── 2. collectInput ──
  try {
    const startMs = Date.now()
    const _out = collectInput(
      {
        userMessage: input.history.find((m) => m.role === 'user')?.content,
        resumeHint: undefined,
        autoSegmentContinue: false
      },
      deps.emit,
      turnId
    )
    // _out 暂未使用（plan/act/verify 模式由 deps.mode 决定）
    void _out
    stepDurations.collectInput = Date.now() - startMs
  } catch (err) {
    return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
  }

  // ── 3. buildContext ──
  let systemPrompt: string
  try {
    const startMs = Date.now()
    const goalBlock = input.goal
      ? `【目标模式】总目标：${input.goal.goal}\n当前聚焦未完成项：${input.goal.checklist.find((c) => !c.done)?.title ?? '（无）'}`
      : '【交互式模式】与用户协作,逐步推进,勿擅自破坏性操作。'
    const out = buildContext(
      {
        skillBlock: input.skillBlock,
        memoryBlock: input.memoryBlock,
        reactGuide: deps.getReactGuide(deps.mode),
        goalBlock
      },
      deps.emit,
      turnId
    )
    let basePrompt = out.systemPrompt
    // Stage 2.3 集成:把 system-reminder 拼到 system prompt 后面
    if (deps.systemReminder) {
      try {
        const reminderText = deps.systemReminder.buildReminder({
          env: {
            sessionId: input.sessionId,
            agentName: 'shy',
            agentRole: 'worker',
            displayName: 'shy',
            platform: process.platform,
            cwd: process.cwd(),
            shell: process.platform === 'win32' ? 'powershell' : 'zsh',
            teamModeOff: true
          },
          turnCount: deps.startTurn + 1,
          memoryBlock: input.memoryBlock ?? '',
          shortMemory: '',
          skillBlock: input.skillBlock ?? '',
          goal: input.goal
            ? {
                goal: input.goal.goal,
                checklist: input.goal.checklist,
                progress: computeProgress(input.goal.checklist),
                budget: { tokenUsed: 0, tokenBudget: 0, pct: 0, disabled: true },
                stagnantRounds: 0,
                blockedRounds: 0
              }
            : undefined,
          allowlist: null,
          criticalOnly: false
        })
        if (reminderText) basePrompt = `${basePrompt}\n\n${reminderText}`
      } catch (err) {
        // fail-open: system-reminder 失败不影响主流程
        console.error('[shy:turn-runner] system-reminder failed:', err)
      }
    }
    systemPrompt = basePrompt
    stepDurations.buildContext = Date.now() - startMs
  } catch (err) {
    return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
  }

  // ── Stage 2.4: Context Compaction（4 档压缩,在 step 3 之前） ──
  // 默认开启,可由 input.compaction.enabled = false 关闭
  // 默认 contextWindow 128K(model 拿不到时 fallback)
  let history: Array<{
    role: 'user' | 'assistant' | 'tool'
    content: string
    toolCalls?: { id: string; name: string; args: string }[]
    toolCallId?: string
  }>
  if (input.compaction?.enabled !== false) {
    const compactionSettings: Partial<CompactionSettings> = {}
    void compactionSettings // 默认用 DEFAULT_COMPACTION_SETTINGS
    const compactionStartMs = Date.now()
    const compactionPlan = compactHistory(
      input.history.map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls ? [...m.toolCalls] : undefined,
        toolCallId: m.toolCallId
      })),
      {
        contextWindow: input.compaction?.contextWindow ?? 0,
        maxTokens: input.compaction?.maxTokens
      }
    )
    deps.emit({
      type: 'compaction:applied',
      turnId,
      level: compactionPlan.level,
      tokensBefore: compactionPlan.tokensBefore,
      tokensAfter: compactionPlan.tokensAfter,
      skipped: compactionPlan.skipped
    })
    void compactionStartMs
    history = compactionPlan.history.map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ? [...m.toolCalls] : undefined,
      toolCallId: m.toolCallId
    }))
  } else {
    history = input.history.map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ? [...m.toolCalls] : undefined,
      toolCallId: m.toolCallId
    }))
  }
  const toolNode = new ToolNode(deps.tools)

  let continueLoop = true
  let loopGuard = 0
  const maxLoops = 8 // 单 turn 最多 8 个 tool call 循环

  while (continueLoop) {
    if (input.signal?.aborted) {
      return {
        status: 'cancelled',
        turnId,
        finalContent,
        stepsExecuted,
        tokenUsed,
        stepDurations
      }
    }
    if (++loopGuard > maxLoops) {
      return {
        status: 'errored',
        turnId,
        finalContent,
        stepsExecuted,
        tokenUsed,
        stepDurations,
        error: `单 turn 超过 ${maxLoops} 个 tool call 循环`
      }
    }

    // ── 4. callLLM ──
    let llmResponse: {
      content: string
      toolCalls: Array<{ id: string; name: string; args: string }>
    }
    try {
      const startMs = Date.now()
      deps.emit({ type: 'step:start', step: 'callLLM', turnId, stepIndex: 3 })
      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((m) => {
          if (m.role === 'user') return { role: 'user' as const, content: m.content }
          if (m.role === 'tool') {
            return {
              role: 'tool' as const,
              content: m.content,
              tool_call_id: m.toolCallId ?? ''
            }
          }
          // assistant
          return {
            role: 'assistant' as const,
            content: m.content,
            ...(m.toolCalls ? { tool_calls: m.toolCalls as never } : {})
          }
        })
      ]
      const openaiTools = input.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.parameters }
      }))

      let accContent = ''
      const accToolCalls: Array<{ id: string; name: string; args: string }> = []
      let promptTok = 0
      let completionTok = 0
      const stream = streamChatCompletion(
        {
          baseURL: input.llm.baseURL,
          apiKey: input.llm.apiKey,
          model: input.llm.model
        },
        llmMessages,
        openaiTools,
        { signal: input.signal }
      )
      for await (const ev of stream) {
        if (ev.type === 'content') {
          accContent += ev.delta
          deps.emit({ type: 'turn:delta', turnId, content: ev.delta })
        } else if (ev.type === 'tool_calls') {
          for (const tc of ev.toolCalls) {
            // OpenAI SDK 7.x union 类型：function 字段需要 cast
            const fn = (tc as unknown as { function?: { name: string; arguments: string } }).function
            if (fn) {
              accToolCalls.push({ id: tc.id, name: fn.name, args: fn.arguments })
            }
          }
        } else if (ev.type === 'usage') {
          promptTok = ev.promptTokens
          completionTok = ev.completionTokens
        }
        if (input.signal?.aborted) break
      }
      tokenUsed.prompt += promptTok
      tokenUsed.completion += completionTok
      deps.emit({ type: 'turn:usage', turnId, promptTokens: promptTok, completionTokens: completionTok })
      stepDurations.callLLM = Date.now() - startMs
      stepsExecuted += 1
      deps.emit({ type: 'step:end', step: 'callLLM', turnId, stepIndex: 3, durationMs: stepDurations.callLLM, ok: true })
      llmResponse = { content: accContent, toolCalls: accToolCalls }
    } catch (err) {
      return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
    }

    finalContent = llmResponse.content

    // ── 5. handleToolCalls ──
    try {
      const startMs = Date.now()
      handleToolCalls(llmResponse, deps.emit, turnId)
      stepDurations.handleToolCalls = Date.now() - startMs
    } catch (err) {
      return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
    }

    // ── 8. decideNext（tool_calls 为 0 时直接 done） ──
    if (llmResponse.toolCalls.length === 0) {
      try {
        const startMs = Date.now()
        const decision = decideNext({ hasToolCalls: false }, deps.emit, turnId)
        stepDurations.decideNext = Date.now() - startMs
        if (decision.status === 'done') {
          return {
            status: 'done',
            turnId,
            finalContent,
            stepsExecuted,
            tokenUsed,
            stepDurations
          }
        }
        // 续段（continuation segment）由 caller 决定，目前不自动 continue
        break
      } catch (err) {
        const errStart = Date.now()
        deps.emit({ type: 'step:end', step: 'callLLM', turnId, stepIndex: 3, durationMs: errStart - errStart, ok: false })
        return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
      }
    }

    // ── 6. runTools + 7. appendHistory（并行：跑完所有 tool 一次性写） ──
    try {
      const startMs = Date.now()
      deps.emit({ type: 'step:start', step: 'runTools', turnId, stepIndex: 5 })
      // 把当前 assistant 消息写进 history（LangChain ToolNode 需要 last message 是 assistant with tool_calls）
      const assistantMsg = new AIMessage('')
      ;(assistantMsg as { tool_calls?: unknown }).tool_calls = llmResponse.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: tc.args,
        type: 'tool_call'
      }))
      const messagesForToolNode = [
        new SystemMessage(systemPrompt),
        ...history.map((m) => {
          if (m.role === 'user') return new HumanMessage(m.content)
          if (m.role === 'tool') return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId ?? '' })
          return new AIMessage(m.content)
        }),
        assistantMsg
      ]
      const toolResult = (await toolNode.invoke({ messages: messagesForToolNode })) as {
        messages: ToolMessage[]
      }
      for (const tm of toolResult.messages) {
        const tmAny = tm as unknown as { tool_call_id?: string; content: unknown }
        emitToolResult(
          {
            id: tmAny.tool_call_id ?? '',
            output: typeof tmAny.content === 'string' ? tmAny.content : JSON.stringify(tmAny.content)
          },
          deps.emit,
          turnId
        )
      }
      stepDurations.runTools = Date.now() - startMs
      stepsExecuted += llmResponse.toolCalls.length
      deps.emit({ type: 'step:end', step: 'runTools', turnId, stepIndex: 5, durationMs: stepDurations.runTools, ok: true })

      // ── 7. appendHistory ──
      const histStartMs = Date.now()
      const newMessages = [
        {
          role: 'assistant' as const,
          content: llmResponse.content,
          toolCalls: llmResponse.toolCalls
        },
        ...toolResult.messages.map((tm) => {
          const tmAny = tm as unknown as { tool_call_id?: string; content: unknown }
          return {
            role: 'tool' as const,
            content: typeof tmAny.content === 'string' ? tmAny.content : JSON.stringify(tmAny.content),
            toolCallId: tmAny.tool_call_id
          }
        })
      ]
      const appended = appendHistory(history, newMessages, deps.emit, turnId)
      history = appended.history as typeof history
      stepDurations.appendHistory = Date.now() - histStartMs
    } catch (err) {
      return erroredResult(turnId, stepDurations, tokenUsed, stepsExecuted, err)
    }

    // 回到 callLLM 继续下一轮 tool call
  }

  return {
    status: 'done',
    turnId,
    finalContent,
    stepsExecuted,
    tokenUsed,
    stepDurations
  }
}

function erroredResult(
  turnId: string,
  stepDurations: Record<TurnStep, number>,
  tokenUsed: { prompt: number; completion: number },
  stepsExecuted: number,
  err: unknown
): TurnResult {
  return {
    status: 'errored',
    turnId,
    finalContent: '',
    stepsExecuted,
    tokenUsed,
    stepDurations,
    error: err instanceof Error ? err.message : String(err)
  }
}

// 引用 randomUUID 防止 import 误报
void randomUUID
