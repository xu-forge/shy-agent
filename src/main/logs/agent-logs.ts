import { readdirSync, readFileSync, statSync, existsSync } from 'fs'
import { basename, join } from 'path'
import { shell } from 'electron'
import type { AgentLogFileSummary } from '../../shared/ipc'
import { getShyPaths } from '../paths'

export function listAgentLogFiles(): AgentLogFileSummary[] {
  const dir = getShyPaths().logsAgentDir
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((n) => n.endsWith('.jsonl'))
    .map((name) => {
      const path = join(dir, name)
      const st = statSync(path)
      return { name, path, size: st.size, mtimeMs: st.mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
}

export function readAgentLogFile(input: {
  name: string
  offset?: number
  limit?: number
}): { name: string; content: string; truncated: boolean } {
  const safe = basename(input.name)
  if (safe !== input.name || !safe.endsWith('.jsonl')) {
    throw new Error('非法日志文件名')
  }
  const path = join(getShyPaths().logsAgentDir, safe)
  if (!existsSync(path)) throw new Error('日志不存在')
  const raw = readFileSync(path, 'utf8')
  const offset = Math.max(0, input.offset ?? 0)
  const limit = input.limit ?? 256_000
  const slice = raw.slice(offset, offset + limit)
  return {
    name: safe,
    content: slice,
    truncated: offset + slice.length < raw.length
  }
}

export async function revealAgentLogsDir(): Promise<{ ok: boolean }> {
  const dir = getShyPaths().logsAgentDir
  const err = await shell.openPath(dir)
  return { ok: !err }
}
