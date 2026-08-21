/**
 * Sub-agent 任务存储：SQLite 落盘，跨进程崩溃可恢复。
 *
 * 表结构：
 * - id TEXT PRIMARY KEY（UUID）
 * - parent_session_id TEXT（哪个父会话起的）
 * - description / prompt / subagent_type 文本
 * - status 文本枚举
 * - output / error 可空
 * - token_used / rounds 整数
 * - created_at / started_at / completed_at 整数 epoch ms
 */
import { randomUUID } from 'crypto'
import { getDb } from '../../memory/db'
import type { SubagentStatus, SubagentTask, SubagentType } from './types'

function ensureSubagentTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS subagent_tasks (
      id TEXT PRIMARY KEY,
      parent_session_id TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      subagent_type TEXT NOT NULL,
      status TEXT NOT NULL,
      output TEXT,
      error TEXT,
      token_used INTEGER NOT NULL DEFAULT 0,
      rounds INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_subagent_tasks_parent
      ON subagent_tasks(parent_session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subagent_tasks_status
      ON subagent_tasks(status, created_at DESC);
  `)
}

export function createSubagentTask(input: {
  parentSessionId: string
  description: string
  prompt: string
  subagentType: SubagentType
}): SubagentTask {
  ensureSubagentTable()
  const id = randomUUID()
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO subagent_tasks
        (id, parent_session_id, description, prompt, subagent_type, status, token_used, rounds, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, 0, ?)`
    )
    .run(id, input.parentSessionId, input.description, input.prompt, input.subagentType, now)
  return {
    id,
    parentSessionId: input.parentSessionId,
    description: input.description,
    prompt: input.prompt,
    subagentType: input.subagentType,
    status: 'queued',
    tokenUsed: 0,
    rounds: 0,
    createdAt: now
  }
}

export function getSubagentTask(id: string): SubagentTask | null {
  ensureSubagentTable()
  const row = getDb().prepare(`SELECT * FROM subagent_tasks WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  return row ? rowToSubagentTask(row) : null
}

export function listSubagentTasks(
  parentSessionId?: string,
  limit = 100
): SubagentTask[] {
  ensureSubagentTable()
  const rows = parentSessionId
    ? (getDb()
        .prepare(
          `SELECT * FROM subagent_tasks WHERE parent_session_id = ?
           ORDER BY created_at DESC LIMIT ?`
        )
        .all(parentSessionId, limit) as Record<string, unknown>[])
    : (getDb()
        .prepare(`SELECT * FROM subagent_tasks ORDER BY created_at DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[])
  return rows.map(rowToSubagentTask)
}

export function listRunningSubagentTasks(): SubagentTask[] {
  ensureSubagentTable()
  const rows = getDb()
    .prepare(
      `SELECT * FROM subagent_tasks WHERE status IN ('queued', 'running') ORDER BY created_at ASC`
    )
    .all() as Record<string, unknown>[]
  return rows.map(rowToSubagentTask)
}

export function updateSubagentTask(
  id: string,
  patch: Partial<
    Pick<
      SubagentTask,
      'status' | 'output' | 'error' | 'tokenUsed' | 'rounds' | 'startedAt' | 'completedAt'
    >
  >
): SubagentTask | null {
  ensureSubagentTable()
  const cur = getSubagentTask(id)
  if (!cur) return null
  const next: SubagentTask = { ...cur, ...patch }
  getDb()
    .prepare(
      `UPDATE subagent_tasks
       SET status = ?, output = ?, error = ?, token_used = ?, rounds = ?,
           started_at = ?, completed_at = ?
       WHERE id = ?`
    )
    .run(
      next.status,
      next.output ?? null,
      next.error ?? null,
      next.tokenUsed,
      next.rounds,
      next.startedAt ?? null,
      next.completedAt ?? null,
      id
    )
  return next
}

export function deleteSubagentTask(id: string): boolean {
  ensureSubagentTable()
  const info = getDb().prepare(`DELETE FROM subagent_tasks WHERE id = ?`).run(id)
  return info.changes > 0
}

/**
 * 取消一个 sub-agent 任务：仅对 queued/running 状态生效，
 * 其余状态直接返回当前 task。cancelled 任务会标 completedAt + error='已取消'。
 */
export function cancelSubagentTask(id: string): SubagentTask | null {
  const cur = getSubagentTask(id)
  if (!cur) return null
  if (cur.status === 'completed' || cur.status === 'failed' || cur.status === 'cancelled') {
    return cur
  }
  return updateSubagentTask(id, {
    status: 'cancelled',
    completedAt: Date.now(),
    error: cur.error ?? '已取消'
  })
}

function rowToSubagentTask(row: Record<string, unknown>): SubagentTask {
  return {
    id: String(row.id),
    parentSessionId: String(row.parent_session_id),
    description: String(row.description),
    prompt: String(row.prompt),
    subagentType: row.subagent_type as SubagentType,
    status: row.status as SubagentStatus,
    output: row.output ? String(row.output) : undefined,
    error: row.error ? String(row.error) : undefined,
    tokenUsed: Number(row.token_used ?? 0),
    rounds: Number(row.rounds ?? 0),
    createdAt: Number(row.created_at),
    startedAt: row.started_at ? Number(row.started_at) : undefined,
    completedAt: row.completed_at ? Number(row.completed_at) : undefined
  }
}
