import { randomUUID } from 'crypto'
import type {
  RemindScheduleTaskPayload,
  RunSkillScheduleTaskPayload,
  RunWorkflowScheduleTaskPayload,
  ScheduleTask,
  ScheduleTaskAction,
  WorkflowSchedule
} from '../../shared/ipc'
import { getDb } from '../memory/db'

export type CreateScheduleTaskInput = {
  title: string
  enabled: boolean
  schedule: WorkflowSchedule
} & (
  | { action: 'run_workflow'; payload: RunWorkflowScheduleTaskPayload }
  | { action: 'remind'; payload: RemindScheduleTaskPayload }
  | { action: 'run_skill'; payload: RunSkillScheduleTaskPayload }
)

export type UpdateScheduleTaskInput = Partial<{
  title: string
  enabled: boolean
  schedule: WorkflowSchedule
  action: ScheduleTaskAction
  payload: ScheduleTask['payload']
}>

export function ensureScheduleTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS schedule_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      action TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      schedule TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_tasks_updated
      ON schedule_tasks(updated_at DESC);
  `)
}

export function listScheduleTasks(): ScheduleTask[] {
  ensureScheduleTables()
  const rows = getDb()
    .prepare(`SELECT * FROM schedule_tasks ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToScheduleTask)
}

export function getScheduleTask(id: string): ScheduleTask | null {
  ensureScheduleTables()
  const row = getDb().prepare(`SELECT * FROM schedule_tasks WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToScheduleTask(row) : null
}

export function createScheduleTask(input: CreateScheduleTaskInput): ScheduleTask {
  ensureScheduleTables()
  const timestamp = new Date().toISOString()
  const task = {
    ...input,
    id: randomUUID(),
    schedule: syncScheduleEnabled(input.schedule, input.enabled),
    createdAt: timestamp,
    updatedAt: timestamp
  } as ScheduleTask

  getDb()
    .prepare(
      `INSERT INTO schedule_tasks
       (id, title, enabled, action, payload, schedule, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      task.id,
      task.title,
      task.enabled ? 1 : 0,
      task.action,
      JSON.stringify(task.payload),
      JSON.stringify(task.schedule),
      task.createdAt,
      task.updatedAt
    )

  return task
}

export function updateScheduleTask(
  id: string,
  patch: UpdateScheduleTaskInput
): ScheduleTask | null {
  const current = getScheduleTask(id)
  if (!current) return null

  const enabled = patch.enabled ?? current.enabled
  const schedule = syncScheduleEnabled(patch.schedule ?? current.schedule, enabled)
  const updated = {
    ...current,
    ...patch,
    enabled,
    schedule,
    updatedAt: new Date().toISOString()
  } as ScheduleTask

  getDb()
    .prepare(
      `UPDATE schedule_tasks
       SET title = ?, enabled = ?, action = ?, payload = ?, schedule = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      updated.title,
      updated.enabled ? 1 : 0,
      updated.action,
      JSON.stringify(updated.payload),
      JSON.stringify(updated.schedule),
      updated.updatedAt,
      id
    )

  return updated
}

export function deleteScheduleTask(id: string): boolean {
  ensureScheduleTables()
  const result = getDb().prepare(`DELETE FROM schedule_tasks WHERE id = ?`).run(id)
  return result.changes > 0
}

function syncScheduleEnabled(schedule: WorkflowSchedule, enabled: boolean): WorkflowSchedule {
  // 任务顶层 enabled 是唯一权威值；兼容 WorkflowSchedule 时同步其同名字段。
  return { ...schedule, enabled }
}

function rowToScheduleTask(row: Record<string, unknown>): ScheduleTask {
  const enabled = Number(row.enabled) === 1
  return {
    id: String(row.id),
    title: String(row.title),
    enabled,
    action: String(row.action) as ScheduleTaskAction,
    payload: JSON.parse(String(row.payload || '{}')) as ScheduleTask['payload'],
    schedule: syncScheduleEnabled(
      JSON.parse(String(row.schedule || '{}')) as WorkflowSchedule,
      enabled
    ),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  } as ScheduleTask
}
