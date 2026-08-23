import { mkdirSync } from 'fs'
import { dirname } from 'path'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type {
  FileOp,
  LongMemoryEntry,
  SessionFileRecord,
  SessionTaskRecord,
  TaskSource
} from '../../shared/ipc'
import { getShyPaths } from '../paths'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dbPath = getShyPaths().dbPath
  mkdirSync(dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS long_memory (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS memory_audit (
      id TEXT PRIMARY KEY,
      memory_id TEXT NOT NULL,
      action TEXT NOT NULL,
      source TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS short_memory (
      session_id TEXT PRIMARY KEY,
      compressed TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      op TEXT NOT NULL,
      path TEXT NOT NULL,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_files_sid ON session_files(session_id, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS session_tasks (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      evidence TEXT,
      source TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_tasks_sid ON session_tasks(session_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS session_diffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      path TEXT NOT NULL,
      op TEXT NOT NULL,
      added INTEGER NOT NULL DEFAULT 0,
      removed INTEGER NOT NULL DEFAULT 0,
      diff_text TEXT NOT NULL,
      snapshot_path TEXT,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_session_diffs_sid ON session_diffs(session_id, occurred_at DESC);
  `)
  // migrate revision column if missing
  try {
    db.exec(`ALTER TABLE long_memory ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`)
  } catch {
    // already exists
  }
  return db
}

function rowToEntry(row: Record<string, unknown>): LongMemoryEntry {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    tags: JSON.parse(String(row.tags || '[]')) as string[],
    source: row.source === 'agent' ? 'agent' : 'user',
    revision: Number(row.revision ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

function audit(memoryId: string, action: string, source: string, snapshot: unknown): void {
  getDb()
    .prepare(
      `INSERT INTO memory_audit (id, memory_id, action, source, snapshot, created_at) VALUES (?,?,?,?,?,?)`
    )
    .run(randomUUID(), memoryId, action, source, JSON.stringify(snapshot), new Date().toISOString())
}

export function listLongMemory(): LongMemoryEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM long_memory WHERE deleted_at IS NULL ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToEntry)
}

export function upsertLongMemory(input: {
  id?: string
  title: string
  content: string
  tags?: string[]
  source: 'user' | 'agent'
}): LongMemoryEntry {
  const ts = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined
  if (existing) {
    const revision = Number(existing.revision ?? 1) + 1
    getDb()
      .prepare(
        `UPDATE long_memory SET title=?, content=?, tags=?, source=?, revision=?, updated_at=?, deleted_at=NULL WHERE id=?`
      )
      .run(
        input.title,
        input.content,
        JSON.stringify(input.tags ?? []),
        input.source,
        revision,
        ts,
        id
      )
    const entry = rowToEntry(
      getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id) as Record<string, unknown>
    )
    audit(id, 'update', input.source, entry)
    return entry
  }
  getDb()
    .prepare(
      `INSERT INTO long_memory (id, title, content, tags, source, revision, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(id, input.title, input.content, JSON.stringify(input.tags ?? []), input.source, 1, ts, ts)
  const entry = rowToEntry(
    getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id) as Record<string, unknown>
  )
  audit(id, 'create', input.source, entry)
  return entry
}

export function deleteLongMemory(id: string): void {
  const ts = new Date().toISOString()
  const existing = getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id)
  getDb().prepare(`UPDATE long_memory SET deleted_at=?, updated_at=? WHERE id=?`).run(ts, ts, id)
  if (existing) audit(id, 'delete', 'user', existing)
}

export function getShortMemory(sessionId: string): string {
  const row = getDb()
    .prepare(`SELECT compressed FROM short_memory WHERE session_id = ?`)
    .get(sessionId) as { compressed?: string } | undefined
  return row?.compressed ?? ''
}

export function setShortMemory(sessionId: string, compressed: string): void {
  const ts = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO short_memory (session_id, compressed, updated_at) VALUES (?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET compressed=excluded.compressed, updated_at=excluded.updated_at`
    )
    .run(sessionId, compressed, ts)
}

/** Keep-key keyword fallback. */
export function compressContext(messages: string[]): string {
  const keys: string[] = []
  for (const m of messages) {
    for (const line of m.split(/\r?\n/)) {
      if (
        /(必须|不要|禁止|偏好|目标|验收|路径|错误|失败|决定|结论|TODO|完成)/i.test(line) ||
        /[A-Za-z]:\\|\//.test(line) ||
        /error|failed|exception/i.test(line)
      ) {
        keys.push(line.trim())
      }
    }
  }
  return [...new Set(keys)].slice(-80).join('\n')
}

/* ────────── session files (本次会话文件操作追踪) ────────── */

export function recordFileOp(sessionId: string, op: FileOp, path: string): SessionFileRecord {
  const occurredAt = Date.now()
  const stmt = getDb().prepare(
    `INSERT INTO session_files (session_id, op, path, occurred_at) VALUES (?, ?, ?, ?)`
  )
  const info = stmt.run(sessionId, op, path, occurredAt)
  return {
    id: Number(info.lastInsertRowid),
    sessionId,
    op,
    path,
    occurredAt
  }
}

export function listSessionFiles(sessionId: string, limit = 200): SessionFileRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, op, path, occurred_at
       FROM session_files WHERE session_id = ? ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(sessionId, limit) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: Number(row.id),
    sessionId: String(row.session_id),
    op: row.op as FileOp,
    path: String(row.path),
    occurredAt: Number(row.occurred_at)
  }))
}

/* ────────── session diffs (文件改动 diff 捕获，inspector-func-panel) ────────── */

export type SessionDiffRecord = {
  id: number
  sessionId: string
  path: string
  op: 'write' | 'delete'
  added: number
  removed: number
  diffText: string
  snapshotPath: string | null
  occurredAt: number
}

export function recordDiff(input: {
  sessionId: string
  path: string
  op: 'write' | 'delete'
  added: number
  removed: number
  diffText: string
  snapshotPath: string | null
}): SessionDiffRecord {
  const occurredAt = Date.now()
  const info = getDb()
    .prepare(
      `INSERT INTO session_diffs (session_id, path, op, added, removed, diff_text, snapshot_path, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.sessionId,
      input.path,
      input.op,
      input.added,
      input.removed,
      input.diffText,
      input.snapshotPath,
      occurredAt
    )
  return { id: Number(info.lastInsertRowid), occurredAt, ...input }
}

export function listSessionDiffs(sessionId: string, limit = 100): SessionDiffRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, path, op, added, removed, diff_text, snapshot_path, occurred_at
       FROM session_diffs WHERE session_id = ? ORDER BY occurred_at DESC LIMIT ?`
    )
    .all(sessionId, limit) as Record<string, unknown>[]
  return rows.map((row) => ({
    id: Number(row.id),
    sessionId: String(row.session_id),
    path: String(row.path),
    op: row.op === 'delete' ? 'delete' : 'write',
    added: Number(row.added),
    removed: Number(row.removed),
    diffText: String(row.diff_text),
    snapshotPath: row.snapshot_path ? String(row.snapshot_path) : null,
    occurredAt: Number(row.occurred_at)
  }))
}

/* ────────── session tasks (动态任务 + 目标模式 checklist) ────────── */

export function upsertSessionTask(input: {
  id: string
  sessionId: string
  title: string
  done?: boolean
  evidence?: string
  source: TaskSource
}): SessionTaskRecord {
  const now = Date.now()
  const existing = getDb()
    .prepare(`SELECT occurred_at FROM session_tasks WHERE id = ?`)
    .get(input.id) as { occurred_at?: number } | undefined
  const occurredAt = existing?.occurred_at ?? now
  getDb()
    .prepare(
      `INSERT INTO session_tasks (id, session_id, title, done, evidence, source, occurred_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         done=excluded.done,
         evidence=excluded.evidence,
         source=excluded.source,
         updated_at=excluded.updated_at`
    )
    .run(
      input.id,
      input.sessionId,
      input.title,
      input.done ? 1 : 0,
      input.evidence ?? null,
      input.source,
      occurredAt,
      now
    )
  return {
    id: input.id,
    sessionId: input.sessionId,
    title: input.title,
    done: Boolean(input.done),
    evidence: input.evidence,
    source: input.source,
    occurredAt,
    updatedAt: now
  }
}

export function updateSessionTaskDone(
  sessionId: string,
  id: string,
  done: boolean,
  evidence?: string
): SessionTaskRecord | null {
  const now = Date.now()
  const info = getDb()
    .prepare(
      `UPDATE session_tasks
       SET done = ?, evidence = COALESCE(?, evidence), updated_at = ?
       WHERE id = ? AND session_id = ?`
    )
    .run(done ? 1 : 0, evidence ?? null, now, id, sessionId)
  if (info.changes === 0) return null
  return getSessionTask(sessionId, id)
}

export function deleteSessionTask(sessionId: string, id: string): boolean {
  const info = getDb()
    .prepare(`DELETE FROM session_tasks WHERE id = ? AND session_id = ?`)
    .run(id, sessionId)
  return info.changes > 0
}

export function getSessionTask(sessionId: string, id: string): SessionTaskRecord | null {
  const row = getDb()
    .prepare(
      `SELECT id, session_id, title, done, evidence, source, occurred_at, updated_at
       FROM session_tasks WHERE id = ? AND session_id = ?`
    )
    .get(id, sessionId) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToTask(row)
}

export function listSessionTasks(sessionId: string, limit = 500): SessionTaskRecord[] {
  const rows = getDb()
    .prepare(
      `SELECT id, session_id, title, done, evidence, source, occurred_at, updated_at
       FROM session_tasks WHERE session_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .all(sessionId, limit) as Record<string, unknown>[]
  const tasks = rows.map(rowToTask)

  // 合并 goal 模式的验收清单：它存在 sessions.checklist（JSON），不走 session_tasks 表。
  // goal 驱动的 task 事件并未落库到 session_tasks，导致右面板「进度」读不到，这里补齐。
  try {
    const srow = getDb().prepare(`SELECT checklist FROM sessions WHERE id = ?`).get(sessionId) as
      { checklist?: unknown } | undefined
    const raw = typeof srow?.checklist === 'string' ? srow.checklist : ''
    if (raw) {
      const checklist = JSON.parse(raw) as Array<{
        id?: unknown
        title?: unknown
        done?: unknown
        evidence?: unknown
      }>
      const seen = new Set(tasks.map((t) => t.id))
      const now = Date.now()
      for (const c of checklist) {
        const id = String(c.id ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        tasks.push({
          id,
          sessionId,
          title: String(c.title ?? ''),
          done: Boolean(c.done),
          evidence: c.evidence ? String(c.evidence) : undefined,
          source: 'goal',
          occurredAt: now,
          updatedAt: now
        })
      }
    }
  } catch {
    // checklist 解析失败不影响已查到的任务
  }
  return tasks
}

function rowToTask(row: Record<string, unknown>): SessionTaskRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    title: String(row.title),
    done: Number(row.done) === 1,
    evidence: row.evidence ? String(row.evidence) : undefined,
    source: row.source === 'agent' ? 'agent' : 'goal',
    occurredAt: Number(row.occurred_at),
    updatedAt: Number(row.updated_at)
  }
}
