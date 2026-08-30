import { describe, expect, it } from 'vitest'
import { shouldBlockRendererNavigation } from './renderer-navigation'

describe('shouldBlockRendererNavigation', () => {
  it('拦截跳出应用壳的 http(s)', () => {
    expect(
      shouldBlockRendererNavigation('http://localhost:5173/', 'https://example.com/doc')
    ).toBe(true)
  })

  it('拦截同 origin 换路径（相对 md 链接）', () => {
    expect(
      shouldBlockRendererNavigation(
        'http://localhost:5173/',
        'http://localhost:5173/05-multi-agent-system.md'
      )
    ).toBe(true)
  })

  it('允许仅 hash 变化', () => {
    expect(
      shouldBlockRendererNavigation('http://localhost:5173/', 'http://localhost:5173/#section')
    ).toBe(false)
  })

  it('允许同一文档 URL', () => {
    expect(
      shouldBlockRendererNavigation('http://localhost:5173/', 'http://localhost:5173/')
    ).toBe(false)
  })
})
