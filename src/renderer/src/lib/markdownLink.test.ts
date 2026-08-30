import { describe, expect, it } from 'vitest'
import { httpUrlFromMarkdownHref } from './markdownLink'

describe('httpUrlFromMarkdownHref', () => {
  it('绝对 http(s) 返回规范化 URL', () => {
    expect(httpUrlFromMarkdownHref('https://example.com/a')).toBe('https://example.com/a')
    expect(httpUrlFromMarkdownHref('http://example.com')).toBe('http://example.com/')
  })

  it('协议相对链接补 https', () => {
    expect(httpUrlFromMarkdownHref('//cdn.example.com/x')).toBe('https://cdn.example.com/x')
  })

  it('相对路径、锚点、空值不打开浏览器', () => {
    expect(httpUrlFromMarkdownHref('./notes.md')).toBeNull()
    expect(httpUrlFromMarkdownHref('05-multi-agent-system.md')).toBeNull()
    expect(httpUrlFromMarkdownHref('#section')).toBeNull()
    expect(httpUrlFromMarkdownHref('')).toBeNull()
    expect(httpUrlFromMarkdownHref(undefined)).toBeNull()
  })

  it('拒绝 javascript / data / mailto', () => {
    expect(httpUrlFromMarkdownHref('javascript:alert(1)')).toBeNull()
    expect(httpUrlFromMarkdownHref('data:text/html,hi')).toBeNull()
    expect(httpUrlFromMarkdownHref('mailto:a@b.com')).toBeNull()
  })
})
