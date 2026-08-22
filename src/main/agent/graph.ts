/**
 * Graph adapter — 把 turn-runner 8 步生命周期包装成 service.ts 期望的 LangGraph-like 形态。
 *
 * 设计目的:Stage 1.5 暗集成 — service.ts 完全不动,只换 graph.ts 内部实现。
 * - 旧实现:LangGraph StateGraph 3 节点(plan / act / tools)
 * - 新实现:turn-runner 8 步生命周期
 * - 对调用方(service.ts)透明,签名 `buildAgentGraph() → { invoke() }` 保持兼容
 *
 * 当 USE_V2 = true 时用 turn-runner;false 时跑 LangGraph 旧实现(已注释掉)。
 * 任何 regression 把 USE_V2 改 false 即可回退到 LangGraph。
 */
import type { AgentMode, GoalChecklistItem } from '../../shared/ipc'
import { getReactGuide } from './react-prompt'
import { runTurn } from './turn-runner'
import { buildGoalState } from './goal/service'
import { schemaToJson, type ShyTool } from './tools/dispatcher'

export type GraphEmit = (event: {
  type: string
  message?: string
  content?: string
  checklist?: GoalChecklistItem[]
  goal?: string
  name?: string
  detail?: unknown
  kind?: 'add' | 'update' | 'remove'
  id?: string
  title?: string
  done?: boolean
  evidence?: string
  source?: 'goal' | 'agent'
  reason?: string
  input?: unknown
  output?: unknown
  error?: string
}) => void

export type GraphBudget = {
  stagnationRounds: number
  tokenBudget: number
  segmentSteps: number
  blockedAuditRounds: number
}

const USE_V2 = true

export type AgentGraphState = {
  messages: unknown[]
  mode: AgentMode
  goal: string
  checklist: GoalChecklistItem[]
  round: number
  lastDoneCount: number
  stagnantRounds: number
  lastAction: string
  tokenUsed: number
  toolActivityCount: number
  lastVerifyToolActivityCount: number
  blockedRounds?: number
}

export function routeAfterActForGoal(input: {
  hasToolCalls: boolean
  round: number
  segmentSteps: number
}): 'tools' | 'end_segment' | 'end_burst' {
  if (input.segmentSteps > 0 && input.round >= input.segmentSteps) return 'end_segment'
  if (input.hasToolCalls) return 'tools'
  return 'end_burst'
}

export function routeAtStart(_input: { mode: AgentMode; checklistLength: number }): 'plan' | 'act' {
  void _input
  return 'act'
}

export function mapChecklistItem(
  c: Record<string, unknown>,
  i: number,
  fallback?: GoalChecklistItem
): GoalChecklistItem {
  return {
    id: String(c.id ?? fallback?.id ?? i + 1),
    title: String(c.title ?? fallback?.title ?? `步骤 ${i + 1}`),
    done: false,
    evidence: c.evidence ? String(c.evidence) : fallback?.evidence,
    check: c.check ? String(c.check) : fallback?.check
  }
}

export function buildAgentGraph(opts: {
  llm: { baseURL: string; apiKey: string; model: string }
  tools: ShyTool[]
  emit: GraphEmit
  skillBlock: string
  memoryBlock: string
  sessionId: string
  cwd?: string
  beforeStep?: () => Promise<void>
  onStagnate?: () => void
  budget?: Partial<GraphBudget>
  signal?: AbortSignal
  /** Stage 2.5: 模型 contextWindow,用于 compaction 触发线计算 */
  contextWindow?: number
}): {
  invoke: (
    state: AgentGraphState,
    invokeOpts?: { signal?: AbortSignal; recursionLimit?: number }
  ) => Promise<AgentGraphState>
} {
  if (USE_V2) {
    return buildV2Graph(opts)
  }
  // v1 (LangGraph 旧实现) 保留作 fallback — 任何 v2 regression 改 USE_V2=false 即回退
  throw new Error(
    'v1 (LangGraph) graph 已废弃,USE_V2 必须为 true。如需回退请改 graph.ts USE_V2=false 并恢复 buildV1Graph 实现。'
  )
}

/**
 * v2 实现:把 graph.invoke() 调用转成 turn-runner 8 步单轮执行。
 *
 * service.ts 期望 graph.invoke() 返回带 messages/mode/goal/checklist/round/tokenUsed 的 state,
 * 跟 LangGraph StateGraph 输出兼容。
 */
function buildV2Graph(opts: {
  llm: { baseURL: string; apiKey: string; model: string }
  tools: ShyTool[]
  emit: GraphEmit
  skillBlock: string
  memoryBlock: string
  sessionId: string
  cwd?: string
  beforeStep?: () => Promise<void>
  onStagnate?: () => void
  budget?: Partial<GraphBudget>
  signal?: AbortSignal
  /** Stage 2.5: 模型 contextWindow,用于 compaction 触发线计算 */
  contextWindow?: number
}): {
  invoke: (
    state: AgentGraphState,
    invokeOpts?: { signal?: AbortSignal; recursionLimit?: number }
  ) => Promise<AgentGraphState>
} {
  const budget: GraphBudget = {
    stagnationRounds: opts.budget?.stagnationRounds ?? 20,
    tokenBudget: opts.budget?.tokenBudget ?? 0,
    segmentSteps: opts.budget?.segmentSteps ?? 0,
    blockedAuditRounds: opts.budget?.blockedAuditRounds ?? 3
  }

  return {
    async invoke(
      state: AgentGraphState,
      invokeOpts?: { signal?: AbortSignal; recursionLimit?: number }
    ): Promise<AgentGraphState> {
      const signal = invokeOpts?.signal ?? opts.signal
      // 把消息转 turn-runner 格式（纯对象：role / content / tool_calls / tool_call_id）
      const history = (state.messages ?? [])
        .map((m) => {
          const msg = m as {
            role?: string
            content?: string | unknown[]
            tool_calls?: Array<{ id: string; name: string; args: unknown }>
            tool_call_id?: string
          }
          const role = msg.role ?? 'user'
          const content = typeof msg.content === 'string' ? msg.content : ''
          if (role === 'system') return null // 系统消息由 turn-runner 自行构造
          if (role === 'user') return { role: 'user' as const, content }
          if (role === 'assistant') {
            const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
              id: tc.id,
              name: tc.name,
              args: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
            }))
            return { role: 'assistant' as const, content, toolCalls }
          }
          if (role === 'tool') {
            return { role: 'tool' as const, content, toolCallId: msg.tool_call_id ?? '' }
          }
          return { role: 'user' as const, content: '' }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)

      // 调 turn-runner
      const goalState = state.goal
        ? buildGoalState({
            goal: state.goal,
            checklist: state.checklist ?? [],
            runStatus: 'running',
            paused: false,
            tokenUsed: state.tokenUsed ?? 0,
            tokenBudget: budget.tokenBudget,
            rounds: state.round ?? 0
          })
        : undefined

      const toolsForTurn = opts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: schemaToJson(t.schema)
      }))

      // Stage 2.5:为本次 turn 创建 LLM summarizer(只在有 apiKey 时)
      // 失败回退到本地模板(strategy.ts 内部 catch 抛错 → return null → skipped='summary_failed')
      const { createLlmSummarizer } = await import('./compaction')
      const llmSummarizer = opts.llm.apiKey
        ? createLlmSummarizer({
            baseURL: opts.llm.baseURL,
            apiKey: opts.llm.apiKey,
            model: opts.llm.model,
            signal
          })
        : null

      const result = await runTurn(
        {
          sessionId: opts.sessionId,
          goal: goalState ? { goal: goalState.goal, checklist: goalState.checklist } : undefined,
          history,
          tools: toolsForTurn,
          llm: opts.llm,
          skillBlock: opts.skillBlock,
          memoryBlock: opts.memoryBlock,
          signal,
          compaction: {
            enabled: true,
            contextWindow: opts.contextWindow ?? 0,
            generateSummary: llmSummarizer ?? undefined
          }
        },
        {
          emit: (e) => {
            // turn-runner 事件 → service.ts 期望的 graphEmit 事件
            if (e.type === 'turn:delta') {
              opts.emit({ type: 'assistant_delta', content: e.content })
            } else if (e.type === 'turn:tool_call') {
              opts.emit({ type: 'tool_call', id: e.id, name: e.name, input: e.input })
            } else if (e.type === 'turn:tool_result') {
              opts.emit({ type: 'tool_result', id: e.id, output: e.output, error: e.error })
            } else if (e.type === 'turn:usage') {
              opts.emit({
                type: 'usage',
                detail: { prompt: e.promptTokens, completion: e.completionTokens }
              })
            }
          },
          getReactGuide,
          tools: opts.tools,
          mode: state.mode === 'goal' ? 'act' : 'act',
          startTurn: state.round ?? 0
        }
      )

      // turn-runner 结果 → LangGraph state 兼容格式
      const newMessages = result.finalContent
        ? [
            {
              _getType: () => 'ai',
              content: result.finalContent,
              tool_calls: []
            }
          ]
        : []

      return {
        ...state,
        messages: newMessages,
        goal: state.goal,
        checklist: state.checklist,
        round: (state.round ?? 0) + result.stepsExecuted,
        tokenUsed: (state.tokenUsed ?? 0) + result.tokenUsed.prompt + result.tokenUsed.completion,
        lastAction: 'act',
        toolActivityCount: (state.toolActivityCount ?? 0) + result.stepsExecuted,
        lastVerifyToolActivityCount: state.lastVerifyToolActivityCount ?? 0,
        stagnantRounds: state.stagnantRounds ?? 0,
        blockedRounds: state.blockedRounds ?? 0,
        lastDoneCount: state.lastDoneCount ?? 0
      }
    }
  }
}
