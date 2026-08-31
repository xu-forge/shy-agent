import { describe, expect, it } from 'vitest'
import { getReactGuide, REACT_GUIDE_BLOCK } from './react-prompt'

describe('REACT_GUIDE_BLOCK', () => {
  it('含工具列表与必须调用规则', () => {
    expect(REACT_GUIDE_BLOCK).toContain('web_search')
    expect(REACT_GUIDE_BLOCK).toMatch(/若当前工具表含 web_search/)
    expect(REACT_GUIDE_BLOCK).toContain('web_fetch')
    expect(REACT_GUIDE_BLOCK).toContain('show_widget')
    expect(REACT_GUIDE_BLOCK).toContain('present_artifact')
    expect(REACT_GUIDE_BLOCK).toContain('browser_fetch')
    expect(REACT_GUIDE_BLOCK).toContain('shell_exec')
    expect(REACT_GUIDE_BLOCK).toContain('必须')
  })

  it('含事实门禁与 visualizer / present 规则', () => {
    expect(REACT_GUIDE_BLOCK).toMatch(/事实类门禁/)
    expect(REACT_GUIDE_BLOCK).toMatch(/Visualizer/)
    expect(REACT_GUIDE_BLOCK).toMatch(/function call/)
    expect(REACT_GUIDE_BLOCK).toMatch(/<show_widget>/)
    expect(REACT_GUIDE_BLOCK).toMatch(/present_artifact/)
    expect(REACT_GUIDE_BLOCK).toMatch(/final_answer/)
  })

  it('含 ask_user 澄清规则', () => {
    expect(REACT_GUIDE_BLOCK).toMatch(/ask_user/)
    expect(REACT_GUIDE_BLOCK).toMatch(/澄清/)
  })

  it('含改已有文件与参数形状规则', () => {
    expect(REACT_GUIDE_BLOCK).toMatch(/改已有文件/)
    expect(REACT_GUIDE_BLOCK).toMatch(/fs_write/)
    expect(REACT_GUIDE_BLOCK).toMatch(/同一轮只调用一次 ask_user/)
    expect(REACT_GUIDE_BLOCK).toMatch(/自动 present/)
  })
})

describe('getReactGuide', () => {
  it('plan 模式：含 plan 阶段提示', () => {
    const out = getReactGuide('plan')
    expect(out).toContain('plan')
    expect(out).toMatch(/checklist|JSON/)
  })

  it('act 模式：含 act 阶段提示', () => {
    const out = getReactGuide('act')
    expect(out).toContain('act')
    expect(out).toMatch(/直接调|JSON/)
  })

  it('verify 模式：含派生需求 + JSON 输出引导', () => {
    const out = getReactGuide('verify')
    expect(out).toContain('verify')
    expect(out).toContain('JSON')
  })

  it('每个模式都返回非空 string', () => {
    expect(getReactGuide('plan').length).toBeGreaterThan(50)
    expect(getReactGuide('act').length).toBeGreaterThan(50)
    expect(getReactGuide('verify').length).toBeGreaterThan(50)
  })
})
