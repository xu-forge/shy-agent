import { app } from 'electron'
import { mkdirSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { LongMemoryEntry } from '../../shared/ipc'

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  const dir = app.getPath('userData')
  mkdirSync(dir, { recursive: true })
  db = new Database(join(dir, 'memory.sqlite'))
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
    | Record<string, unknown>
    | undefined
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
    .run(
      id,
      input.title,
      input.content,
      JSON.stringify(input.tags ?? []),
      input.source,
      1,
      ts,
      ts
    )
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
