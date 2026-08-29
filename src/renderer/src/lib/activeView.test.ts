import { describe, expect, it } from 'vitest'
import { chatPayload, resolveActiveView } from './activeView'

describe('resolveActiveView', () => {
  it('代码工作区有激活 tab 时返回 code 快照', () => {
    expect(resolveActiveView('code', 'src/a.ts', 'notes/a.md')).toEqual({
      kind: 'code',
      relativePath: 'src/a.ts'
    })
  })

  it('代码工作区无激活 tab 时省略', () => {
    expect(resolveActiveView('code', null, 'notes/a.md')).toBeUndefined()
    expect(resolveActiveView('code', '', 'notes/a.md')).toBeUndefined()
  })

  it('素材工作区 lightbox 打开时返回 material 快照', () => {
    expect(resolveActiveView('material', 'src/a.ts', 'notes/a.md')).toEqual({
      kind: 'material',
      relativePath: 'notes/a.md'
    })
  })

  it('素材工作区 lightbox 关闭时省略', () => {
    expect(resolveActiveView('material', 'src/a.ts', null)).toBeUndefined()
    expect(resolveActiveView('material', 'src/a.ts', '')).toBeUndefined()
  })

  it('非 code/material 工作区一律省略', () => {
    expect(resolveActiveView('unbound', 'src/a.ts', 'notes/a.md')).toBeUndefined()
    expect(resolveActiveView(null, 'src/a.ts', 'notes/a.md')).toBeUndefined()
  })

  it('反斜杠路径规范为 posix', () => {
    expect(resolveActiveView('code', 'src\\a.ts', null)).toEqual({
      kind: 'code',
      relativePath: 'src/a.ts'
    })
    expect(resolveActiveView('material', null, 'notes\\a.md')).toEqual({
      kind: 'material',
      relativePath: 'notes/a.md'
    })
  })
})

describe('chatPayload', () => {
  const base = { sessionId: 's1', message: '这段怎么改', mode: 'interactive' as const }

  it('有 activeView 时带上快照且不改 message', () => {
    const view = { kind: 'code' as const, relativePath: 'src/a.ts' }
    expect(chatPayload(base, view)).toEqual({
      sessionId: 's1',
      message: '这段怎么改',
      mode: 'interactive',
      activeView: view
    })
  })

  it('无 activeView 时省略该键且 message 仍为原文', () => {
    const payload = chatPayload(base, undefined)
    expect(payload).toEqual(base)
    expect(payload).not.toHaveProperty('activeView')
    expect(payload.message).toBe('这段怎么改')
  })
})
