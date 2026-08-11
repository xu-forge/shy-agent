import { randomUUID } from 'crypto'
import type {
  AgentMode,
  ChatMessage,
  GoalChecklistItem,
  SessionDetail,
  SessionSummary
} from '../../shared/ipc'
import { getDb } from '../memory/db'

export function ensureSessionTables(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      mode TEXT NOT NULL,
      goal TEXT,
      checklist TEXT NOT NULL DEFAULT '[]',
      short_memory TEXT NOT NULL DEFAULT '',
      paused INTEGER NOT NULL DEFAULT 0,
      checkpoint TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    );
  `)
}

function now(): string {
  return new Date().toISOString()
}

export function createSession(
  mode: AgentMode = 'interactive',
  title?: string,
  id?: string
): SessionSummary {
  ensureSessionTables()
  const sessionId = id || randomUUID()
  const t = now()
  const finalTitle = title?.trim() || '新对话'
  getDb()
    .prepare(
      `INSERT INTO sessions (id, title, mode, goal, checklist, short_memory, paused, created_at, updated_at)
       VALUES (?, ?, ?, NULL, '[]', '', 0, ?, ?)`
    )
    .run(sessionId, finalTitle, mode, t, t)
  return { id: sessionId, title: finalTitle, mode, createdAt: t, updatedAt: t, paused: false }
}

export function listSessions(): SessionSummary[] {
  ensureSessionTables()
  const rows = getDb()
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToSummary)
}

export function getSession(id: string): SessionDetail | null {
  ensureSessionTables()
  const row = getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  const messages = getDb()
    .prepare(`SELECT * FROM session_messages WHERE session_id = ? ORDER BY created_at ASC`)
    .all(id) as Record<string, unknown>[]
  const summary = rowToSummary(row)
  return {
    ...summary,
    messages: messages.map((m) => ({
      id: String(m.id),
      role: m.role as ChatMessage['role'],
      content: String(m.content),
      createdAt: String(m.created_at)
    })),
    checklist: JSON.parse(String(row.checklist || '[]')) as GoalChecklistItem[],
    shortMemory: String(row.short_memory || '')
  }
}

export function deleteSession(id: string): void {
  ensureSessionTables()
  getDb().prepare(`DELETE FROM session_messages WHERE session_id = ?`).run(id)
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
}

export function appendMessage(
  sessionId: string,
  role: ChatMessage['role'],
  content: string
): ChatMessage {
  ensureSessionTables()
  const msg: ChatMessage = {
    id: randomUUID(),
    role,
    content,
    createdAt: now()
  }
  getDb()
    .prepare(
      `INSERT INTO session_messages (id, session_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
    )
    .run(msg.id, sessionId, role, content, msg.createdAt)
  getDb()
    .prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`)
    .run(msg.createdAt, sessionId)
  // 占位标题：首条用户消息的本地摘要；正式总结标题由 summarizeSessionTitle 刷新
  if (role === 'user') {
    const s = getDb().prepare(`SELECT title FROM sessions WHERE id = ?`).get(sessionId) as
      | { title?: string }
      | undefined
    if (s?.title === '新对话') {
      getDb()
        .prepare(`UPDATE sessions SET title = ? WHERE id = ?`)
        .run(placeholderTitle(content), sessionId)
    }
  }
  return msg
}

function placeholderTitle(userText: string): string {
  const t = userText
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return '新对话'
  const sentence = t.split(/[。！？!?\n]/)[0]?.trim() || t
  const clipped = sentence.slice(0, 28)
  return clipped.length < sentence.length ? `${clipped}…` : clipped
}

export function setSessionTitle(sessionId: string, title: string): void {
  ensureSessionTables()
  const t = title.trim().slice(0, 40)
  if (!t) return
  getDb()
    .prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`)
    .run(t, now(), sessionId)
}

export function updateSessionRuntime(
  sessionId: string,
  patch: {
    mode?: AgentMode
    goal?: string | null
    checklist?: GoalChecklistItem[]
    shortMemory?: string
    paused?: boolean
    checkpoint?: string | null
  }
): void {
  ensureSessionTables()
  const cur = getDb().prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId) as
    | Record<string, unknown>
    | undefined
  if (!cur) return
  getDb()
    .prepare(
      `UPDATE sessions SET mode=?, goal=?, checklist=?, short_memory=?, paused=?, checkpoint=?, updated_at=? WHERE id=?`
    )
    .run(
      patch.mode ?? cur.mode,
      patch.goal === undefined ? cur.goal : patch.goal,
      JSON.stringify(patch.checklist ?? JSON.parse(String(cur.checklist || '[]'))),
      patch.shortMemory ?? cur.short_memory,
      patch.paused === undefined ? cur.paused : patch.paused ? 1 : 0,
      patch.checkpoint === undefined ? cur.checkpoint : patch.checkpoint,
      now(),
      sessionId
    )
}

export function getCheckpoint(sessionId: string): string | null {
  ensureSessionTables()
  const row = getDb().prepare(`SELECT checkpoint FROM sessions WHERE id = ?`).get(sessionId) as
    | { checkpoint?: string | null }
    | undefined
  return row?.checkpoint ?? null
}

function rowToSummary(row: Record<string, unknown>): SessionSummary {
  return {
    id: String(row.id),
    title: String(row.title),
    mode: row.mode === 'goal' ? 'goal' : 'interactive',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    paused: Boolean(row.paused),
    goal: row.goal ? String(row.goal) : undefined
  }
}
