import { ChatOpenAI } from '@langchain/openai'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  BaseMessage,
  ToolMessage
} from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { AgentMode, GoalChecklistItem } from '../../shared/ipc'
import { addTokenUsed, tokensOf } from './token-usage'

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
}) => void

export type GraphBudget = {
  /** 清单连续无进展多少个 verify 轮后软暂停（默认 20；有工具进展会重置） */
  stagnationRounds: number
  /** 目标模式 token 成本预算（跨段累计），0=不限制；达到后软暂停让用户决定（默认 1_000_000_000） */
  tokenBudget: number
  /** 单段 invoke 最大 act 步数，0=不限制；达到后正常结束本段，service 落盘压缩后自动续段（默认 60） */
  segmentSteps: number
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
  lastVerifyToolActivityCount: Annotation<number>
})

export type AgentGraphState = typeof AgentState.State

export function routeAfterActForGoal(input: {
  hasToolCalls: boolean
  round: number
  segmentSteps: number
}): 'tools' | 'end_segment' | 'end_burst' {
  if (input.hasToolCalls) return 'tools'
  if (input.segmentSteps > 0 && input.round >= input.segmentSteps) return 'end_segment'
  return 'end_burst'
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

function mapChecklistItem(
  c: Record<string, unknown>,
  i: number,
  fallback?: GoalChecklistItem
): GoalChecklistItem {
  return {
    id: String(c.id ?? fallback?.id ?? i + 1),
    title: String(c.title ?? fallback?.title ?? `步骤 ${i + 1}`),
    done: Boolean(c.done),
    evidence: c.evidence ? String(c.evidence) : fallback?.evidence,
    check: c.check ? String(c.check) : fallback?.check
  }
}

export function buildAgentGraph(opts: {
  llm: ChatOpenAI
  tools: DynamicStructuredTool[]
  emit: GraphEmit
  skillBlock: string
  memoryBlock: string
  /** 当前会话 id（shell-session-side-panel: 用于 emit task 事件） */
  sessionId: string
  beforeStep?: () => Promise<void>
  /** 停滞时软暂停（不结束图，等待用户点继续） */
  onStagnate?: () => void | Promise<void>
  budget?: Partial<GraphBudget>
}) {
  const { llm, tools, emit, skillBlock, memoryBlock, beforeStep } = opts
  const budget: GraphBudget = {
    stagnationRounds: opts.budget?.stagnationRounds ?? 20,
    tokenBudget: opts.budget?.tokenBudget ?? 0,
    segmentSteps: opts.budget?.segmentSteps ?? 0
  }
  const toolNode = new ToolNode(tools)
  const bound = llm.bindTools(tools)

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
    const res = await llm.invoke([
      new SystemMessage(
        `你是目标规划器。根据用户目标输出 JSON：
{"goal":"...","checklist":[{"id":"1","title":"...","done":false,"check":"可执行的验收规则描述"}]}
清单 3-8 步，可验证。check 字段描述该步的可执行验收规则（如“运行 npm test 且全绿”），没有就省略。只输出 JSON。`
      ),
      new HumanMessage(userGoal)
    ])
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
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
    const tokenUsed = addTokenUsed(state.tokenUsed, tokensOf(res))
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

    const sys = [
      '你是 shy，运行在用户本机。使用简体中文。需要时调用工具。高危操作会触发确认。',
      state.mode === 'goal'
        ? `目标模式。总目标：${state.goal}\n当前聚焦未完成项：${focus?.title ?? '（无）'}\n完成一项后用文字说明可观察证据（文件内容、命令输出、测试结果等）。不要宣称全部完成除非清单都做完。`
        : '交互式模式：与用户协作，逐步推进，勿擅自破坏性操作。',
      contextPreamble
    ]
      .filter(Boolean)
      .join('\n\n')

    const response = await bound.invoke([new SystemMessage(sys), ...state.messages])
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    if (content) emit({ type: 'assistant', content })
    const tokenUsed = addTokenUsed(state.tokenUsed, tokensOf(response))
    return {
      messages: [response],
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
      const result = await toolNode.invoke(state)
      const toolMsgs = (result.messages ?? []) as ToolMessage[]
      for (const tm of toolMsgs) {
        emit({
          type: 'tool',
          name: String(tm.name ?? 'tool'),
          detail: tm.content
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
      state.mode === 'goal' && !(state.checklist?.length > 0) ? 'plan' : 'act'
    )
    .addEdge('plan', 'act')
    .addConditionalEdges('act', routeAfterAct)
    .addEdge('tools', 'act')

  return graph.compile()
}
