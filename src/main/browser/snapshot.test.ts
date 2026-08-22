import { describe, it, expect } from 'vitest'
import {
  buildSnapshot,
  renderSnapshotPage,
  SnapshotStore,
  SNAPSHOT_TTL_MS,
  type RawSnapshotElement
} from './snapshot'

const raw = (over: Partial<RawSnapshotElement> = {}): RawSnapshotElement => ({
  tag: 'button',
  role: '',
  type: '',
  name: '',
  text: '提交',
  cssPath: 'div > button:nth-of-type(1)',
  rect: { x: 0, y: 0, width: 40, height: 20 },
  inViewport: true,
  ...over
})

describe('buildSnapshot', () => {
  it('分配 browser-element ref 并按优先级排序 + 上限 200', () => {
    const many: RawSnapshotElement[] = []
    for (let i = 0; i < 260; i++) {
      many.push(raw({ tag: i % 2 ? 'a' : 'div', text: `e${i}`, cssPath: `div:nth(${i})` }))
    }
    const snap = buildSnapshot(many)
    expect(snap).toHaveLength(200)
    expect(snap[0].ref).toMatch(/^browser-element:[0-9a-f-]+$/)
    // button/a 优先于 div
    expect(snap.findIndex((e) => e.tag === 'div')).toBeGreaterThan(
      snap.findIndex((e) => e.tag === 'a')
    )
  })
})

describe('renderSnapshotPage', () => {
  it('渲染分页文本与翻页提示', () => {
    const els = buildSnapshot([raw(), raw({ tag: 'a', text: '链接' }), raw({ tag: 'input' })])
    const p1 = renderSnapshotPage(els, 0, 2)
    expect(p1).toContain('共 3 个')
    expect(p1).toContain('offset=2')
    const p2 = renderSnapshotPage(els, 2, 2)
    expect(p2).toContain('元素 3-3')
    expect(p2).not.toContain('offset=')
  })
})

describe('SnapshotStore', () => {
  it('ref 解析往返；导航失效；TTL 过期', async () => {
    const store = new SnapshotStore()
    expect(store.resolve('x')).toBeUndefined() // 未 store
    const els = store.store([raw()])
    const ref = els[0].ref
    expect(store.resolve(ref)?.cssPath).toBe('div > button:nth-of-type(1)')

    store.invalidate()
    expect(store.resolve(ref)).toBeUndefined()

    store.store([raw()])
    expect(store.list()).toHaveLength(1)
    // 模拟 TTL 过期
    const RealDate = Date
    const origNow = RealDate.now()
    class FutureDate extends RealDate {
      static now = () => origNow + SNAPSHOT_TTL_MS + 1
    }
    ;(globalThis as Record<string, unknown>).Date = FutureDate
    expect(store.list()).toHaveLength(0)
    ;(globalThis as Record<string, unknown>).Date = RealDate
  })
})
