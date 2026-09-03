import { randomUUID } from 'crypto'
import type {
  CreateScheduleTaskInput,
  ScheduleAgentMode,
  ScheduleTask,
  ScheduleTaskAction,
  UpdateScheduleTaskInput,
  WorkflowSchedule
} from '../../shared/ipc'
import { getDb } from '../memory/db'

export function ensureScheduleTables(): void {
  const db = getDb()
  db.exec(`
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
  const columns = db.prepare(`PRAGMA table_info(schedule_tasks)`).all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has('agent_mode')) {
    db.exec(`ALTER TABLE schedule_tasks ADD COLUMN agent_mode TEXT NOT NULL DEFAULT 'goal'`)
  }
  if (!names.has('allow_auto_confirm')) {
    db.exec(`ALTER TABLE schedule_tasks ADD COLUMN allow_auto_confirm INTEGER NOT NULL DEFAULT 0`)
  }
  if (!names.has('project_id')) {
    db.exec(`ALTER TABLE schedule_tasks ADD COLUMN project_id TEXT`)
  }
  if (!names.has('model')) {
    db.exec(`ALTER TABLE schedule_tasks ADD COLUMN model TEXT`)
  }
}

function normalizeModel(value: unknown): string | null {
  if (value === undefined || value === null) return null
  const trimmed = String(value).trim()
  return trimmed === '' ? null : trimmed
}

function normalizeAgentMode(value: unknown): ScheduleAgentMode {
  return value === 'normal' ? 'normal' : 'goal'
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
    Record<string, unknown> | undefined
  return row ? rowToScheduleTask(row) : null
}

export function createScheduleTask(input: CreateScheduleTaskInput): ScheduleTask {
  ensureScheduleTables()
  const timestamp = new Date().toISOString()
  const agentMode = normalizeAgentMode(input.agentMode)
  const allowAutoConfirm = Boolean(input.allowAutoConfirm)
  const projectId =
    input.projectId === undefined || input.projectId === null || input.projectId === ''
      ? null
      : String(input.projectId)
  const model = normalizeModel(input.model)
  const task = {
    ...input,
    id: randomUUID(),
    agentMode,
    allowAutoConfirm,
    projectId,
    model,
    schedule: syncScheduleEnabled(input.schedule, input.enabled),
    createdAt: timestamp,
    updatedAt: timestamp
  } as ScheduleTask

  getDb()
    .prepare(
      `INSERT INTO schedule_tasks
       (id, title, enabled, action, payload, schedule, agent_mode, allow_auto_confirm, project_id, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      task.id,
      task.title,
      task.enabled ? 1 : 0,
      task.action,
      JSON.stringify(task.payload),
      JSON.stringify(task.schedule),
      task.agentMode,
      task.allowAutoConfirm ? 1 : 0,
      task.projectId,
      task.model,
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
  const agentMode = normalizeAgentMode(patch.agentMode ?? current.agentMode)
  const allowAutoConfirm =
    patch.allowAutoConfirm !== undefined
      ? Boolean(patch.allowAutoConfirm)
      : current.allowAutoConfirm
  const projectId =
    patch.projectId !== undefined
      ? patch.projectId === null || patch.projectId === ''
        ? null
        : String(patch.projectId)
      : (current.projectId ?? null)
  const model = patch.model !== undefined ? normalizeModel(patch.model) : (current.model ?? null)

  const updated = {
    ...current,
    ...patch,
    enabled,
    schedule,
    agentMode,
    allowAutoConfirm,
    projectId,
    model,
    updatedAt: new Date().toISOString()
  } as ScheduleTask

  getDb()
    .prepare(
      `UPDATE schedule_tasks
       SET title = ?, enabled = ?, action = ?, payload = ?, schedule = ?,
           agent_mode = ?, allow_auto_confirm = ?, project_id = ?, model = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      updated.title,
      updated.enabled ? 1 : 0,
      updated.action,
      JSON.stringify(updated.payload),
      JSON.stringify(updated.schedule),
      updated.agentMode,
      updated.allowAutoConfirm ? 1 : 0,
      updated.projectId ?? null,
      updated.model ?? null,
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
  return { ...schedule, enabled }
}

function rowToScheduleTask(row: Record<string, unknown>): ScheduleTask {
  const enabled = Number(row.enabled) === 1
  const projectRaw = row.project_id
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
    agentMode: normalizeAgentMode(row.agent_mode),
    allowAutoConfirm: Number(row.allow_auto_confirm) === 1,
    projectId:
      projectRaw === undefined || projectRaw === null || projectRaw === ''
        ? null
        : String(projectRaw),
    model: normalizeModel(row.model),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  } as ScheduleTask
}
