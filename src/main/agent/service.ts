import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { getSettings } from '../settings/store'
import { buildTools, type ToolContext } from './tools/registry'
import { buildAgentGraph } from './graph'
import { AgentRunLogWriter, mapAgentEventToLog } from './run-log'
import { matchSkills, formatSkillsForPrompt } from '../skills/match'
import { listLongMemory, upsertSessionTask, deleteSessionTask } from '../memory/db'
import { compressWithLlm } from '../memory/compress'
import { appendMessage, getSession, updateSessionRuntime } from '../sessions/store'
import { summarizeSessionTitle } from '../sessions/title'
import type { AgentMode, GoalChecklistItem, TaskSource } from '../../shared/ipc'

export type AgentEvent =
  | { type: 'status'; message: string }
  | { type: 'assistant'; content: string }
  | { type: 'tool'; name: string; detail?: unknown }
  | { type: 'memory'; action: string; entryId?: string; title?: string }
  | { type: 'goal'; goal?: string; checklist?: GoalChecklistItem[] }
  | {
      type: 'task'
      kind: 'add'
      id: string
      title: string
      done?: boolean
      evidence?: string
      source: TaskSource
    }
  | {
      type: 'task'
      kind: 'update'
      id: string
      title?: string
      done?: boolean
      evidence?: string
      source?: TaskSource
    }
  | { type: 'task'; kind: 'remove'; id: string }
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

function upsertChecklistItem(
  list: GoalChecklistItem[],
  record: { id: string; title: string; done: boolean; evidence?: string; source: 'goal' | 'agent' }
): GoalChecklistItem[] {
  const idx = list.findIndex((c) => c.id === record.id)
  const next: GoalChecklistItem = {
    id: record.id,
    title: record.title,
    done: record.done,
    evidence: record.evidence
  }
  if (idx >= 0) {
    const copy = list.slice()
    copy[idx] = next
    return copy
  }
  return [...list, next]
}

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

/** 粗略估算文本 token 数（中文约 1 字≈1 token，英文约 4 字符≈1 token） */
function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const rest = text.length - cjk
  return Math.ceil(cjk + rest / 4)
}

export async function runAgent(args: RunArgs): Promise<void> {
  const { sessionId, message, mode, emit: emitRaw, waitConfirm, resume } = args

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

  let tokenUsed = 0
  const runLog = new AgentRunLogWriter(sessionId)
  const emit = (event: AgentEvent): void => {
    mapAgentEventToLog(runLog, event)
    emitRaw(event)
  }

  try {
    const settings = await getSettings()
    if (!settings.apiKey) {
      emit({ type: 'error', message: '尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证' })
      emit({ type: 'done', reason: 'missing_settings' })
      return
    }

    runLog.start({ mode, resume: Boolean(resume) })
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
      confirmHighRisk: waitConfirm,
      sessionId
    }

    const tools = buildTools(ctx)

    // 记录本次图最后一次 done 事件（segment=内部续段信号，不透传给 UI）
    let lastEmitReason: string | undefined

    const graphEmit = (event: {
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
      source?: TaskSource
      reason?: string
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
        updateSessionRuntime(sessionId, {
          goal: rt.goal ?? null,
          paused: false
        })
        emit({ type: 'goal', goal: rt.goal, checklist: rt.checklist })
      }
      if (event.type === 'done') {
        lastEmitReason = event.reason
        // segment 是段式续跑的内部信号，不结束任务也不通知 UI
        if (event.reason !== 'segment') emit({ type: 'done', reason: event.reason ?? 'completed' })
      }
      if (event.type === 'task' && event.kind && event.id) {
        if (event.kind === 'add' && event.title) {
          const record = upsertSessionTask({
            id: event.id,
            sessionId,
            title: event.title,
            done: event.done,
            evidence: event.evidence,
            source: event.source ?? 'agent'
          })
          rt.checklist = upsertChecklistItem(rt.checklist, record)
          emit({
            type: 'task',
            kind: 'add',
            id: record.id,
            title: record.title,
            done: record.done,
            evidence: record.evidence,
            source: record.source
          })
        } else if (event.kind === 'update') {
          const record = upsertSessionTask({
            id: event.id,
            sessionId,
            title: event.title ?? '',
            done: event.done,
            evidence: event.evidence,
            source: event.source ?? 'goal'
          })
          rt.checklist = upsertChecklistItem(rt.checklist, record)
          emit({
            type: 'task',
            kind: 'update',
            id: record.id,
            title: record.title,
            done: record.done,
            evidence: record.evidence,
            source: record.source
          })
        } else if (event.kind === 'remove') {
          deleteSessionTask(sessionId, event.id)
          rt.checklist = rt.checklist.filter((c) => c.id !== event.id)
          emit({ type: 'task', kind: 'remove', id: event.id })
        }
        updateSessionRuntime(sessionId, {
          goal: rt.goal ?? null,
          checklist: rt.checklist,
          paused: false
        })
      }
    }

    // 段循环：单段 invoke → 落盘 → 未完成自动续段；进程崩溃/重启可从磁盘 checkpoint 恢复
    // totalRound 是累计步数（展示/checkpoint）；段内 round 每段从 0 起，供 graph 判断段边界
    let totalRound = 0
    let lastDoneCount = rt.checklist.filter((c) => c.done).length
    let stagnantRounds = 0
    let runningShortMemory = shortMemory
    let exitReason = 'completed'

    while (true) {
      if (ac.signal.aborted) {
        exitReason = rt.paused ? 'paused' : 'cancelled'
        break
      }

      const graph = buildAgentGraph({
        llm,
        tools,
        emit: graphEmit,
        skillBlock,
        memoryBlock: formatMemoryBlock(),
        sessionId,
        beforeStep: async () => {
          if (ac.signal.aborted) throw new Error('aborted')
          await waitIfPaused(sessionId, emit)
        },
        onStagnate: () => {
          pauseAgent(sessionId)
        },
        budget: {
          stagnationRounds: settings.stagnationRounds ?? 20,
          tokenBudget: settings.tokenBudget ?? 0,
          segmentSteps: settings.segmentSteps ?? 60
        }
      })

      updateSessionRuntime(sessionId, { mode, paused: false })

      const fresh = getSession(sessionId)
      const history = (fresh?.messages ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-20)
        .map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)))

      const finalMessages =
        resume || totalRound > 0
          ? [
              ...(runningShortMemory
                ? [new SystemMessage(`【短期记忆/保关键压缩】\n${runningShortMemory}`)]
                : []),
              ...history,
              new HumanMessage(
                totalRound > 0
                  ? '请从上次落盘点继续推进未完成目标，对照验收清单执行（勿重复已完成项）。'
                  : '请从暂停点继续推进未完成目标，对照验收清单执行。'
              )
            ]
          : [
              ...(runningShortMemory
                ? [new SystemMessage(`【短期记忆/保关键压缩】\n${runningShortMemory}`)]
                : []),
              ...history
            ]

      // recursionLimit 是 LangGraph graph.invoke 强制参数，非业务护栏：
      // 用大常量仅作状态机失控保险丝；真正的护栏是 token 预算 + 停滞检测 + 段式续跑
      // 每次 invoke 前重置段边界信号，避免上一段的 segment 残留导致误续段
      lastEmitReason = undefined

      const result = await graph.invoke(
        {
          messages: finalMessages,
          mode,
          goal: rt.goal ?? '',
          checklist: rt.checklist,
          round: 0,
          lastDoneCount,
          stagnantRounds,
          tokenUsed,
          toolActivityCount: 0,
          lastVerifyToolActivityCount: 0,
          lastAction: ''
        },
        { signal: ac.signal, recursionLimit: 100_000 }
      )

      // 段尾落盘（进度、清单、短期记忆、token）
      rt.goal = (result?.goal as string) || rt.goal
      rt.checklist = (result?.checklist as GoalChecklistItem[]) || rt.checklist
      {
        const next = Number(result?.tokenUsed)
        tokenUsed = Number.isFinite(next) && next >= 0 ? Math.floor(next) : tokenUsed
      }
      totalRound += (result?.round as number) ?? 0
      lastDoneCount = rt.checklist.filter((c) => c.done).length
      stagnantRounds = (result?.stagnantRounds as number) ?? 0

      if (ac.signal.aborted) {
        updateSessionRuntime(sessionId, {
          paused: rt.paused,
          goal: rt.goal ?? null,
          checklist: rt.checklist,
          checkpoint: JSON.stringify({ goal: rt.goal, checklist: rt.checklist, round: totalRound })
        })
        exitReason = rt.paused ? 'paused' : 'cancelled'
        break
      }

      const lastDoneEvent = lastEmitReason
      if (lastDoneEvent === 'segment') {
        // 段边界：仅当上下文水位超过阈值时才压缩短期记忆，否则直接续段以省掉无谓 LLM 调用
        const contextWindow = settings.contextWindow ?? 1_000_000
        const thresholdPct = settings.compressThreshold ?? 60
        const contextUsage =
          estimateTokens(runningShortMemory) + estimateTokens(JSON.stringify(rt.checklist))
        const shouldCompress = contextUsage / contextWindow >= thresholdPct / 100

        if (shouldCompress) {
          runningShortMemory = await compressWithLlm(
            llm,
            [
              runningShortMemory,
              message,
              `目标：${rt.goal ?? ''}\n清单：${JSON.stringify(rt.checklist)}`
            ],
            runningShortMemory
          )
        }
        updateSessionRuntime(sessionId, {
          goal: rt.goal ?? null,
          checklist: rt.checklist,
          shortMemory: runningShortMemory,
          paused: false,
          checkpoint: JSON.stringify({ goal: rt.goal, checklist: rt.checklist, round: totalRound })
        })
        emit({
          type: 'status',
          message: `已完成一段（累计 ${totalRound} 步）${shouldCompress ? '，上下文已压缩' : ''}，自动继续…`
        })
        continue
      }

      // 完成 / 暂停 / 取消 / 错误 → 结束
      break
    }

    if (exitReason === 'completed') {
      const compressed = await compressWithLlm(
        llm,
        [
          runningShortMemory,
          message,
          `目标：${rt.goal ?? ''}\n清单：${JSON.stringify(rt.checklist)}`
        ],
        runningShortMemory
      )
      updateSessionRuntime(sessionId, {
        shortMemory: compressed,
        goal: rt.goal ?? null,
        checklist: rt.checklist,
        paused: false,
        checkpoint: null
      })

      const title = await summarizeSessionTitle(sessionId, llm)
      if (title) emit({ type: 'session', title })
      emit({ type: 'done', reason: 'completed' })
    } else {
      emit({ type: 'done', reason: exitReason })
    }
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
  } finally {
    runtimes.delete(sessionId)
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
