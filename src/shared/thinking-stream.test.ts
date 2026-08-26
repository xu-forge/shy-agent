import { describe, expect, it } from 'vitest'
import { ThinkingStreamParser } from './thinking-stream'

describe('ThinkingStreamParser', () => {
  it('无标签 chunk 全部作为 text', () => {
    const p = new ThinkingStreamParser()
    expect(p.push('你好')).toEqual([{ type: 'text', delta: '你好' }])
  })

  it('完整 think 块拆成 reasoning + reasoning_done + text', () => {
    const p = new ThinkingStreamParser()
    const events = p.push('<think>先搜一下</think>\n周末去珠江夜游')
    expect(events).toEqual([
      { type: 'reasoning', delta: '先搜一下' },
      { type: 'reasoning_done' },
      { type: 'text', delta: '\n周末去珠江夜游' }
    ])
  })

  it('跨 chunk 拼接开闭标签', () => {
    const p = new ThinkingStreamParser()
    expect(p.push('<thi')).toEqual([])
    expect(p.push('nk>想')).toEqual([{ type: 'reasoning', delta: '想' }])
    expect(p.push('法</thin')).toEqual([{ type: 'reasoning', delta: '法' }])
    expect(p.push('k>答案')).toEqual([{ type: 'reasoning_done' }, { type: 'text', delta: '答案' }])
  })

  it('flush 在未闭合 reasoning 时发出 reasoning_done', () => {
    const p = new ThinkingStreamParser()
    expect(p.push('<think>未完')).toEqual([{ type: 'reasoning', delta: '未完' }])
    expect(p.flush()).toEqual([{ type: 'reasoning_done' }])
  })

  it('支持 thinking 标签', () => {
    const p = new ThinkingStreamParser()
    const events = p.push('<thinking>x</thinking>y')
    expect(events).toEqual([
      { type: 'reasoning', delta: 'x' },
      { type: 'reasoning_done' },
      { type: 'text', delta: 'y' }
    ])
  })
})
