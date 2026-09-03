import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '../../../shared/ipc'
import { flattenGroupSessions, recentSessions } from './sidebarRecent'

function sess(partial: Partial<SessionSummary> & Pick<SessionSummary, 'id' | 'updatedAt'>): SessionSummary {
  return {
    title: partial.title ?? partial.id,
    mode: 'interactive',
    createdAt: partial.createdAt ?? partial.updatedAt,
    paused: false,
    ...partial
  }
}

describe('recentSessions', () => {
  it('按 updatedAt 降序排列', () => {
    const list = [
      sess({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' }),
      sess({ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' }),
      sess({ id: 'c', updatedAt: '2026-02-01T00:00:00.000Z' })
    ]
    expect(recentSessions(list).map((s) => s.id)).toEqual(['b', 'c', 'a'])
  })

  it('按 limit 截断', () => {
    const list = [
      sess({ id: 'a', updatedAt: '2026-01-03T00:00:00.000Z' }),
      sess({ id: 'b', updatedAt: '2026-01-02T00:00:00.000Z' }),
      sess({ id: 'c', updatedAt: '2026-01-01T00:00:00.000Z' })
    ]
    expect(recentSessions(list, 2).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('空列表返回 []', () => {
    expect(recentSessions([])).toEqual([])
  })

  it('limit 为 0 返回 []', () => {
    expect(recentSessions([sess({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })], 0)).toEqual([])
  })
})

describe('flattenGroupSessions', () => {
  it('去重并扁平化', () => {
    const a = sess({ id: 'a', updatedAt: '2026-01-02T00:00:00.000Z' })
    const b = sess({ id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(flattenGroupSessions([{ sessions: [a] }, { sessions: [a, b] }]).map((s) => s.id)).toEqual([
      'a',
      'b'
    ])
  })
})
