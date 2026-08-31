import { describe, expect, it } from 'vitest'
import { enqueueStreamDelta, mergeAssistantSnapshot } from './streamingDelta'

describe('enqueueStreamDelta', () => {
  it('同角色增量拼到 pending，不 flush', () => {
    const a = enqueueStreamDelta(null, 'reasoning', '用户没回答')
    expect(a.flush).toBeNull()
    const b = enqueueStreamDelta(a.pending, 'reasoning', '，我需要等')
    expect(b.flush).toBeNull()
    expect(b.pending).toEqual({ role: 'reasoning', content: '用户没回答，我需要等' })
  })

  it('切到正文时先交出思考 pending，避免末尾被丢掉', () => {
    const pending = { role: 'reasoning' as const, content: '不过，等等，看' }
    const out = enqueueStreamDelta(pending, 'assistant', '我已经把选项摆出来了')
    expect(out.flush).toEqual(pending)
    expect(out.pending).toEqual({ role: 'assistant', content: '我已经把选项摆出来了' })
  })
})

describe('mergeAssistantSnapshot', () => {
  it('完整 think 比流式片段更长时补齐思考块', () => {
    const streaming = [
      { role: 'reasoning', content: '不过，等等，看' },
      { role: 'assistant', content: '等你点一下' }
    ]
    const next = mergeAssistantSnapshot(
      streaming,
      {
        thinking: '不过，等等，看错误结构，answer 是空字符串。让我做一个简洁的 final answer。',
        body: '我已经把选项摆出来了，等你点一下选哪条路：'
      },
      '',
      (role, content) => ({ role, content })
    )
    expect(next[0]?.content).toContain('错误结构')
    expect(next[1]?.content).toContain('等你点一下选哪条路')
  })

  it('没有思考片段时补上 reasoning；没有正文则新建 assistant', () => {
    const next = mergeAssistantSnapshot(
      [],
      { thinking: '完整思考', body: '完整回复' },
      '',
      (role, content) => ({ role, content })
    )
    expect(next).toEqual([
      { role: 'reasoning', content: '完整思考' },
      { role: 'assistant', content: '完整回复' }
    ])
  })

  it('无 think 时用 raw 作为正文', () => {
    const next = mergeAssistantSnapshot(
      [],
      { thinking: '', body: '' },
      '纯文本',
      (role, content) => ({ role, content })
    )
    expect(next).toEqual([{ role: 'assistant', content: '纯文本' }])
  })
})
