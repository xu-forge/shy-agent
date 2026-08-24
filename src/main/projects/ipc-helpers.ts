import { join } from 'path'
import type { FileOp } from '../../shared/ipc'
import { assertInsideRoot } from './fs-guard'

export type KnownIpcError = 'path_escape' | 'root_path_taken'

export function asIpcFailure(err: unknown): { ok: false; error: KnownIpcError } | null {
  if (
    err instanceof Error &&
    (err.message === 'path_escape' || err.message === 'root_path_taken')
  ) {
    return { ok: false, error: err.message }
  }
  return null
}

export type SessionWriteLookup = (sessionId: string) => Array<{
  op: FileOp | string
  path: string
  sessionId: string
}>

export function collectProjectMaterialWrites(
  sessions: Array<{ id: string; projectId?: string | null }>,
  projectId: string,
  listFiles: SessionWriteLookup
): Array<{ path: string; sessionId: string }> {
  const writes: Array<{ path: string; sessionId: string }> = []
  for (const session of sessions) {
    if (session.projectId !== projectId) continue
    for (const record of listFiles(session.id)) {
      if (record.op !== 'write') continue
      writes.push({ path: record.path, sessionId: record.sessionId })
    }
  }
  return writes
}

export function resolveProjectFilePath(rootPath: string, relativePath: string): string {
  return assertInsideRoot(rootPath, join(rootPath, relativePath))
}
