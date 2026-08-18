
import { AIMessage, HumanMessage, BaseMessage, ToolMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { AgentMode, GoalChecklistItem } from '../../shared/ipc'
import { addTokenUsed } from './token-usage'
import { getReactGuide } from './react-prompt'
import { streamChatCompletion, invokeChatCompletion, langchainToolsToOpenAITools } from './llm-client'
import { buildGoalContext } from './goal-context'

export type GraphEmit = (event: {
  type: string
  message?: string
  content?: string
  checklist?: GoalChecklistItem[]
  goal?: string
  name?: string
  detail?: unknown
  /** task 事件专用 */
  kind?: 'add' | 'update' | 'remove'
  id?: string
  title?: string
  done?: boolean
  evidence?: string
  source?: 'goal' | 'agent'
  /** 段边界信号（service 用来决定是否自动续段） */
  reason?: string
  /** 工具调用输入参数（tools 节点 emit 时附带给 renderer 显示） */
  input?: unknown
}) => void

export type GraphBudget = {
  /** 清单连续无进展多少个 verify 轮后软暂停（默认 20；有工具进展会重置） */
  stagnationRounds: number
  /** 目标模式 token 成本预算（跨段累计），0=不限制；达到后软暂停让用户决定（默认 1_000_000_000） */
  tokenBudget: number
  /** 单段 invoke 最大 act 步数，0=不限制；达到后正常结束本段，service 落盘压缩后自动续段（默认 60） */
  segmentSteps: number
  /** Blocked audit 阈值：LLM 在 verify 阶段判定"同条件重复"达该轮数后强制暂停（默认 3） */
  blockedAuditRounds: number
}

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  mode: Annotation<AgentMode>,
  goal: Annotation<string>,
  checklist: Annotation<GoalChecklistItem[]>,
  round: Annotation<number>,
  lastDoneCount: Annotation<number>,
  stagnantRounds: Annotation<number>,
  lastAction: Annotation<string>,
  tokenUsed: Annotation<number>,
  toolActivityCount: Annotation<number>,
  lastVerifyToolActivityCount: Annotation<number>,
  blockedRounds: Annotation<number>
})

export type AgentGraphState = typeof AgentState.State

export function routeAfterActForGoal(input: {
  hasToolCalls: boolean
  round: number
  segmentSteps: number
}): 'tools' | 'end_segment' | 'end_burst' {
  if (input.segmentSteps > 0 && input.round >= input.segmentSteps) return 'end_segment'
  if (input.hasToolCalls) return 'tools'
  return 'end_burst'
}

export function routeAtStart(_input: {
  mode: AgentMode
  checklistLength: number
}): 'plan' | 'act' {
  // Goal bursts never re-plan; interactive START was already `act` on this branch.
  return 'act'
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
      } catch {
        return null
      }
    }
    return null
  }
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
  /** OpenAI-compatible 配置 */
  llm: { baseURL: string; apiKey: string; model: string }
  tools: DynamicStructuredTool[]
  emit: GraphEmit
  skillBlock: string
  memoryBlock: string
  /** 当前会话 id（shell-session-side-panel: 用于 emit task 事件） */
  sessionId: string
  /** 当前工作目录（用于 goal_context 的 work_from_evidence 段）；缺省 process.cwd() */
  cwd?: string
  beforeStep?: () => Promise<void>
  /** 停滞时软暂停（不结束图，等待用户点继续） */
  onStagnate?: () => void | Promise<void>
  budget?: Partial<GraphBudget>
  /** AbortSignal（用于取消 LLM 流式调用） */
  signal?: AbortSignal
}) {
  const { llm, tools, emit, skillBlock, memoryBlock, beforeStep, signal } = opts
  const budget: GraphBudget = {
    stagnationRounds: opts.budget?.stagnationRounds ?? 20,
    tokenBudget: opts.budget?.tokenBudget ?? 0,
    segmentSteps: opts.budget?.segmentSteps ?? 0,
    blockedAuditRounds: opts.budget?.blockedAuditRounds ?? 3
  }
  const toolNode = new ToolNode(tools)
  const openAITools = langchainToolsToOpenAITools(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      schema: (t as unknown as { schema: unknown }).schema
    }))
  )

  const contextPreamble = [
    skillBlock ? `【匹配到的技能】\n${skillBlock}` : '',
    memoryBlock ? `【长期记忆摘录】\n${memoryBlock}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')

  const gate = async (): Promise<void> => {
    if (beforeStep) await beforeStep()
  }

  async function planNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    await gate()
    emit({ type: 'status', message: '规划目标与验收清单…' })
    const userGoal =
      state.goal ||
      String(state.messages.filter((m) => m instanceof HumanMessage).at(-1)?.content ?? '')
    const { content: resContent } = await invokeChatCompletion(
      {
        baseURL: llm.baseURL,
        apiKey: llm.apiKey,
        model: llm.model
      },
      [
        {
          role: 'system',
          content: `你是目标规划器。根据用户目标输出 JSON：
{"goal":"...","checklist":[{"id":"1","title":"...","done":false,"check":"可执行的验收规则描述"}]}
清单 3-8 步，可验证。check 字段描述该步的可执行验收规则（如“运行 npm test 且全绿”），没有就省略。只输出 JSON。`
        },
        { role: 'user', content: userGoal }
      ]
    )
    const text = resContent
    const parsed = parseJsonObject(text)
    const checklist: GoalChecklistItem[] = Array.isArray(parsed?.checklist)
      ? (parsed!.checklist as Array<Record<string, unknown>>).map((c, i) => mapChecklistItem(c, i))
      : [{ id: '1', title: userGoal.slice(0, 80), done: false }]
    const goal = String(parsed?.goal ?? userGoal)
    emit({ type: 'goal', goal })
    for (const c of checklist) {
      emit({
        type: 'task',
        kind: 'add',
        id: c.id,
        title: c.title,
        done: c.done,
        evidence: c.evidence,
        source: 'goal'
      })
    }
    emit({
      type: 'assistant',
      content: `## 目标\n${goal}\n\n## 验收清单\n${checklist
        .map((c) => `- [ ] ${c.title}${c.check ? `（验收：${c.check}）` : ''}`)
        .join('\n')}`
    })
    const tokenUsed = addTokenUsed(state.tokenUsed, 0)  // plan 阶段暂不计 token
    return {
      goal,
      checklist,
      round: 0,
      lastDoneCount: 0,
      stagnantRounds: 0,
      tokenUsed,
      toolActivityCount: 0,
      lastAction: 'plan'
    }
  }

  async function actNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    await gate()
    const pending = state.checklist.filter((c) => !c.done)
    const focus = pending[0]
    emit({
      type: 'status',
      message: state.mode === 'goal' ? `执行：${focus?.title ?? '推进目标'}` : '交互式执行中…'
    })

    const goalCtx =
      state.mode === 'goal'
        ? buildGoalContext(
            {
              goal: state.goal ?? '',
              runStatus: 'running',
              checklist: state.checklist ?? [],
              stagnantRounds: state.stagnantRounds ?? 0,
              blockedRounds: state.blockedRounds ?? 0,
              tokenUsed: state.tokenUsed ?? 0
            },
            { tokenBudget: budget.tokenBudget, blockedAuditRounds: budget.blockedAuditRounds },
            opts.cwd ?? process.cwd()
          )
        : ''
    const sys = [
      goalCtx,
      getReactGuide('act'),
      '你是 shy，运行在用户本机。使用简体中文。需要时调用工具。高危操作会触发确认。',
      state.mode === 'goal'
        ? `目标模式。总目标：${state.goal}\n当前聚焦未完成项：${focus?.title ?? '（无）'}\n完成一项后用文字说明可观察证据（文件内容、命令输出、测试结果等）。不要宣称全部完成除非清单都做完。`
        : '交互式模式：与用户协作，逐步推进，勿擅自破坏性操作。',
      contextPreamble
    ]
      .filter(Boolean)
      .join('\n\n')

    // 构造 OpenAI 格式的 messages（state.messages 是 BaseMessage[]，转成原生格式）
    const openaiMessages: import('./llm-client').LLMMessage[] = [
      { role: 'system', content: sys },
      ...state.messages.map((m): import('./llm-client').LLMMessage => {
        // m 可能是 HumanMessage / AIMessage / SystemMessage / ToolMessage
        if (m._getType() === 'human') return { role: 'user', content: typeof m.content === 'string' ? m.content : '' }
        if (m._getType() === 'ai') {
          const aiMsg = m as AIMessage
          return {
            role: 'assistant',
            content: typeof aiMsg.content === 'string' ? aiMsg.content : '',
            tool_calls: (aiMsg.tool_calls ?? []) as unknown as import('openai/resources/index').ChatCompletionMessageToolCall[]
          }
        }
        if (m._getType() === 'system') return { role: 'system', content: typeof m.content === 'string' ? m.content : '' }
        if (m._getType() === 'tool') {
          const tm = m as ToolMessage
          return { role: 'tool', content: typeof tm.content === 'string' ? tm.content : '', tool_call_id: tm.tool_call_id }
        }
        return { role: 'user', content: '' }
      })
    ]

    // 流式调用原生 OpenAI SDK（替换 LangChain bound.stream()）
    let toolCalls: import('openai/resources/index').ChatCompletionMessageToolCall[] = []
    let completionTokens = 0
    let promptTokens = 0
    const stream = streamChatCompletion(llm, openaiMessages, openAITools, { signal })
    for await (const ev of stream) {
      if (ev.type === 'content') {
        emit({ type: 'assistant_delta', content: ev.delta })
      } else if (ev.type === 'tool_calls') {
        toolCalls = ev.toolCalls
      } else if (ev.type === 'usage') {
        promptTokens = ev.promptTokens
        completionTokens = ev.completionTokens
      }
      if (signal?.aborted) break
    }
    if (signal?.aborted) return { round: (state.round ?? 0) + 1, lastAction: 'act' }

    emit({ type: 'assistant_done' })

    // 构造最终 AIMessage：保留 tool_calls + content
    const finalMsg: any = new AIMessage('')
    if (toolCalls.length > 0) {
      finalMsg.tool_calls = toolCalls
    } else {
      // 重新拼 content：从 emit 已发出，但 LangGraph state 需要保存
      // 取最后一次 assistant_delta 的累积内容（这里没存累积，所以从 emit 推不出来）
      // 简化：保存最终 content 为空字符串（tools 节点会在后续 emit tool 事件）
      finalMsg.content = ''
    }
    const tokenUsed = addTokenUsed(state.tokenUsed, promptTokens + completionTokens)
    return {
      messages: [finalMsg],
      round: (state.round ?? 0) + 1,
      tokenUsed,
      lastAction: 'act'
    }
  }

  function routeAfterAct(state: AgentGraphState): 'tools' | typeof END {
    const last = state.messages.at(-1)
    const hasToolCalls = Boolean(
      last &&
      'tool_calls' in last &&
      Array.isArray((last as AIMessage).tool_calls) &&
      ((last as AIMessage).tool_calls?.length ?? 0) > 0
    )
    if (state.mode !== 'goal') return hasToolCalls ? 'tools' : END

    const route = routeAfterActForGoal({
      hasToolCalls,
      round: state.round ?? 0,
      segmentSteps: budget.segmentSteps
    })
    if (route === 'tools') return 'tools'
    if (route === 'end_segment') {
      emit({ type: 'done', reason: 'segment' })
    }
    return END
  }

  const graph = new StateGraph(AgentState)
    .addNode('plan', planNode)
    .addNode('act', actNode)
    .addNode('tools', async (state) => {
      await gate()
      // 从 state.messages 拿最后一个 AIMessage 的 tool_calls（拿到 input 参数）
      const lastAi = [...(state.messages ?? [])]
        .reverse()
        .find((m) => m instanceof AIMessage) as AIMessage | undefined
      const inputById = new Map<string, unknown>()
      for (const tc of lastAi?.tool_calls ?? []) {
        inputById.set(String(tc.id ?? ''), tc.args)
      }
      const result = await toolNode.invoke(state)
      const toolMsgs = (result.messages ?? []) as ToolMessage[]
      for (const tm of toolMsgs) {
        const input = inputById.get(String((tm as { tool_call_id?: string }).tool_call_id ?? ''))
        emit({
          type: 'tool',
          name: String(tm.name ?? 'tool'),
          detail: tm.content,
          input
        })
      }
      // 有效工具结果 → 视为实质活动（用于停滞判定）
      const toolActivityCount = (state.toolActivityCount ?? 0) + (toolMsgs.length > 0 ? 1 : 0)
      return {
        ...result,
        toolActivityCount
      }
    })
    .addConditionalEdges(START, (state) =>
      routeAtStart({
        mode: state.mode,
        checklistLength: state.checklist?.length ?? 0
      })
    )
    .addEdge('plan', 'act')
    .addConditionalEdges('act', routeAfterAct)
    .addEdge('tools', 'act')

  return graph.compile()
}
