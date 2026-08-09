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

  it('supports fenced thinking blocks', () => {
    const r = splitAssistantContent('```thinking\n内部推理\n```\n正文')
    expect(r.thinking).toBe('内部推理')
    expect(r.body).toBe('正文')
  })
})
