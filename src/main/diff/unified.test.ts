import { describe, it, expect } from 'vitest'
import { computePatch, parseUnifiedDiff, formatUnifiedDiff } from './unified'

describe('computePatch（jsdiff 封装）', () => {
  it('修改：上下文 3 行 + hunk 头正确', () => {
    const old = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].join('\n')
    const next = ['a', 'b', 'c', 'D', 'e', 'f', 'g', 'h'].join('\n')
    const p = computePatch(old, next, 'f.txt')
    expect(p.added).toBe(1)
    expect(p.removed).toBe(1)
    expect(p.hunks).toHaveLength(1)
    const h = p.hunks[0]
    expect(h.oldStart).toBe(1)
    expect(h.lines.map((l) => l.mark + l.text)).toEqual([
      ' a', ' b', ' c', '-d', '+D', ' e', ' f', ' g'
    ])
    expect(p.text).toContain('@@ -1,7 +1,7 @@')
  })

  it('新文件：全量新增', () => {
    const p = computePatch('', 'x\ny', 'new.ts')
    expect(p.added).toBe(2)
    expect(p.removed).toBe(0)
    expect(p.text).toContain('+x')
    expect(p.text).toContain('+y')
  })

  it('清空：全量删除', () => {
    const p = computePatch('x\ny', '', 'gone.md')
    expect(p.added).toBe(0)
    expect(p.removed).toBe(2)
  })

  it('相同内容：无 hunk', () => {
    const p = computePatch('same\nsame', 'same\nsame', 'a')
    expect(p.hunks).toHaveLength(0)
    expect(p.added).toBe(0)
    expect(p.removed).toBe(0)
  })

  it('远距离两处变更拆成两个 hunk', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `l${i}`)
    const next = [...lines]
    next[2] = 'X'
    next[27] = 'Y'
    const p = computePatch(lines.join('\n'), next.join('\n'), 'two.txt')
    expect(p.hunks.length).toBe(2)
  })
})

describe('parseUnifiedDiff ↔ formatUnifiedDiff 往返', () => {
  it('格式化后再解析，hunk 与行标记一致', () => {
    const old = ['1', '2', '3'].join('\n')
    const next = ['1', 'TWO', '3', '4'].join('\n')
    const p = computePatch(old, next, 'rt.ts')
    const parsed = parseUnifiedDiff(formatUnifiedDiff('rt.ts', p.hunks))
    expect(parsed).toHaveLength(p.hunks.length)
    expect(parsed[0].lines).toEqual(p.hunks[0].lines)
    expect(parsed[0].oldStart).toBe(p.hunks[0].oldStart)
  })
})
