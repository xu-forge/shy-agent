import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ActiveView, GoalChecklistItem, RunStatus } from '../../shared/ipc'
import { getSession, updateSessionRuntime, appendMessage, getCheckpoint } from '../sessions/store'
import { getSettings } from '../settings/store'
import { getShyPaths } from '../paths'
import { resolveAgentWorkspace } from '../projects/workspace'
import type { AgentEvent } from './service'
import type { CheckRunResult } from './checks'
import { runCheckCommand } from './checks'
import {
  applyCheckResults,
  assertCanStart,
  buildFailureFeedback,
  freezeGoal,
  isGoalComplete,
  nextStagnantRounds,
  shouldDeliver
} from './goal-policy'
import { buildAgentGraph, mapChecklistItem } from './graph'
import { buildTools, type ToolContext } from './tools/registry'
import { buildGoalTools, type GoalSnapshot } from './goal-tools'
import { runVerifyLLM, applyBlockedAudit, type VerifyLLMResult } from './verify-llm'
import { invokeChatCompletion, type LLMMessage } from './llm-client'
import { getEnabledSkillEntries } from '../skills/store'
import { renderSkillCatalog } from '../skills/catalog'
import { listLongMemory } from '../memory/db'
import { waitAskUser } from '../ask-user'

export const GOAL_PLAN_SYSTEM_PROMPT = `你是步骤规划器。根据用户目标只输出步骤 JSON：
{"checklist":[{"id":"1","title":"...","done":false,"check":"可在本机运行的 shell 命令"}]}
清单 3-8 步。check 必须是可在本机运行的 shell 命令；没有可执行检查则省略 check。不要输出 goal 字段。只输出 JSON。`

export type GoalDriverPersistPatch = {
  goal?: string | null
  checklist?: GoalChecklistItem[]
  verifyCommand?: string | null
  runStatus?: RunStatus
  approvedChecks?: string[]
  paused?: boolean
  checkpoint?: string | null
  resultContent?: string | null
  resultReportPath?: string | null
}

export async function runGoalDriver(args: {
  sessionId: string
  message: string
  verifyCommand?: string
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  resume?: boolean
  /** 本轮发送瞬间的查看文件快照；不写入 session */
  activeView?: ActiveView
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
  deliver?: (input: {
    goal: string
    checklist: GoalChecklistItem[]
  }) => Promise<{ content: string; isReport: boolean }>
}): Promise<void> {
  const { sessionId, message, emit, waitConfirm, resume } = args
  const runCheck = args.runCheck ?? runCheckCommand
  const deliverFn =
    args.deliver ??
    ((input: { goal: string; checklist: GoalChecklistItem[] }) => defaultDeliver(input))
  const persist =
    args.persist ??
    ((patch: GoalDriverPersistPatch) => {
      updateSessionRuntime(sessionId, patch)
    })

  // 可变 refs（goal-driver 主循环 + defaultRunBurst 共享）
  const auditOkRef: { current: boolean } = { current: true }
  const blockedRoundsRef: { current: number } = { current: 0 }
  const tokenUsedRef: { current: number } = { current: 0 }

  const session = getSession(sessionId)
  if (!session) {
    emit({ type: 'error', message: '会话不存在' })
    emit({ type: 'done', reason: 'error' })
    return
  }

  const { ensureAgentRuntime, waitIfPaused, getAgentRuntime } = await import('./service')
  const rt = ensureAgentRuntime(sessionId)
  const persistIfOwner = (patch: GoalDriverPersistPatch): void => {
    if (getAgentRuntime(sessionId) !== rt) return
    persist(patch)
  }

  const storedVerify = session.verifyCommand?.trim() ?? ''
  const incomingVerify = args.verifyCommand?.trim() ?? ''
  if (!storedVerify && incomingVerify) {
    persist({ verifyCommand: incomingVerify })
  }
  const verifyCommand = storedVerify || incomingVerify

  const goal = freezeGoal(session.goal, message)
  persistIfOwner({ goal })
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
        input,
        auditOkRef,
        blockedRoundsRef,
        tokenUsedRef,
        ...(args.activeView ? { activeView: args.activeView } : {})
      }))

  if (checklist.length === 0) {
    emit({ type: 'status', message: '规划步骤…' })
    const planned = await planChecklist(goal)
    checklist = planned.checklist
    rt.goal = goal
    rt.checklist = checklist
    persistIfOwner({ goal, checklist })
    emit({ type: 'goal', goal, checklist })
  }

  const gate = assertCanStart({ verifyCommand, checklist })
  if (!gate.ok) {
    emit({ type: 'error', message: gate.reason })
    persistIfOwner({ runStatus: 'idle', goal, checklist })
    emit({ type: 'done', reason: 'error' })
    return
  }

  if (verifyCommand && !approved.has(verifyCommand)) {
    const ok = await waitConfirm('执行验收命令', verifyCommand)
    if (!ok) {
      emit({ type: 'error', message: '用户拒绝验收命令' })
      persistIfOwner({ runStatus: 'idle', goal, checklist, paused: false })
      emit({ type: 'done', reason: 'error' })
      return
    }
    approved.add(verifyCommand)
  }

  persistIfOwner({
    runStatus: 'running',
    goal,
    checklist,
    paused: false,
    approvedChecks: [...approved]
  })

  const finishStop = (status: 'paused' | 'cancelled'): void => {
    persistIfOwner({
      runStatus: status,
      paused: status === 'paused',
      goal,
      checklist,
      approvedChecks: [...approved],
      checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
    })
    if (getAgentRuntime(sessionId) !== rt) return
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

    const gatePauseOrAbort = async (): Promise<void> => {
      if (rt.controller.signal.aborted) throw new Error('aborted')
      await waitIfPaused(sessionId, emit)
      if (rt.controller.signal.aborted) throw new Error('aborted')
    }

    const runCheckRound = async (): Promise<{
      overall?: CheckRunResult
      failures: Array<{ title: string; exitCode: number; evidence: string }>
    }> => {
      const byId: Record<string, CheckRunResult> = {}
      const failures: Array<{ title: string; exitCode: number; evidence: string }> = []

      for (const item of checklist.filter((i) => !i.done && i.check?.trim())) {
        await gatePauseOrAbort()
        const { result, approved: nextApproved } = await runCheck({
          command: item.check!.trim(),
          approved,
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
      const readyForOverall = shouldDeliver({ checklist, hadWorkSegment: true })
      if (readyForOverall && verifyCommand) {
        await gatePauseOrAbort()
        const { result, approved: nextApproved } = await runCheck({
          command: verifyCommand,
          approved,
          confirm: waitConfirm
        })
        approved = nextApproved
        overall = result
        if (!isPassed(result)) {
          failures.push({ title: '总验收', exitCode: result.exitCode, evidence: result.output })
        }
      }

      persistIfOwner({
        goal,
        checklist,
        approvedChecks: [...approved],
        checkpoint: JSON.stringify({ goal, checklist, round: totalRound })
      })
      if (getAgentRuntime(sessionId) === rt) {
        emit({ type: 'goal', goal, checklist })
      }

      return { overall, failures }
    }

    const concludeAfterChecks = async (
      overall: CheckRunResult | undefined,
      hadWorkSegment: boolean,
      auditFailures?: { requirements: string[]; unsatisfied: string[] }
    ): Promise<boolean> => {
      if (
        !isGoalComplete({
          checklist,
          verifyCommand,
          overall,
          hadWorkSegment,
          auditCheck: auditOkRef.current
            ? { requirements: [], eachSatisfied: true }
            : { requirements: auditFailures?.requirements ?? [], eachSatisfied: false }
        })
      ) {
        if (auditFailures) {
          emit({ type: 'status', message: 'completion audit 未通过；继续推进' })
        }
        return false
      }
      const delivered = await deliverFn({ goal, checklist })
      let reportPath: string | undefined
      if (delivered.isReport && delivered.content.trim()) {
        const dir = getShyPaths().reportsDir
        mkdirSync(dir, { recursive: true })
        reportPath = join(dir, `${sessionId}-${Date.now()}.md`)
        writeFileSync(reportPath, delivered.content, 'utf8')
      }
      persistIfOwner({
        runStatus: 'completed',
        paused: false,
        goal,
        checklist,
        approvedChecks: [...approved],
        checkpoint: null,
        resultContent: delivered.content,
        resultReportPath: reportPath ?? null
      })
      if (getAgentRuntime(sessionId) === rt) {
        emit({ type: 'result', content: delivered.content, reportPath })
        appendMessage(sessionId, 'assistant', delivered.content, 'result')
        emit({ type: 'done', reason: 'completed' })
      }
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
      // verify LLM：段尾自检 + blocked 判定
      const blockedAudit = await runVerifyPhase(
        goal,
        checklist,
        auditOkRef,
        blockedRoundsRef,
        emit,
        settings
      )
      if (blockedAudit.shouldPause) {
        finishStop('paused')
        return
      }
      if (
        await concludeAfterChecks(
          overall,
          true,
          auditOkRef.current
            ? undefined
            : { requirements: [], unsatisfied: ['completion audit 未通过'] }
        )
      )
        return
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

      // verify LLM：段尾自检 + blocked 判定
      const blockedAudit = await runVerifyPhase(
        goal,
        checklist,
        auditOkRef,
        blockedRoundsRef,
        emit,
        settings
      )
      if (blockedAudit.shouldPause) {
        finishStop('paused')
        return
      }

      if (
        await concludeAfterChecks(
          overall,
          true,
          auditOkRef.current
            ? undefined
            : { requirements: [], unsatisfied: ['completion audit 未通过'] }
        )
      )
        return

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
      persistIfOwner({
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
    persistIfOwner({
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
    goal: fallbackGoal,
    checklist
  }
}

function assembleFallback(goal: string, checklist: GoalChecklistItem[]): string {
  const steps = checklist
    .map((c) => `- ${c.title}${c.evidence ? `\n  ${c.evidence}` : ''}`)
    .join('\n')
  return `## 完整结果\n\n目标：${goal}\n\n${steps || '（无步骤产物）'}`
}

async function runVerifyPhase(
  goal: string,
  checklist: GoalChecklistItem[],
  auditOkRef: { current: boolean },
  blockedRoundsRef: { current: number },
  emit: (event: AgentEvent) => void,
  settings: { blockedAuditRounds?: number; enableGoalCompleteReport?: boolean }
): Promise<{ shouldPause: boolean; result?: VerifyLLMResult }> {
  const auditRounds = settings.blockedAuditRounds ?? 3
  const result = await runVerifyLLM({ goal, checklist })
  if (!result.ok || !result.output) {
    return { shouldPause: false }
  }
  // 写 auditOk
  auditOkRef.current = result.output.auditCheck.eachSatisfied
  // 写 blockedRounds + 判定暂停
  const blockedAudit = applyBlockedAudit({
    prevBlockedRounds: blockedRoundsRef.current,
    blocked: result.output.blocked,
    blockedAuditRounds: auditRounds
  })
  blockedRoundsRef.current = blockedAudit.newBlockedRounds
  if (blockedAudit.shouldPause) {
    emit({
      type: 'blocked',
      rounds: blockedAudit.newBlockedRounds,
      reason: result.output.blocked.reason ?? 'verify LLM 连续判定同条件重复'
    })
    return { shouldPause: true, result }
  }
  return { shouldPause: false, result }
}

async function defaultDeliver(input: {
  goal: string
  checklist: GoalChecklistItem[]
}): Promise<{ content: string; isReport: boolean }> {
  const fallback = { content: assembleFallback(input.goal, input.checklist), isReport: false }
  try {
    const settings = await getSettings()
    if (!settings.apiKey) return fallback
    const evidence = input.checklist
      .map((c) => `## ${c.title}\n${c.evidence ?? '（无证据）'}`)
      .join('\n\n')
    const { content: resContent } = await invokeChatCompletion(
      { baseURL: settings.baseURL, apiKey: settings.apiKey, model: settings.model },
      [
        {
          role: 'system',
          content: `对照总目标汇总各步产物，输出 JSON：{"content":"完整结果 Markdown","isReport":true/false}。
isReport 在新闻总结、周报、调研等文档型交付时为 true。只输出 JSON。content 必须覆盖目标与各步要点，不要寒暄。`
        },
        { role: 'user', content: `总目标：${input.goal}\n\n各步证据：\n${evidence}` }
      ] as LLMMessage[]
    )
    const text = resContent
    const parsed = parseJsonObject(text)
    const content = String(parsed?.content ?? '').trim()
    if (!content) return fallback
    return { content, isReport: Boolean(parsed?.isReport) }
  } catch {
    return fallback
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
  const { content: resContent } = await invokeChatCompletion(
    { baseURL: settings.baseURL, apiKey: settings.apiKey, model: settings.model },
    [
      { role: 'system', content: GOAL_PLAN_SYSTEM_PROMPT },
      { role: 'user', content: goal }
    ] as LLMMessage[]
  )
  const res = { content: resContent }
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
  auditOkRef: { current: boolean }
  blockedRoundsRef: { current: number }
  tokenUsedRef: { current: number }
  activeView?: ActiveView
}): Promise<{ tokenUsed: number; round: number }> {
  const { sessionId, emit, waitConfirm, signal, input } = opts
  const { waitIfPaused } = await import('./service')
  const settings = await getSettings()
  if (!settings.apiKey) {
    throw new Error('尚未配置 apiKey，请先在设置中填写 OpenAI-compatible 凭证')
  }

  // llm 配置传 buildAgentGraph（不再需要 ChatOpenAI 实例）
  const getSnapshot = (): GoalSnapshot => {
    const s = getSession(sessionId)
    const checklist = s?.checklist ?? []
    const done = checklist.filter((c) => c.done).length
    const tokenBudget = settings.tokenBudget ?? 0
    return {
      goal: s?.goal ?? input.goal,
      checklist: checklist.map((c) => ({ id: c.id, title: c.title, done: c.done, check: c.check })),
      runStatus: s?.runStatus ?? 'running',
      progress: { done, total: checklist.length },
      budget: {
        tokenUsed: opts.tokenUsedRef.current,
        tokenBudget,
        pct:
          tokenBudget > 0
            ? Math.min(100, Math.round((opts.tokenUsedRef.current / tokenBudget) * 100))
            : 0,
        disabled: tokenBudget <= 0
      },
      stagnantRounds: 0,
      blockedRounds: opts.blockedRoundsRef.current,
      blockedAuditRounds: settings.blockedAuditRounds ?? 3,
      paused: s?.paused ?? false,
      checkpoint: getCheckpoint(sessionId)
    }
  }

  const ctx: ToolContext = {
    emit: (event, payload) => {
      if (event === 'memory') {
        const p = payload as { action: string; entryId?: string; title?: string }
        emit({ type: 'memory', ...p })
      }
    },
    confirmHighRisk: waitConfirm,
    askUser: (question, options) => waitAskUser(question, options, sessionId),
    sessionId,
    workspaceDir: resolveAgentWorkspace(sessionId)
  }

  const goalTools = buildGoalTools({
    sessionId,
    emit,
    getSnapshot,
    auditOkRef: opts.auditOkRef,
    blockedAuditRounds: settings.blockedAuditRounds ?? 3,
    enableGoalCompleteReport: settings.enableGoalCompleteReport ?? true
  })

  // 目标模式思考流文本（每步工具调用前落盘一次，供会话回放）
  let pendingAssistantText = ''

  // 技能目录 + 长期记忆（与交互式 service.ts 同源同预算）
  const goalSkillCatalog = renderSkillCatalog(
    await getEnabledSkillEntries(),
    Math.floor((settings.contextWindow ?? 1_000_000) * 0.02)
  ).text
  const goalMemoryBlock = listLongMemory()
    .slice(0, 12)
    .map((m) => `- [${m.title}] (v${m.revision}) ${m.content.slice(0, 400)}`)
    .join('\n')

  const graph = buildAgentGraph({
    llm: {
      baseURL: settings.baseURL,
      apiKey: settings.apiKey,
      model: settings.model
    },
    tools: [...buildTools(ctx), ...goalTools],
    emit: (event) => {
      if (event.type === 'status' && event.message) emit({ type: 'status', message: event.message })
      if (event.type === 'assistant' && event.content) {
        emit({ type: 'assistant', content: event.content })
        appendMessage(sessionId, 'assistant', event.content)
      }
      // 目标模式的思考过程流（与交互式 service.ts 一致）— 否则 UI 只能看到工具调用链
      if (event.type === 'assistant_delta' && event.content) {
        pendingAssistantText += event.content
        emit({ type: 'assistant_delta', content: event.content })
      }
      if (event.type === 'reasoning_delta' && event.content) {
        emit({ type: 'reasoning_delta', content: event.content })
      }
      if (event.type === 'reasoning_done') {
        emit({ type: 'reasoning_done' })
      }
      if (event.type === 'tool_call' && event.id) {
        // 工具调用开始 = 上一段思考流已完整：落盘 + 停掉渲染层打字光标
        if (pendingAssistantText.trim()) {
          appendMessage(sessionId, 'assistant', pendingAssistantText)
          pendingAssistantText = ''
        }
        emit({ type: 'assistant_done' })
        emit({ type: 'tool_call', id: event.id, name: event.name ?? 'tool', input: event.input })
      }
      if (event.type === 'tool_result' && event.id) {
        emit({ type: 'tool_result', id: event.id, output: event.output, error: event.error })
      }
      if (event.type === 'error' && event.message) {
        emit({ type: 'error', message: event.message })
      }
      if (event.type === 'tool') {
        emit({ type: 'tool', name: event.name ?? 'tool', detail: event.detail })
      }
    },
    // 与交互式 service.ts 同源：目标模式同样注入技能目录与长期记忆
    // （此前为空串 —— 目标模式既看不到技能也没有记忆，属功能缺陷）
    skillBlock: goalSkillCatalog,
    memoryBlock: goalMemoryBlock,
    sessionId,
    beforeStep: async () => {
      if (signal.aborted) throw new Error('aborted')
      await waitIfPaused(sessionId, emit)
    },
    budget: {
      stagnationRounds: settings.stagnationRounds ?? 20,
      tokenBudget: settings.tokenBudget ?? 0,
      segmentSteps: settings.segmentSteps ?? 60,
      blockedAuditRounds: settings.blockedAuditRounds ?? 3
    },
    signal,
    ...(opts.activeView ? { activeView: opts.activeView } : {})
  })

  const fresh = getSession(sessionId)
  const history = (fresh?.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-20)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const messages = [
    ...history,
    ...(input.feedback ? [{ role: 'user' as const, content: input.feedback }] : [])
  ]

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
      lastAction: '',
      blockedRounds: 0
    },
    { signal, recursionLimit: 100_000 }
  )

  // 把 graph 的累计值同步到 ref（让 get_goal / update_goal 看到最新）
  if (Number.isFinite(Number(result?.tokenUsed))) {
    opts.tokenUsedRef.current = Math.max(0, Math.floor(Number(result.tokenUsed)))
  }
  if (Number.isFinite(Number(result?.blockedRounds))) {
    opts.blockedRoundsRef.current = Math.max(0, Math.floor(Number(result.blockedRounds)))
  }

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
