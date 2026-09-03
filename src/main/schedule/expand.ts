import type {
  ScheduleConflictWarning,
  ScheduleOccurrence,
  ScheduleTask
} from '../../shared/ipc'
import { compileCron, cronMatches } from './scheduler'

export function expandOccurrences(
  tasks: ScheduleTask[],
  rangeStart: Date,
  rangeEnd: Date
): ScheduleOccurrence[] {
  const startMs = floorToMinute(rangeStart.getTime())
  const endMs = floorToMinute(rangeEnd.getTime())
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return []

  // 展开层保留调用方传入的停用任务，月历可据此灰态展示；调度器负责过滤 enabled。
  // 创建时间之前的槽位不展示（重复任务不会「回溯」填满过去）。
  const compiledTasks = tasks.map((task) => {
    const createdMs = Date.parse(task.createdAt)
    return {
      task,
      cron: compileCron(task.schedule),
      earliestMs: Number.isFinite(createdMs) ? floorToMinute(createdMs) : null
    }
  })
  const occurrences: ScheduleOccurrence[] = []

  for (let atMs = startMs; atMs <= endMs; atMs += 60_000) {
    const at = new Date(atMs)
    for (const { task, cron, earliestMs } of compiledTasks) {
      if (earliestMs != null && atMs < earliestMs) continue
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

/**
 * 后续如需冲突检测（同名任务时间重叠等），加在这里。
 * 当前保留空实现，使 IPC/UI 调用面不破。
 */
export function detectWorkflowScheduleConflicts(
  _tasks: ScheduleTask[]
): ScheduleConflictWarning[] {
  return []
}

function floorToMinute(timestamp: number): number {
  return Math.floor(timestamp / 60_000) * 60_000
}
