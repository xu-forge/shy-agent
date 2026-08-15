import { ChatOpenAI } from '@langchain/openai'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { GoalChecklistItem, RunStatus } from '../../shared/ipc'
import { getSession, updateSessionRuntime, appendMessage } from '../sessions/store'
import { getSettings } from '../settings/store'
import type { AgentEvent } from './service'
import type { CheckRunResult } from './checks'
import { runCheckCommand } from './checks'
import {
  applyCheckResults,
  assertCanStart,
  buildFailureFeedback,
  isGoalComplete,
  nextStagnantRounds
} from './goal-policy'
import { buildAgentGraph, mapChecklistItem } from './graph'
import { buildTools, type ToolContext } from './tools/registry'

export const GOAL_PLAN_SYSTEM_PROMPT = `你是目标规划器。根据用户目标输出 JSON：
{"goal":"...","checklist":[{"id":"1","title":"...","done":false,"check":"可在本机运行的 shell 命令"}]}
清单 3-8 步，可验证。check 必须是可在本机运行的 shell 命令，不要写描述性句子。只输出 JSON。`

export type GoalDriverPersistPatch = {
  goal?: string | null
  checklist?: GoalChecklistItem[]
  verifyCommand?: string | null
  runStatus?: RunStatus
  approvedChecks?: string[]
  paused?: boolean
  checkpoint?: string | null
}

export async function runGoalDriver(args: {
  sessionId: string
  message: string
  verifyCommand?: string
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  resume?: boolean
  planChecklist?: (goal: string) => Promise<{ goal: string; checklist: GoalChecklistItem[] }>
  runBurst?: (input: {
    goal: string
    checklist: GoalChecklistItem[]
    feedback?: string
  }) => Promise<{
    tokenUsed: number
    round: number
  }>
  runCheck?: typeof runCheckCommand
  persist?: (patch: GoalDriverPersistPatch) => void
}): Promise<void> {
  const { sessionId, message, emit, waitConfirm, resume } = args
  const runCheck = args.runCheck ?? runCheckCommand
  const persist =
    args.persist ??
    ((patch: GoalDriverPersistPatch) => {
      updateSessionRuntime(sessionId, patch)
    })

  const session = getSession(sessionId)
  if (!session) {
    emit({ type: 'error', message: '会话不存在' })
    emit({ type: 'done', reason: 'error' })
    return
  }

  const { ensureAgentRuntime } = await import('./service')
  const rt = ensureAgentRuntime(sessionId)

  const storedVerify = session.verifyCommand?.trim() ?? ''
  const incomingVerify = args.verifyCommand?.trim() ?? ''
  if (!storedVerify && incomingVerify) {
    persist({ verifyCommand: incomingVerify })
  }
  const verifyCommand = storedVerify || incomingVerify

  let goal = session.goal || message
  let checklist: GoalChecklistItem[] = session.checklist ?? []
  let approved = new Set(session.approvedChecks ?? [])
  let stagnantRounds = 0
  let tokenUsed = 0
  let feedback: string | undefined
  let totalRound = 0

  const planChecklist = args.planChecklist ?? ((g: string) => defaultPlanChecklist(g, emit))
  const runBurst =
    args.runBurst ??
    ((input) =>
      defaultRunBurst({
        sessionId,
        emit,
        waitConfirm,
        signal: rt.controller.signal,
        input
      }))

  if (checklist.length === 0) {
    emit({ type: 'status', message: '规划目标与验收清单…' })
    const planned = await planChecklist(goal)
    goal = planned.goal
    checklist = planned.checklist
    rt.goal = goal
    rt.checklist = checklist
    persist({ goal, checklist })
    emit({ type: 'goal', goal, checklist })
  }

  const gate = assertCanStart({ verifyCommand, checklist })
  if (!gate.ok) {
    emit({ type: 'error', message: gate.reason })
    persist({ runStatus: 'idle', goal, checklist })
    emit({ type: 'done', reason: 'error' })
    return
  }

  persist({ runStatus: 'running', goal, checklist, paused: false })

  const finishStop = (status: 'paused' | 'cancelled'): void => {
    persist({
      runStatus: status,
      paused: status === 'paused',
      goal,
      checklist,
      approvedChecks: [...approved],
      checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
    })
    emit({ type: 'done', reason: status })
  }

  const shouldStop = (): 'paused' | 'cancelled' | null => {
    if (rt.controller.signal.aborted) return rt.paused ? 'paused' : 'cancelled'
    if (rt.paused) return 'paused'
    return null
  }

  try {
    const settings = await getSettings()
    const stagnationLimit = settings.stagnationRounds ?? 20
    const tokenBudget = settings.tokenBudget ?? 0

    const runCheckRound = async (): Promise<{
      overall?: CheckRunResult
      failures: Array<{ title: string; exitCode: number; evidence: string }>
    }> => {
      const byId: Record<string, CheckRunResult> = {}
      const failures: Array<{ title: string; exitCode: number; evidence: string }> = []

      for (const item of checklist.filter((i) => !i.done && i.check?.trim())) {
        const { result, approved: nextApproved } = await runCheck({
          command: item.check!.trim(),
          approved,
          pinned: false,
          confirm: waitConfirm
        })
        approved = nextApproved
        byId[item.id] = result
        if (!isPassed(result)) {
          failures.push({ title: item.title, exitCode: result.exitCode, evidence: result.output })
        }
      }

      checklist = applyCheckResults(checklist, byId)
      rt.checklist = checklist

      let overall: CheckRunResult | undefined
      const itemsAllDone = checklist.length === 0 || checklist.every((item) => item.done)
      if (itemsAllDone && verifyCommand) {
        const { result, approved: nextApproved } = await runCheck({
          command: verifyCommand,
          approved,
          pinned: true,
          confirm: waitConfirm
        })
        approved = nextApproved
        overall = result
        if (!isPassed(result)) {
          failures.push({ title: '总验收', exitCode: result.exitCode, evidence: result.output })
        }
      }

      persist({
        goal,
        checklist,
        approvedChecks: [...approved],
        checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
      })

      return { overall, failures }
    }

    const concludeAfterChecks = (overall?: CheckRunResult): boolean => {
      if (!isGoalComplete({ checklist, verifyCommand, overall })) return false
      persist({
        runStatus: 'completed',
        paused: false,
        goal,
        checklist,
        approvedChecks: [...approved],
        checkpoint: null
      })
      emit({ type: 'done', reason: 'completed' })
      return true
    }

    if (resume && (session.checklist?.length ?? 0) > 0) {
      const stop = shouldStop()
      if (stop) {
        finishStop(stop)
        return
      }
      const { overall, failures } = await runCheckRound()
      const stopAfterChecks = shouldStop()
      if (stopAfterChecks) {
        finishStop(stopAfterChecks)
        return
      }
      if (concludeAfterChecks(overall)) return
      if (failures.length) feedback = buildFailureFeedback(failures)
    }

    while (true) {
      const stop = shouldStop()
      if (stop) {
        finishStop(stop)
        return
      }

      const burstResult = await runBurst({ goal, checklist, feedback })

      tokenUsed += Number.isFinite(burstResult.tokenUsed) ? Math.max(0, burstResult.tokenUsed) : 0
      totalRound += Number.isFinite(burstResult.round) ? Math.max(0, burstResult.round) : 0

      const stopAfterBurst = shouldStop()
      if (stopAfterBurst) {
        finishStop(stopAfterBurst)
        return
      }

      const passedBefore = checklist.filter((item) => item.done).length
      const { overall, failures } = await runCheckRound()
      const passedAfter = checklist.filter((item) => item.done).length
      const overallPassed = overall != null && isPassed(overall)

      const stopAfterChecks = shouldStop()
      if (stopAfterChecks) {
        finishStop(stopAfterChecks)
        return
      }

      if (concludeAfterChecks(overall)) return

      stagnantRounds = nextStagnantRounds({
        prev: stagnantRounds,
        passedBefore,
        passedAfter,
        overallPassed
      })

      if (stagnantRounds >= stagnationLimit) {
        emit({ type: 'status', message: '验收连续无进展，已暂停' })
        finishStop('paused')
        return
      }

      if (tokenBudget > 0 && tokenUsed >= tokenBudget) {
        emit({ type: 'status', message: '已触及 token 预算' })
        finishStop('paused')
        return
      }

      feedback = buildFailureFeedback(failures)
      persist({
        runStatus: 'running',
        paused: false,
        goal,
        checklist,
        approvedChecks: [...approved],
        checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
      })
    }
  } catch (err) {
    const stop = shouldStop()
    if (stop) {
      finishStop(stop)
      return
    }
    persist({
      runStatus: 'idle',
      paused: false,
      goal,
      checklist,
      approvedChecks: [...approved],
      checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
    })
    const messageText = err instanceof Error ? err.message : String(err)
    emit({ type: 'error', message: messageText })
    emit({ type: 'done', reason: 'error' })
  }
}

function isPassed(result: CheckRunResult): boolean {
  return result.exitCode === 0 && !result.denied && !result.timedOut
}

export function parsePlanOutput(
  text: string,
  fallbackGoal: string
): { goal: string; checklist: GoalChecklistItem[] } {
  const parsed = parseJsonObject(text)
  const checklist: GoalChecklistItem[] = Array.isArray(parsed?.checklist)
    ? (parsed!.checklist as Array<Record<string, unknown>>).map((c, i) => mapChecklistItem(c, i))
    : [{ id: '1', title: fallbackGoal.slice(0, 80), done: false }]
  return {
    goal: String(parsed?.goal ?? fallbackGoal),
    checklist
  }
}

async function defaultPlanChecklist(
  goal: string,
  emit: (event: AgentEvent) => void
): Promise<{ goal: string; checklist: GoalChecklistItem[] }> {
  const settings = await getSettings()
  if (!settings.apiKey) {
    throw new Error('尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证')
  }
  const llm = new ChatOpenAI({
    model: settings.model,
    apiKey: settings.apiKey,
    configuration: { baseURL: settings.baseURL },
    temperature: 0.2
  })
  const res = await llm.invoke([new SystemMessage(GOAL_PLAN_SYSTEM_PROMPT), new HumanMessage(goal)])
  const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content)
  const planned = parsePlanOutput(text, goal)
  emit({ type: 'status', message: '已生成验收清单' })
  return planned
}

async function defaultRunBurst(opts: {
  sessionId: string
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  signal: AbortSignal
  input: { goal: string; checklist: GoalChecklistItem[]; feedback?: string }
}): Promise<{ tokenUsed: number; round: number }> {
  const { sessionId, emit, waitConfirm, signal, input } = opts
  const settings = await getSettings()
  if (!settings.apiKey) {
    throw new Error('尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证')
  }

  const llm = new ChatOpenAI({
    model: settings.model,
    apiKey: settings.apiKey,
    configuration: { baseURL: settings.baseURL },
    temperature: 0.2
  })

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

  const graph = buildAgentGraph({
    llm,
    tools: buildTools(ctx),
    emit: (event) => {
      if (event.type === 'status' && event.message) emit({ type: 'status', message: event.message })
      if (event.type === 'assistant' && event.content) {
        emit({ type: 'assistant', content: event.content })
        appendMessage(sessionId, 'assistant', event.content)
      }
      if (event.type === 'tool') {
        emit({ type: 'tool', name: event.name ?? 'tool', detail: event.detail })
      }
    },
    skillBlock: '',
    memoryBlock: '',
    sessionId,
    beforeStep: async () => {
      if (signal.aborted) throw new Error('aborted')
    },
    budget: {
      stagnationRounds: settings.stagnationRounds ?? 20,
      tokenBudget: settings.tokenBudget ?? 0,
      segmentSteps: settings.segmentSteps ?? 60
    }
  })

  const fresh = getSession(sessionId)
  const history = (fresh?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)))

  const messages = [...history, ...(input.feedback ? [new HumanMessage(input.feedback)] : [])]

  const result = await graph.invoke(
    {
      messages,
      mode: 'goal' as const,
      goal: input.goal,
      checklist: input.checklist,
      round: 0,
      lastDoneCount: input.checklist.filter((c) => c.done).length,
      stagnantRounds: 0,
      tokenUsed: 0,
      toolActivityCount: 0,
      lastVerifyToolActivityCount: 0,
      lastAction: ''
    },
    { signal, recursionLimit: 100_000 }
  )

  return {
    tokenUsed: Number.isFinite(Number(result?.tokenUsed))
      ? Math.max(0, Number(result.tokenUsed))
      : 0,
    round: Number.isFinite(Number(result?.round)) ? Math.max(0, Number(result.round)) : 0
  }
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
