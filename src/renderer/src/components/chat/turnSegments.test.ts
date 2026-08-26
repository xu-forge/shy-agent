import { describe, expect, it } from 'vitest'
import { applyTurnEvent, type TurnSegment } from './turnSegments'

describe('applyTurnEvent', () => {
  it('reasoning_delta 开新片段，后续 delta 合并', () => {
    let segs: TurnSegment[] = []
    segs = applyTurnEvent(segs, { type: 'reasoning_delta', content: '先' }, 1000)
    segs = applyTurnEvent(segs, { type: 'reasoning_delta', content: '搜' }, 1001)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ kind: 'reasoning', content: '先搜', done: false })
  })

  it('reasoning_done 写入耗时', () => {
    let segs: TurnSegment[] = []
    segs = applyTurnEvent(segs, { type: 'reasoning_delta', content: '想' }, 1000)
    segs = applyTurnEvent(segs, { type: 'reasoning_done' }, 3500)
    expect(segs[0]).toMatchObject({ kind: 'reasoning', done: true, durationMs: 2500 })
  })

  it('tool_call 插入 running，tool_result 更新 done/failed 且保持原位', () => {
    let segs: TurnSegment[] = []
    segs = applyTurnEvent(segs, { type: 'reasoning_delta', content: 'x' }, 1)
    segs = applyTurnEvent(segs, { type: 'tool_call', id: 't1', name: 'web_search', input: { query: '广州' } }, 2)
    segs = applyTurnEvent(segs, { type: 'assistant_delta', content: '正文' }, 3)
    expect(segs.map((s) => s.kind)).toEqual(['reasoning', 'tool', 'text'])
    segs = applyTurnEvent(segs, { type: 'tool_result', id: 't1', output: { results: [] } }, 4)
    expect(segs[1]).toMatchObject({ kind: 'tool', status: 'done' })
    expect(segs.map((s) => s.kind)).toEqual(['reasoning', 'tool', 'text'])
    segs = applyTurnEvent(segs, { type: 'tool_call', id: 't2', name: 'grep' }, 5)
    segs = applyTurnEvent(segs, { type: 'tool_result', id: 't2', error: 'boom' }, 6)
    expect(segs[3]).toMatchObject({ kind: 'tool', status: 'failed', error: 'boom' })
  })

  it('assistant_delta 合并到最后一个 text 片段', () => {
    let segs: TurnSegment[] = []
    segs = applyTurnEvent(segs, { type: 'assistant_delta', content: '周' }, 1)
    segs = applyTurnEvent(segs, { type: 'assistant_delta', content: '末' }, 2)
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ kind: 'text', content: '周末' })
  })
})
