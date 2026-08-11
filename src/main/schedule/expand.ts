import type {
  ScheduleConflictWarning,
  ScheduleOccurrence,
  ScheduleTask,
  Workflow
} from '../../shared/ipc'
import { compileCron, cronMatches } from '../workflows/scheduler'

export function expandOccurrences(
  tasks: ScheduleTask[],
  rangeStart: Date,
  rangeEnd: Date
): ScheduleOccurrence[] {
  const startMs = floorToMinute(rangeStart.getTime())
  const endMs = floorToMinute(rangeEnd.getTime())
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return []

  // 展开层保留调用方传入的停用任务，月历可据此灰态展示；调度器负责过滤 enabled。
  const compiledTasks = tasks.map((task) => ({
    task,
    cron: compileCron(task.schedule)
  }))
  const occurrences: ScheduleOccurrence[] = []

  for (let atMs = startMs; atMs <= endMs; atMs += 60_000) {
    const at = new Date(atMs)
    for (const { task, cron } of compiledTasks) {
      if (!cronMatches(cron, at)) continue
      occurrences.push({
        taskId: task.id,
        at: at.toISOString(),
        title: task.title,
        action: task.action
      })
    }
  }

  return occurrences
}

export function detectWorkflowScheduleConflicts(
  tasks: ScheduleTask[],
  workflows: Workflow[]
): ScheduleConflictWarning[] {
  const scheduledWorkflows = new Map(
    workflows
      .filter((workflow) => workflow.schedule.enabled)
      .map((workflow) => [workflow.id, workflow])
  )

  return tasks.flatMap((task) => {
    if (task.action !== 'run_workflow') return []
    const workflow = scheduledWorkflows.get(task.payload.workflowId)
    if (!workflow) return []
    return [
      {
        type: 'workflow_schedule_conflict',
        taskId: task.id,
        workflowId: workflow.id,
        message: `日历任务“${task.title}”与工作流“${workflow.name}”的定时均已启用，可能重复运行`
      }
    ]
  })
}

function floorToMinute(timestamp: number): number {
  return Math.floor(timestamp / 60_000) * 60_000
}
