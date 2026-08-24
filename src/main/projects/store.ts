import { randomUUID } from 'crypto'
import { basename } from 'path'
import type { Project, ProjectType } from '../../shared/ipc'
import { getDb } from '../memory/db'

export type { Project, ProjectType }

export function ensureProjectTables(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
}

function now(): string {
  return new Date().toISOString()
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type === 'material' ? 'material' : 'code',
    rootPath: String(row.root_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }
}

export function createProject(input: {
  type: ProjectType
  rootPath: string
  name?: string
}): Project {
  ensureProjectTables()
  const id = randomUUID()
  const t = now()
  const name = input.name?.trim() || basename(input.rootPath)
  try {
    getDb()
      .prepare(
        `INSERT INTO projects (id, name, type, root_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, input.type, input.rootPath, t, t)
  } catch (err) {
    if (
      err instanceof Error &&
      'code' in err &&
      (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
    ) {
      throw new Error('root_path_taken')
    }
    throw err
  }
  return {
    id,
    name,
    type: input.type,
    rootPath: input.rootPath,
    createdAt: t,
    updatedAt: t
  }
}

export function listProjects(): Project[] {
  ensureProjectTables()
  const rows = getDb()
    .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function getProject(id: string): Project | null {
  ensureProjectTables()
  const row = getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined
  if (!row) return null
  return rowToProject(row)
}

export function deleteProject(id: string): { ok: boolean } {
  ensureProjectTables()
  const info = getDb().prepare(`DELETE FROM projects WHERE id = ?`).run(id)
  return { ok: info.changes > 0 }
}
