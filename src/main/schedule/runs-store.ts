import { randomUUID } from 'crypto'
import type { ScheduleRun, ScheduleRunStatus, ScheduleTaskAction } from '../../shared/ipc'
import { getDb } from '../memory/db'
import { ensureScheduleTables } from './store'

export function ensureScheduleRunTables(): void {
  ensureScheduleTables()
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_runs (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      scheduled_at TEXT NOT NULL,
      session_id TEXT,
      action TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_schedule_runs_task_at
      ON schedule_runs(task_id, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_schedule_runs_scheduled
      ON schedule_runs(scheduled_at);
  `)
  const columns = db.prepare(`PRAGMA table_info(schedule_runs)`).all() as { name: string }[]
  if (!columns.some((c) => c.name === 'result_summary')) {
    db.exec(`ALTER TABLE schedule_runs ADD COLUMN result_summary TEXT`)
  }
}

export type CreateScheduleRunInput = {
  taskId: string
  scheduledAt: string
  action: ScheduleTaskAction
  status?: ScheduleRunStatus
  sessionId?: string | null
  startedAt?: string
  errorMessage?: string | null
  resultSummary?: string | null
}

export function createScheduleRun(input: CreateScheduleRunInput): ScheduleRun {
  ensureScheduleRunTables()
  const startedAt = input.startedAt ?? new Date().toISOString()
  const run: ScheduleRun = {
    id: randomUUID(),
    taskId: input.taskId,
    scheduledAt: input.scheduledAt,
    sessionId: input.sessionId ?? null,
    action: input.action,
    status: input.status ?? 'running',
    startedAt,
    endedAt: null,
    errorMessage: input.errorMessage ?? null,
    resultSummary: input.resultSummary ?? null
  }
  getDb()
    .prepare(
      `INSERT INTO schedule_runs
       (id, task_id, scheduled_at, session_id, action, status, started_at, ended_at, error_message, result_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      run.id,
      run.taskId,
      run.scheduledAt,
      run.sessionId,
      run.action,
      run.status,
      run.startedAt,
      run.endedAt,
      run.errorMessage,
      run.resultSummary
    )
  return run
}

export type UpdateScheduleRunPatch = {
  status?: ScheduleRunStatus
  sessionId?: string | null
  endedAt?: string | null
  errorMessage?: string | null
  resultSummary?: string | null
}

export function updateScheduleRun(id: string, patch: UpdateScheduleRunPatch): ScheduleRun | null {
  ensureScheduleRunTables()
  const current = getScheduleRun(id)
  if (!current) return null
  const next: ScheduleRun = {
    ...current,
    status: patch.status ?? current.status,
    sessionId: patch.sessionId !== undefined ? patch.sessionId : current.sessionId,
    endedAt: patch.endedAt !== undefined ? patch.endedAt : current.endedAt,
    errorMessage:
      patch.errorMessage !== undefined ? patch.errorMessage : current.errorMessage,
    resultSummary:
      patch.resultSummary !== undefined ? patch.resultSummary : current.resultSummary
  }
  getDb()
    .prepare(
      `UPDATE schedule_runs
       SET session_id = ?, status = ?, ended_at = ?, error_message = ?, result_summary = ?
       WHERE id = ?`
    )
    .run(
      next.sessionId ?? null,
      next.status,
      next.endedAt ?? null,
      next.errorMessage ?? null,
      next.resultSummary ?? null,
      id
    )
  return next
}

export function getScheduleRun(id: string): ScheduleRun | null {
  ensureScheduleRunTables()
  const row = getDb().prepare(`SELECT * FROM schedule_runs WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToRun(row) : null
}

/** 同一 taskId + scheduledAt 取最新一条（按 started_at DESC） */
export function getScheduleRunByTaskAt(taskId: string, scheduledAt: string): ScheduleRun | null {
  ensureScheduleRunTables()
  const row = getDb()
    .prepare(
      `SELECT * FROM schedule_runs
       WHERE task_id = ? AND scheduled_at = ?
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(taskId, scheduledAt) as Record<string, unknown> | undefined
  return row ? rowToRun(row) : null
}

export function listScheduleRunsInRange(rangeStart: Date, rangeEnd: Date): ScheduleRun[] {
  ensureScheduleRunTables()
  const rows = getDb()
    .prepare(
      `SELECT * FROM schedule_runs
       WHERE scheduled_at >= ? AND scheduled_at <= ?
       ORDER BY scheduled_at ASC, started_at DESC`
    )
    .all(rangeStart.toISOString(), rangeEnd.toISOString()) as Record<string, unknown>[]
  return rows.map(rowToRun)
}

function rowToRun(row: Record<string, unknown>): ScheduleRun {
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    scheduledAt: String(row.scheduled_at),
    sessionId: row.session_id == null || row.session_id === '' ? null : String(row.session_id),
    action: String(row.action) as ScheduleRun['action'],
    status: String(row.status) as ScheduleRunStatus,
    startedAt: String(row.started_at),
    endedAt: row.ended_at == null || row.ended_at === '' ? null : String(row.ended_at),
    errorMessage:
      row.error_message == null || row.error_message === '' ? null : String(row.error_message),
    resultSummary:
      row.result_summary == null || row.result_summary === ''
        ? null
        : String(row.result_summary)
  }
}
