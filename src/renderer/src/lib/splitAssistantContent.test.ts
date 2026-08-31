import { describe, expect, it } from 'vitest'
import { splitAssistantContent } from './splitAssistantContent'

describe('splitAssistantContent', () => {
  it('splits closed think tags from markdown body', () => {
    const r = splitAssistantContent('<think>先分析需求</think>\n\n## 结论\n\n- 用 A')
    expect(r.thinking).toBe('先分析需求')
    expect(r.body).toContain('## 结论')
    expect(r.thinkingOpen).toBe(false)
  })

  it('handles streaming open think tag', () => {
    const r = splitAssistantContent('<think>还在想')
    expect(r.thinking).toBe('还在想')
    expect(r.body).toBe('')
    expect(r.thinkingOpen).toBe(true)
  })

  it('截断的 think（无闭合标签）仍进入 thinking，不留在正文', () => {
    const r = splitAssistantContent('<think>不过，等等，看错误结构\n\n让我做一个简洁的 final answer。')
    expect(r.thinking).toContain('错误结构')
    expect(r.body).toBe('')
    expect(r.thinkingOpen).toBe(true)
  })

  it('supports fenced thinking blocks', () => {
    const r = splitAssistantContent('```thinking\n内部推理\n```\n正文')
    expect(r.thinking).toBe('内部推理')
    expect(r.body).toBe('正文')
  })
})
