import { describe, expect, it } from 'vitest'
import type { SessionFileRecord } from '../../../shared/ipc'
import { artifactFilesForTurns, isTurnEndBlock } from './turnArtifacts'

function write(id: number, path: string, at: number): SessionFileRecord {
  return { id, sessionId: 's', op: 'write', path, occurredAt: at }
}

const t0 = Date.parse('2026-01-01T00:00:00.000Z')
const t1 = Date.parse('2026-01-01T00:10:00.000Z')

describe('artifactFilesForTurns', () => {
  it('按用户消息时间窗切分，挂到对应轮次', () => {
    const messages = [
      { role: 'user', createdAt: '2026-01-01T00:00:00.000Z' },
      { role: 'assistant', createdAt: '2026-01-01T00:01:00.000Z' },
      { role: 'user', createdAt: '2026-01-01T00:10:00.000Z' },
      { role: 'assistant', createdAt: '2026-01-01T00:11:00.000Z' }
    ]
    const files = [write(1, 'a.md', t0 + 30_000), write(2, 'b.md', t1 + 30_000)]
    const grouped = artifactFilesForTurns(messages, files)
    expect(grouped.map((g) => g.files.map((f) => f.path))).toEqual([['a.md'], ['b.md']])
  })

  it('无用户消息则空', () => {
    expect(
      artifactFilesForTurns(
        [{ role: 'system', createdAt: '2026-01-01T00:00:00.000Z' }],
        [write(1, 'a.md', 1)]
      )
    ).toEqual([])
  })

  it('最后一轮包含该轮之后的全部写入；只计 write', () => {
    const messages = [{ role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }]
    const files: SessionFileRecord[] = [
      write(1, 'a.md', t0 + 1),
      { id: 2, sessionId: 's', op: 'read', path: 'x.ts', occurredAt: t0 + 2 }
    ]
    expect(artifactFilesForTurns(messages, files)[0]?.files.map((f) => f.path)).toEqual(['a.md'])
  })
})

describe('isTurnEndBlock', () => {
  it('下一块是用户消息或已是最后一块时为轮次结尾', () => {
    const blocks = [
      { kind: 'msg' as const, role: 'user' },
      { kind: 'timeline' as const },
      { kind: 'msg' as const, role: 'user' }
    ]
    expect(isTurnEndBlock(blocks, 0)).toBe(false)
    expect(isTurnEndBlock(blocks, 1)).toBe(true)
    expect(isTurnEndBlock(blocks, 2)).toBe(true)
  })
})
