import { describe, expect, it } from 'vitest'
import { getToolLabel } from './toolLabels'

describe('getToolLabel', () => {
  it('browser_fetch / web_fetch → 抓取网页', () => {
    expect(getToolLabel('browser_fetch', { url: 'https://example.com/a' })).toContain('抓取网页')
    expect(getToolLabel('web_fetch', { url: 'https://example.com/a' })).toContain('example.com')
  })

  it('web_search → 搜索网页 + query', () => {
    expect(getToolLabel('web_search', { query: '广州周末' })).toMatch(/搜索网页.*广州周末/)
  })

  it('grep / glob / fs_edit 人话标签', () => {
    expect(getToolLabel('grep', { pattern: 'foo' })).toMatch(/搜索代码/)
    expect(getToolLabel('glob', { pattern: '**/*.ts' })).toMatch(/查找文件/)
    expect(getToolLabel('fs_edit', { path: '/tmp/a.ts' })).toMatch(/编辑文件/)
  })

  it('show_widget / present_artifact / ask_user', () => {
    expect(getToolLabel('show_widget', { widgetType: 'table' })).toMatch(/可视化/)
    expect(getToolLabel('present_artifact', { paths: ['a.html', 'b.md'] })).toMatch(/呈现产物/)
    expect(getToolLabel('ask_user', { question: '选哪个？' })).toMatch(/询问用户/)
  })

  it('未知工具 fallback raw 名', () => {
    expect(getToolLabel('mystery_tool')).toBe('mystery_tool')
  })
})
