import type { Workflow, WorkflowRun } from '../../shared/ipc'
import { listWorkflows, listRuns, getWorkflow } from './db'
import { runWorkflow } from './engine'
import { cronMatches, compileCron } from './scheduler'

export type WorkflowEventSink = (event: { type: 'workflow_run'; run: WorkflowRun }) => void

let timer: NodeJS.Timeout | null = null
let sink: WorkflowEventSink | null = null
const running = new Set<string>()
const lastFired = new Map<string, string>()

export function startScheduler(emit: WorkflowEventSink): void {
  sink = emit
  if (timer) return
  timer = setInterval(checkSchedules, 30_000)
  // 启动时立即检查一次
  void checkSchedules()
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function emitRun(run: WorkflowRun): void {
  sink?.({ type: 'workflow_run', run })
}

export async function checkSchedules(): Promise<void> {
  const now = new Date()
  const stamp = now.toISOString().slice(0, 14) // 分钟精度 key
  for (const wf of listWorkflows()) {
    const sched = wf.schedule
    if (!sched?.enabled) continue
    const cron = sched.cron || compileCron(sched)
    if (!cronMatches(cron, now)) continue
    // 避免同一分钟重复触发
    if (lastFired.get(wf.id) === stamp) continue
    lastFired.set(wf.id, stamp)
    void execute(wf, 'schedule')
  }
}

async function execute(wf: Workflow, trigger: 'manual' | 'schedule'): Promise<WorkflowRun> {
  if (running.has(wf.id)) return Promise.reject(new Error('工作流正在执行中'))
  running.add(wf.id)
  try {
    const run = await runWorkflow(wf.id, trigger, emitRun)
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

export { listRuns }
