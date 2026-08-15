import { describe, expect, it } from 'vitest'
import { selectAutoResume } from './goal-resume'

describe('selectAutoResume', () => {
  it('只续 updatedAt 最新的一条，其余进 pauseIds', () => {
    const r = selectAutoResume([
      { id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'b', updatedAt: '2026-08-02T00:00:00.000Z' }
    ])
    expect(r.resumeId).toBe('b')
    expect(r.pauseIds).toEqual(['a'])
  })

  it('空列表不续', () => {
    expect(selectAutoResume([]).resumeId).toBeNull()
  })
})
