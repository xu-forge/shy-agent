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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS short_memory (
      session_id TEXT PRIMARY KEY,
      compressed TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  return db
}

function rowToEntry(row: Record<string, unknown>): LongMemoryEntry {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    tags: JSON.parse(String(row.tags || '[]')) as string[],
    source: row.source === 'agent' ? 'agent' : 'user',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
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
  const now = new Date().toISOString()
  const id = input.id || randomUUID()
  const existing = getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id) as
    Record<string, unknown> | undefined
  if (existing) {
    getDb()
      .prepare(
        `UPDATE long_memory SET title=?, content=?, tags=?, source=?, updated_at=?, deleted_at=NULL WHERE id=?`
      )
      .run(input.title, input.content, JSON.stringify(input.tags ?? []), input.source, now, id)
  } else {
    getDb()
      .prepare(
        `INSERT INTO long_memory (id, title, content, tags, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
      )
      .run(id, input.title, input.content, JSON.stringify(input.tags ?? []), input.source, now, now)
  }
  return rowToEntry(
    getDb().prepare(`SELECT * FROM long_memory WHERE id = ?`).get(id) as Record<string, unknown>
  )
}

export function deleteLongMemory(id: string): void {
  const now = new Date().toISOString()
  getDb().prepare(`UPDATE long_memory SET deleted_at=?, updated_at=? WHERE id=?`).run(now, now, id)
}

export function getShortMemory(sessionId: string): string {
  const row = getDb()
    .prepare(`SELECT compressed FROM short_memory WHERE session_id = ?`)
    .get(sessionId) as { compressed?: string } | undefined
  return row?.compressed ?? ''
}

export function setShortMemory(sessionId: string, compressed: string): void {
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO short_memory (session_id, compressed, updated_at) VALUES (?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET compressed=excluded.compressed, updated_at=excluded.updated_at`
    )
    .run(sessionId, compressed, now)
}

/** Keep-key compression: preserve constraints, goals, paths, errors, decisions. */
export function compressContext(messages: string[]): string {
  const keys: string[] = []
  for (const m of messages) {
    const lines = m.split(/\r?\n/)
    for (const line of lines) {
      if (
        /(必须|不要|禁止|偏好|目标|验收|路径|错误|失败|决定|结论|TODO|完成)/i.test(line) ||
        /[A-Za-z]:\\|\//.test(line) ||
        /error|failed|exception/i.test(line)
      ) {
        keys.push(line.trim())
      }
    }
  }
  const uniq = [...new Set(keys)].slice(-80)
  return uniq.join('\n')
}
