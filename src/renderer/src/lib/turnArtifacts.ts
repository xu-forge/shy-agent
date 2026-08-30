import type { SessionFileRecord } from '../../../shared/ipc'
import { artifactFiles } from './projectBind'

export type TurnArtifactGroup = {
  startMs: number
  endMs: number
  files: SessionFileRecord[]
}

type TimedMsg = { role: string; createdAt?: string }

function parseMsgTime(createdAt: string | undefined): number {
  if (!createdAt) return NaN
  const n = Date.parse(createdAt)
  return Number.isFinite(n) ? n : NaN
}

/** 每轮用户消息对应 [本轮发送, 下一轮用户发送) 的写入产物。 */
export function artifactFilesForTurns(
  messages: readonly TimedMsg[],
  files: SessionFileRecord[]
): TurnArtifactGroup[] {
  const users = messages.filter((m) => m.role === 'user')
  if (users.length === 0) return []
  return users.map((u, i) => {
    const parsed = parseMsgTime(u.createdAt)
    const startMs = i === 0 ? 0 : Number.isFinite(parsed) ? parsed : 0
    const next = users[i + 1]
    const nextMs = next ? parseMsgTime(next.createdAt) : Infinity
    const endMs = Number.isFinite(nextMs) ? nextMs : Infinity
    const lo = Number.isFinite(startMs) ? startMs : 0
    return {
      startMs: lo,
      endMs,
      files: artifactFiles(files.filter((f) => f.occurredAt >= lo && f.occurredAt < endMs))
    }
  })
}

export type TurnBlock = { kind: 'msg'; role: string } | { kind: 'timeline' }

/** 下一块是用户消息，或已是最后一块 → 本轮回复结束，可挂产物卡。 */
export function isTurnEndBlock(blocks: readonly TurnBlock[], index: number): boolean {
  const next = blocks[index + 1]
  if (!next) return true
  return next.kind === 'msg' && next.role === 'user'
}
