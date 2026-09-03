import type {
  AgentEvent,
  AgentMode,
  ScheduleReminderEvent,
  ScheduleRunFinishedEvent,
  ScheduleTask
} from '../../shared/ipc'
import { getSettings } from '../settings/store'
import { bindSessionProject } from '../projects/store'
import { createSession, getSession, setSessionModel } from '../sessions/store'
import { runAgent } from '../agent/service'
import { listSkills } from '../skills/store'
import { compileCron, cronMatches } from './scheduler'
import { listScheduleTasks } from './store'
import {
  createScheduleRun,
  getScheduleRun,
  updateScheduleRun,
  type CreateScheduleRunInput
} from './runs-store'
import { extractSessionResultSummary } from './result-text'

export type ScheduleEventSink = (event: ScheduleReminderEvent) => void
export type ScheduleRunFinishedSink = (event: ScheduleRunFinishedEvent) => void
export type ScheduleLog = (
  level: 'info' | 'error',
  message: string,
  metadata: { taskId: string; skillId?: string }
) => void

export type ScheduleWaitConfirm = (action: string, detail: string) => Promise<boolean>
export type ScheduleAgentEmit = (sessionId: string, event: AgentEvent) => void

export type CalendarTaskRunnerDependencies = {
  listTasks: () => ScheduleTask[]
  emit: ScheduleEventSink
  log: ScheduleLog
  waitConfirm: ScheduleWaitConfirm
  emitAgent: ScheduleAgentEmit
  createRun: (input: CreateScheduleRunInput) => ReturnType<typeof createScheduleRun>
  updateRun: typeof updateScheduleRun
  getRun: typeof getScheduleRun
  createSession: typeof createSession
  bindSessionProject: typeof bindSessionProject
  setSessionModel: typeof setSessionModel
  runAgent: typeof runAgent
  getSession: typeof getSession
  getSettings: typeof getSettings
  listSkills: typeof listSkills
  confirmTimeoutMs?: number
}

const lastFired = new Map<string, string>()
let eventSink: ScheduleEventSink | null = null
let runFinishedSink: ScheduleRunFinishedSink | null = null
let waitConfirmSink: ScheduleWaitConfirm | null = null
let agentEmitSink: ScheduleAgentEmit | null = null

export function setScheduleEventSink(emit: ScheduleEventSink | null): void {
  eventSink = emit
}

export function setScheduleRunFinishedSink(emit: ScheduleRunFinishedSink | null): void {
  runFinishedSink = emit
}

export function setScheduleConfirmWaiter(wait: ScheduleWaitConfirm | null): void {
  waitConfirmSink = wait
}

export function setScheduleAgentEmit(emit: ScheduleAgentEmit | null): void {
  agentEmitSink = emit
}

const CONFIRM_TIMEOUT_MS = 30 * 60 * 1000

const defaultDependencies = (): CalendarTaskRunnerDependencies => ({
  listTasks: listScheduleTasks,
  emit: (event) => eventSink?.(event),
  log: (level, message, metadata) => {
    const output = level === 'error' ? console.error : console.info
    output(`[shy:schedule] ${message}`, metadata)
  },
  waitConfirm: (action, detail) =>
    waitConfirmSink ? waitConfirmSink(action, detail) : Promise.resolve(false),
  emitAgent: (sessionId, event) => agentEmitSink?.(sessionId, event),
  createRun: createScheduleRun,
  updateRun: updateScheduleRun,
  getRun: getScheduleRun,
  createSession,
  bindSessionProject,
  setSessionModel,
  runAgent,
  getSession,
  getSettings,
  listSkills,
  confirmTimeoutMs: CONFIRM_TIMEOUT_MS
})

function minuteStamp(date: Date): string {
  return date.toISOString().slice(0, 16)
}

/** 与 expandOccurrences 同一分钟对齐的 ISO */
export function scheduledAtIso(now: Date): string {
  const floored = Math.floor(now.getTime() / 60_000) * 60_000
  return new Date(floored).toISOString()
}

function toAgentMode(task: ScheduleTask): AgentMode {
  return task.agentMode === 'normal' ? 'interactive' : 'goal'
}

async function withConfirmTimeout(
  waitConfirm: ScheduleWaitConfirm,
  allowAutoConfirm: boolean,
  timeoutMs: number,
  onWaiting: () => void,
  action: string,
  detail: string
): Promise<'approved' | 'denied' | 'timeout'> {
  if (allowAutoConfirm) return 'approved'
  onWaiting()
  let timedOut = false
  const user = waitConfirm(action, detail).then((ok) =>
    timedOut ? ('timeout' as const) : ok ? ('approved' as const) : ('denied' as const)
  )
  const timer = new Promise<'timeout'>((resolve) => {
    setTimeout(() => {
      timedOut = true
      resolve('timeout')
    }, timeoutMs)
  })
  return Promise.race([user, timer])
}

function emitRunEvent(
  run: { id: string; taskId: string; scheduledAt: string; action: ScheduleTask['action'] },
  status: ScheduleRunFinishedEvent['status'],
  title: string,
  sessionId?: string | null
): void {
  runFinishedSink?.({
    type: 'schedule_run_finished',
    taskId: run.taskId,
    title,
    scheduledAt: run.scheduledAt,
    runId: run.id,
    action: run.action,
    status,
    sessionId: sessionId ?? null
  })
}

function finishRun(
  dependencies: CalendarTaskRunnerDependencies,
  run: { id: string; taskId: string; scheduledAt: string; action: ScheduleTask['action'] },
  title: string,
  patch: {
    status: 'succeeded' | 'failed'
    endedAt: string
    errorMessage?: string | null
    resultSummary?: string | null
    sessionId?: string | null
  }
): void {
  dependencies.updateRun(run.id, patch)
  emitRunEvent(run, patch.status, title, patch.sessionId ?? null)
}

function buildDirectPrompt(task: Extract<ScheduleTask, { action: 'remind' }>): string {
  return (
    `这是定时任务「${task.title}」的到点自动执行。\n\n` +
    `用户要求：\n${task.payload.message}\n\n` +
    `要求：给出可直接展示给用户的最终答复，使用 Markdown 格式（标题、列表、加粗等），` +
    `不要只复述本提示词。`
  )
}

function buildSkillPrompt(
  task: Extract<ScheduleTask, { action: 'run_skill' }>,
  skill: { id: string; name: string; description?: string }
): string {
  const instruction = task.payload.instruction?.trim()
  return (
    `这是定时任务「${task.title}」的到点自动执行。\n` +
    `请使用技能「${skill.name}」（id: ${skill.id}）完成任务。\n` +
    `技能说明：${skill.description || '（无）'}\n\n` +
    `要求：完成后给出可直接展示给用户的最终答复，使用 Markdown 格式（标题、列表、加粗等），` +
    `不要只复述本提示词；请写成完整结论正文。` +
    (instruction ? `\n\n用户补充要求：\n${instruction}` : '')
  )
}

async function runScheduledAgent(
  task: ScheduleTask,
  run: { id: string; taskId: string; scheduledAt: string; action: ScheduleTask['action'] },
  dependencies: CalendarTaskRunnerDependencies,
  prompt: string,
  logMeta?: { skillId?: string }
): Promise<void> {
  emitRunEvent(run, 'running', task.title)
  const settings = await dependencies.getSettings()
  if (!settings.apiKey) {
    finishRun(dependencies, run, task.title, {
      status: 'failed',
      endedAt: new Date().toISOString(),
      errorMessage: '尚未配置 apiKey，请先在设置中填写凭证'
    })
    return
  }

  const mode = toAgentMode(task)
  const session = dependencies.createSession(mode, task.title)
  dependencies.updateRun(run.id, { sessionId: session.id })

  if (task.model) {
    dependencies.setSessionModel(session.id, task.model)
  }

  if (task.projectId) {
    const bound = dependencies.bindSessionProject(session.id, task.projectId)
    if (!bound.ok && bound.error === 'not_found') {
      dependencies.log('info', '定时任务所属项目已删除，会话归入未选择项目', {
        taskId: task.id,
        skillId: logMeta?.skillId
      })
    }
  }

  dependencies.emitAgent(session.id, {
    type: 'session',
    title: task.title,
    sessionId: session.id
  })
  emitRunEvent(run, 'running', task.title, session.id)

  const timeoutMs = dependencies.confirmTimeoutMs ?? CONFIRM_TIMEOUT_MS
  const waitConfirm: ScheduleWaitConfirm = async (action, detail) => {
    const outcome = await withConfirmTimeout(
      dependencies.waitConfirm,
      task.allowAutoConfirm,
      timeoutMs,
      () => {
        dependencies.updateRun(run.id, { status: 'waiting_confirm' })
      },
      action,
      detail
    )
    if (outcome === 'timeout') {
      finishRun(dependencies, run, task.title, {
        status: 'failed',
        endedAt: new Date().toISOString(),
        errorMessage: '等待高危确认超时（30 分钟）',
        sessionId: session.id
      })
      return false
    }
    if (outcome === 'denied') {
      finishRun(dependencies, run, task.title, {
        status: 'failed',
        endedAt: new Date().toISOString(),
        errorMessage: '用户拒绝了高危操作确认',
        sessionId: session.id
      })
      return false
    }
    dependencies.updateRun(run.id, { status: 'running' })
    return true
  }

  await dependencies.runAgent({
    sessionId: session.id,
    message: prompt,
    mode,
    emit: (event) => dependencies.emitAgent(session.id, event),
    waitConfirm
  })

  const after = dependencies.getRun(run.id)
  if (after?.status === 'failed') return

  const summary = extractSessionResultSummary(dependencies.getSession(session.id))
  finishRun(dependencies, run, task.title, {
    status: 'succeeded',
    endedAt: new Date().toISOString(),
    sessionId: session.id,
    resultSummary: summary
  })
}

async function dispatchTask(
  task: ScheduleTask,
  now: Date,
  dependencies: CalendarTaskRunnerDependencies
): Promise<void> {
  const scheduledAt = scheduledAtIso(now)
  const run = dependencies.createRun({
    taskId: task.id,
    scheduledAt,
    action: task.action,
    status: 'running'
  })

  try {
    switch (task.action) {
      case 'remind': {
        await runScheduledAgent(task, run, dependencies, buildDirectPrompt(task))
        return
      }
      case 'run_skill': {
        const skills = await dependencies.listSkills()
        const skill = skills.find((s) => s.id === task.payload.skillId)
        if (!skill) {
          finishRun(dependencies, run, task.title, {
            status: 'failed',
            endedAt: new Date().toISOString(),
            errorMessage: `技能不存在：${task.payload.skillId}`
          })
          return
        }

        await runScheduledAgent(
          task,
          run,
          dependencies,
          buildSkillPrompt(task, skill),
          { skillId: task.payload.skillId }
        )
        return
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    finishRun(dependencies, run, task.title, {
      status: 'failed',
      endedAt: new Date().toISOString(),
      errorMessage: message
    })
    throw error
  }
}

export async function checkCalendarTasks(
  now = new Date(),
  dependencies: CalendarTaskRunnerDependencies = defaultDependencies()
): Promise<void> {
  const stamp = minuteStamp(now)
  const pending: Promise<void>[] = []

  for (const task of dependencies.listTasks()) {
    if (!task.enabled) continue
    const cron = task.schedule.cron || compileCron(task.schedule)
    if (!cronMatches(cron, now)) continue

    if (lastFired.get(task.id) === stamp) continue
    lastFired.set(task.id, stamp)

    pending.push(
      dispatchTask(task, now, dependencies).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        dependencies.log('error', `任务执行失败：${message}`, {
          taskId: task.id,
          skillId: task.action === 'run_skill' ? task.payload.skillId : undefined
        })
      })
    )
  }

  await Promise.all(pending)
}

/** 测试用：清空同分钟防重 */
export function resetScheduleFireDedup(): void {
  lastFired.clear()
}
