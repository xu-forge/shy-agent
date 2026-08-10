import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { getSettings } from '../settings/store'
import { buildTools, type ToolContext } from './tools/registry'
import { buildAgentGraph } from './graph'
import { matchSkills, formatSkillsForPrompt } from '../skills/match'
import { listLongMemory } from '../memory/db'
import { compressWithLlm } from '../memory/compress'
import {
  appendMessage,
  getSession,
  updateSessionRuntime
} from '../sessions/store'
import { summarizeSessionTitle } from '../sessions/title'
import type { AgentMode, GoalChecklistItem } from '../../shared/ipc'

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant'; content: string }
  | { type: 'tool'; name: string; detail?: unknown }
  | { type: 'memory'; action: string; entryId?: string; title?: string }
  | { type: 'goal'; goal?: string; checklist?: GoalChecklistItem[] }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: string }
  | { type: 'confirm_required'; action: string; detail: string; requestId: string }
  | { type: 'notify'; message: string }
  | { type: 'session'; title?: string }

type RunArgs = {
  sessionId: string
  message: string
  mode: AgentMode
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  resume?: boolean
}

type SessionRuntime = {
  controller: AbortController
  paused: boolean
  pauseWaiters: Array<() => void>
  goal?: string
  checklist: GoalChecklistItem[]
}

const runtimes = new Map<string, SessionRuntime>()

async function waitIfPaused(sessionId: string, emit: (e: AgentEvent) => void): Promise<void> {
  const rt = runtimes.get(sessionId)
  if (!rt?.paused) return
  emit({ type: 'status', message: '已暂停，等待恢复…' })
  await new Promise<void>((resolve) => {
    rt.pauseWaiters.push(resolve)
  })
}

function formatMemoryBlock(): string {
  return listLongMemory()
    .slice(0, 12)
    .map((m) => `- [${m.title}] (v${m.revision}) ${m.content.slice(0, 400)}`)
    .join('\n')
}

export async function runAgent(args: RunArgs): Promise<void> {
  const { sessionId, message, mode, emit, waitConfirm, resume } = args

  const existing = runtimes.get(sessionId)
  if (existing && !existing.controller.signal.aborted && !resume) {
    existing.controller.abort()
  }

  const ac = new AbortController()
  const session = getSession(sessionId)
  const rt: SessionRuntime = {
    controller: ac,
    paused: false,
    pauseWaiters: [],
    goal: session?.goal,
    checklist: session?.checklist ?? []
  }
  runtimes.set(sessionId, rt)

  try {
    const settings = await getSettings()
    if (!settings.apiKey) {
      emit({ type: 'error', message: '尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证' })
      emit({ type: 'done', reason: 'missing_settings' })
      return
    }

    const shortMemory = session?.shortMemory ?? ''
    emit({
      type: 'status',
      message: resume ? '从暂停点恢复…' : mode === 'goal' ? '目标模式启动…' : '交互式运行中…'
    })

    if (!resume) {
      appendMessage(sessionId, 'user', message)
    }

    const llm = new ChatOpenAI({
      model: settings.model,
      apiKey: settings.apiKey,
      configuration: { baseURL: settings.baseURL },
      temperature: 0.2
    })

    const matched = await matchSkills(message || session?.goal || '', 3)
    const skillBlock = formatSkillsForPrompt(matched)
    if (matched.length) {
      emit({
        type: 'notify',
        message: `已匹配技能：${matched.map((s) => s.name).join('、')}`
      })
    }

    const ctx: ToolContext = {
      emit: (event, payload) => {
        if (event === 'tool') {
          const p = payload as { name?: string }
          emit({ type: 'tool', name: p.name ?? 'tool', detail: payload })
        } else if (event === 'memory') {
          const p = payload as { action: string; entryId?: string; title?: string }
          emit({ type: 'memory', ...p })
        }
      },
      confirmHighRisk: waitConfirm
    }

    const tools = buildTools(ctx)

    const graphEmit = (event: {
      type: string
      message?: string
      content?: string
      checklist?: GoalChecklistItem[]
      goal?: string
      name?: string
      detail?: unknown
    }): void => {
      if (event.type === 'status' && event.message) emit({ type: 'status', message: event.message })
      if (event.type === 'assistant' && event.content) {
        emit({ type: 'assistant', content: event.content })
        appendMessage(sessionId, 'assistant', event.content)
      }
      if (event.type === 'tool') {
        emit({ type: 'tool', name: event.name ?? 'tool', detail: event.detail })
      }
      if (event.type === 'goal') {
        rt.goal = event.goal ?? rt.goal
        if (event.checklist) rt.checklist = event.checklist
        updateSessionRuntime(sessionId, {
          goal: rt.goal ?? null,
          checklist: rt.checklist,
          paused: false
        })
        emit({ type: 'goal', goal: rt.goal, checklist: rt.checklist })
      }
    }

    const graph = buildAgentGraph({
      llm,
      tools,
      emit: graphEmit,
      skillBlock,
      memoryBlock: formatMemoryBlock(),
      beforeStep: async () => {
        if (ac.signal.aborted) throw new Error('aborted')
        await waitIfPaused(sessionId, emit)
      },
      onStagnate: () => {
        pauseAgent(sessionId)
      },
      budget: {
        stagnationRounds: settings.stagnationRounds ?? 20,
        hardRoundCap: settings.hardRoundCap ?? 0
      }
    })

    updateSessionRuntime(sessionId, { mode, paused: false })

    const fresh = getSession(sessionId)
    const history = (fresh?.messages ?? [])
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-20)
      .map((m) =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
      )

    const finalMessages = resume
      ? [
          ...(shortMemory ? [new SystemMessage(`【短期记忆/保关键压缩】\n${shortMemory}`)] : []),
          ...history,
          new HumanMessage('请从暂停点继续推进未完成目标，对照验收清单执行。')
        ]
      : [
          ...(shortMemory ? [new SystemMessage(`【短期记忆/保关键压缩】\n${shortMemory}`)] : []),
          ...history
        ]

    // LangGraph 递归保险丝：足够高以支撑长任务；真正控空转靠「清单无进展 → 软暂停」
    const recursionLimit =
      settings.recursionLimit ?? (mode === 'goal' ? 500 : 80)

    const result = await graph.invoke(
      {
        messages: finalMessages,
        mode,
        goal: rt.goal ?? '',
        checklist: rt.checklist,
        round: 0,
        lastDoneCount: rt.checklist.filter((c) => c.done).length,
        stagnantRounds: 0,
        lastAction: ''
      },
      { signal: ac.signal, recursionLimit }
    )

    if (ac.signal.aborted) {
      updateSessionRuntime(sessionId, {
        paused: rt.paused,
        goal: rt.goal ?? null,
        checklist: rt.checklist,
        checkpoint: JSON.stringify({
          goal: rt.goal,
          checklist: rt.checklist,
          round: result?.round
        })
      })
      emit({ type: 'done', reason: rt.paused ? 'paused' : 'cancelled' })
      return
    }

    const compressed = await compressWithLlm(
      llm,
      [
        shortMemory,
        message,
        result?.goal
          ? `目标：${result.goal}\n清单：${JSON.stringify(result.checklist ?? [])}`
          : ''
      ],
      shortMemory
    )
    updateSessionRuntime(sessionId, {
      shortMemory: compressed,
      goal: (result?.goal as string) || rt.goal || null,
      checklist: (result?.checklist as GoalChecklistItem[]) || rt.checklist,
      paused: false,
      checkpoint: null
    })

    const title = await summarizeSessionTitle(sessionId, llm)
    if (title) emit({ type: 'session', title })

    emit({ type: 'done', reason: 'completed' })
  } catch (err) {
    if (ac.signal.aborted) {
      emit({ type: 'done', reason: rt.paused ? 'paused' : 'cancelled' })
      return
    }
    const messageText = err instanceof Error ? err.message : String(err)
    if (messageText === 'aborted') {
      emit({ type: 'done', reason: rt.paused ? 'paused' : 'cancelled' })
      return
    }
    emit({ type: 'error', message: messageText })
    emit({ type: 'done', reason: 'error' })
  }
}

export function cancelAgent(sessionId: string): void {
  const rt = runtimes.get(sessionId)
  if (!rt) return
  rt.paused = false
  rt.pauseWaiters.forEach((r) => r())
  rt.pauseWaiters = []
  rt.controller.abort()
  updateSessionRuntime(sessionId, { paused: false })
  runtimes.delete(sessionId)
}

export function pauseAgent(sessionId: string): void {
  const rt = runtimes.get(sessionId)
  if (!rt) return
  rt.paused = true
  updateSessionRuntime(sessionId, {
    paused: true,
    goal: rt.goal ?? null,
    checklist: rt.checklist
  })
}

export function resumeAgent(
  sessionId: string,
  emit: (event: AgentEvent) => void,
  waitConfirm: (action: string, detail: string) => Promise<boolean>
): void {
  const rt = runtimes.get(sessionId)
  if (rt?.paused && rt.pauseWaiters.length) {
    rt.paused = false
    updateSessionRuntime(sessionId, { paused: false })
    const waiters = [...rt.pauseWaiters]
    rt.pauseWaiters = []
    waiters.forEach((r) => r())
    return
  }
  const session = getSession(sessionId)
  if (!session) {
    emit({ type: 'error', message: '会话不存在，无法恢复' })
    emit({ type: 'done', reason: 'error' })
    return
  }
  updateSessionRuntime(sessionId, { paused: false })
  void runAgent({
    sessionId,
    message: session.goal || '继续',
    mode: session.mode,
    emit,
    waitConfirm,
    resume: true
  })
}
