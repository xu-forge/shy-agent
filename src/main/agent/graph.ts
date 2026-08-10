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

export type GraphEmit = (event: {
  type: string
  message?: string
  content?: string
  checklist?: GoalChecklistItem[]
  goal?: string
  name?: string
  detail?: unknown
}) => void

export type GraphBudget = {
  /** 清单连续无进展多少个 act 轮后软暂停（默认 20） */
  stagnationRounds: number
  /** 绝对保险丝：超过则结束，0 表示关闭（默认 0） */
  hardRoundCap: number
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
  lastAction: Annotation<string>
})

export type AgentGraphState = typeof AgentState.State

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

function doneCount(checklist: GoalChecklistItem[]): number {
  return checklist.filter((c) => c.done).length
}

export function buildAgentGraph(opts: {
  llm: ChatOpenAI
  tools: DynamicStructuredTool[]
  emit: GraphEmit
  skillBlock: string
  memoryBlock: string
  beforeStep?: () => Promise<void>
  /** 停滞时软暂停（不结束图，等待用户点继续） */
  onStagnate?: () => void | Promise<void>
  budget?: Partial<GraphBudget>
}) {
  const { llm, tools, emit, skillBlock, memoryBlock, beforeStep, onStagnate } = opts
  const budget: GraphBudget = {
    stagnationRounds: opts.budget?.stagnationRounds ?? 20,
    hardRoundCap: opts.budget?.hardRoundCap ?? 0
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
{"goal":"...","checklist":[{"id":"1","title":"...","done":false}]}
清单 3-8 步，可验证。只输出 JSON。`
      ),
      new HumanMessage(userGoal)
    ])
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const parsed = parseJsonObject(text)
    const checklist = Array.isArray(parsed?.checklist)
      ? (parsed!.checklist as Array<Record<string, unknown>>).map((c, i) => ({
          id: String(c.id ?? i + 1),
          title: String(c.title ?? `步骤 ${i + 1}`),
          done: Boolean(c.done),
          evidence: c.evidence ? String(c.evidence) : undefined
        }))
      : [{ id: '1', title: userGoal.slice(0, 80), done: false }]
    const goal = String(parsed?.goal ?? userGoal)
    emit({ type: 'goal', goal, checklist })
    emit({
      type: 'assistant',
      content: `## 目标\n${goal}\n\n## 验收清单\n${checklist.map((c) => `- [ ] ${c.title}`).join('\n')}`
    })
    return {
      goal,
      checklist,
      round: 0,
      lastDoneCount: 0,
      stagnantRounds: 0,
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
      '你是 my-agent，运行在用户本机。使用简体中文。需要时调用工具。高危操作会触发确认。',
      state.mode === 'goal'
        ? `目标模式。总目标：${state.goal}\n当前聚焦未完成项：${focus?.title ?? '（无）'}\n完成一项后用文字说明证据。不要宣称全部完成除非清单都做完。`
        : '交互式模式：与用户协作，逐步推进，勿擅自破坏性操作。',
      contextPreamble
    ]
      .filter(Boolean)
      .join('\n\n')

    const response = await bound.invoke([new SystemMessage(sys), ...state.messages])
    const content =
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    if (content) emit({ type: 'assistant', content })
    return { messages: [response], round: (state.round ?? 0) + 1, lastAction: 'act' }
  }

  async function verifyNode(state: AgentGraphState): Promise<Partial<AgentGraphState>> {
    await gate()
    if (state.mode !== 'goal') return { lastAction: 'verify' }
    emit({ type: 'status', message: '验收清单进度…' })
    const res = await llm.invoke([
      new SystemMessage(
        `根据对话与工具结果，更新验收清单。输出 JSON：
{"checklist":[{"id":"...","title":"...","done":true/false,"evidence":"..."}],"allDone":true/false,"summary":"..."}
只输出 JSON。`
      ),
      new HumanMessage(
        `目标：${state.goal}\n当前清单：${JSON.stringify(state.checklist)}\n最近消息：${state.messages
          .slice(-8)
          .map((m) => `${m._getType()}: ${typeof m.content === 'string' ? m.content : ''}`)
          .join('\n')}`
      )
    ])
    const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
    const parsed = parseJsonObject(text)
    let checklist = state.checklist
    if (Array.isArray(parsed?.checklist)) {
      checklist = (parsed!.checklist as Array<Record<string, unknown>>).map((c, i) => ({
        id: String(c.id ?? state.checklist[i]?.id ?? i + 1),
        title: String(c.title ?? state.checklist[i]?.title ?? `步骤 ${i + 1}`),
        done: Boolean(c.done),
        evidence: c.evidence ? String(c.evidence) : undefined
      }))
    }
    emit({ type: 'goal', goal: state.goal, checklist })
    const summary = String(parsed?.summary ?? '')
    if (summary) {
      emit({
        type: 'assistant',
        content: `### 进度\n${checklist.map((c) => `- [${c.done ? 'x' : ' '}] ${c.title}${c.evidence ? ` — ${c.evidence}` : ''}`).join('\n')}\n\n${summary}`
      })
    }

    const done = doneCount(checklist)
    const prevDone = state.lastDoneCount ?? 0
    const stagnantRounds = done > prevDone ? 0 : (state.stagnantRounds ?? 0) + 1

    return {
      checklist,
      lastDoneCount: done,
      stagnantRounds,
      lastAction: 'verify'
    }
  }

  function routeAfterAct(state: AgentGraphState): 'tools' | 'verify' | typeof END {
    const last = state.messages.at(-1)
    if (
      last &&
      'tool_calls' in last &&
      Array.isArray((last as AIMessage).tool_calls) &&
      ((last as AIMessage).tool_calls?.length ?? 0) > 0
    ) {
      return 'tools'
    }
    return state.mode === 'goal' ? 'verify' : END
  }

  function routeAfterVerify(state: AgentGraphState): 'act' | 'await_user' | typeof END {
    if (state.mode !== 'goal') return END
    const allDone = state.checklist.length > 0 && state.checklist.every((c) => c.done)
    if (allDone) {
      emit({ type: 'assistant', content: '**目标完成**' })
      return END
    }

    // 绝对保险丝（默认关闭）：防失控无限循环
    if (budget.hardRoundCap > 0 && (state.round ?? 0) >= budget.hardRoundCap) {
      emit({
        type: 'assistant',
        content: `已触及绝对轮次上限（${budget.hardRoundCap}），进度已保存。点「继续」或发新消息可再推进。`
      })
      return 'await_user'
    }

    // 有进展就续跑；无进展达到阈值则软暂停（不掐断任务）
    if ((state.stagnantRounds ?? 0) >= budget.stagnationRounds) {
      emit({
        type: 'assistant',
        content: `连续 ${budget.stagnationRounds} 轮验收清单无新进展，已暂停以免空转。\n你可以补充约束/线索后点「继续」，或改目标后重新发送。`
      })
      emit({ type: 'status', message: '因停滞已暂停，等待你继续…' })
      return 'await_user'
    }

    return 'act'
  }

  async function awaitUserNode(): Promise<Partial<AgentGraphState>> {
    if (onStagnate) await onStagnate()
    await gate() // 暂停门闩：恢复后才往下走，并清零停滞计数
    return { stagnantRounds: 0, lastAction: 'await_user' }
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
      return result
    })
    .addNode('verify', verifyNode)
    .addNode('await_user', awaitUserNode)
    .addConditionalEdges(START, (state) =>
      state.mode === 'goal' && !(state.checklist?.length > 0) ? 'plan' : 'act'
    )
    .addEdge('plan', 'act')
    .addConditionalEdges('act', routeAfterAct)
    .addEdge('tools', 'act')
    .addConditionalEdges('verify', routeAfterVerify)
    .addEdge('await_user', 'act')

  return graph.compile()
}
