import type { ScheduleTask } from '../../shared/ipc'
import { compileCron, cronMatches } from '../workflows/scheduler'
import { listScheduleTasks } from './store'

export type ScheduleReminderEvent = {
  type: 'schedule_remind'
  taskId: string
  title: string
  message: string
  at: string
}

export type ScheduleEventSink = (event: ScheduleReminderEvent) => void
export type ScheduleLog = (
  level: 'info' | 'error',
  message: string,
  metadata: { taskId: string; skillId?: string }
) => void

export type CalendarTaskRunnerDependencies = {
  listTasks: () => ScheduleTask[]
  runWorkflow: (workflowId: string, taskId: string) => Promise<unknown>
  emit: ScheduleEventSink
  log: ScheduleLog
}

const lastFired = new Map<string, string>()
let eventSink: ScheduleEventSink | null = null

export function setScheduleEventSink(emit: ScheduleEventSink | null): void {
  eventSink = emit
}

const defaultDependencies: CalendarTaskRunnerDependencies = {
  listTasks: listScheduleTasks,
  runWorkflow: async (workflowId, taskId) => {
    const { runWorkflowCalendarTask } = await import('../workflows/manager')
    await runWorkflowCalendarTask(workflowId, taskId)
  },
  emit: (event) => eventSink?.(event),
  log: (level, message, metadata) => {
    const output = level === 'error' ? console.error : console.info
    output(`[shy:schedule] ${message}`, metadata)
  }
}

function minuteStamp(date: Date): string {
  return date.toISOString().slice(0, 16)
}

async function dispatchTask(
  task: ScheduleTask,
  now: Date,
  dependencies: CalendarTaskRunnerDependencies
): Promise<void> {
  switch (task.action) {
    case 'run_workflow':
      await dependencies.runWorkflow(task.payload.workflowId, task.id)
      return
    case 'remind':
      dependencies.emit({
        type: 'schedule_remind',
        taskId: task.id,
        title: task.title,
        message: task.payload.message,
        at: now.toISOString()
      })
      return
    case 'run_skill':
      dependencies.log(
        'info',
        `技能 ${task.payload.skillId} 已到点；当前版本预留技能脚本执行入口`,
        { taskId: task.id, skillId: task.payload.skillId }
      )
  }
}

export async function checkCalendarTasks(
  now = new Date(),
  dependencies: CalendarTaskRunnerDependencies = defaultDependencies
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
