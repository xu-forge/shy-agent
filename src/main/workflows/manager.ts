import type { Workflow, WorkflowRun } from '../../shared/ipc'
import { listWorkflows, listRuns, getWorkflow } from './db'
import { runWorkflow } from './engine'
import { cronMatches, compileCron } from './scheduler'
import {
  checkCalendarTasks,
  setScheduleEventSink,
  type ScheduleEventSink
} from '../schedule/runner'

export type WorkflowEventSink = (event: { type: 'workflow_run'; run: WorkflowRun }) => void

let timer: NodeJS.Timeout | null = null
let sink: WorkflowEventSink | null = null
const running = new Set<string>()
const lastFired = new Map<string, string>()

export function startScheduler(emit: WorkflowEventSink, emitSchedule?: ScheduleEventSink): void {
  sink = emit
  setScheduleEventSink(emitSchedule ?? null)
  if (timer) return
  timer = setInterval(checkAllSchedules, 30_000)
  // 启动时立即检查一次
  void checkAllSchedules()
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  setScheduleEventSink(null)
}

function emitRun(run: WorkflowRun): void {
  sink?.({ type: 'workflow_run', run })
}

export async function checkSchedules(now = new Date()): Promise<void> {
  const stamp = now.toISOString().slice(0, 14) // 分钟精度 key
  for (const wf of listWorkflows()) {
    const sched = wf.schedule
    if (!sched?.enabled) continue
    const cron = sched.cron || compileCron(sched)
    if (!cronMatches(cron, now)) continue
    // 避免同一分钟重复触发
    if (lastFired.get(wf.id) === stamp) continue
    lastFired.set(wf.id, stamp)
    void execute(wf, 'schedule').catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[shy:schedule] 工作流定时执行失败：${message}`, { workflowId: wf.id })
    })
  }
}

async function checkAllSchedules(): Promise<void> {
  const now = new Date()
  await Promise.all([checkSchedules(now), checkCalendarTasks(now)])
}

async function execute(
  wf: Workflow,
  trigger: WorkflowRun['trigger'],
  taskId?: string
): Promise<WorkflowRun> {
  if (running.has(wf.id)) return Promise.reject(new Error('工作流正在执行中'))
  running.add(wf.id)
  try {
    const run = await runWorkflow(wf.id, trigger, emitRun, taskId)
    emitRun(run)
    return run
  } finally {
    running.delete(wf.id)
  }
}

export function runWorkflowNow(workflowId: string, emit: WorkflowEventSink): Promise<WorkflowRun> {
  sink = emit
  const wf = getWorkflow(workflowId)
  if (!wf) return Promise.reject(new Error('工作流不存在'))
  return execute(wf, 'manual')
}

export function runWorkflowCalendarTask(workflowId: string, taskId: string): Promise<WorkflowRun> {
  const wf = getWorkflow(workflowId)
  if (!wf) return Promise.reject(new Error('工作流不存在'))
  return execute(wf, 'calendar_task', taskId)
}

export { listRuns }
