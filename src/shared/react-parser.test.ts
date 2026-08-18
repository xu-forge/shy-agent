import { describe, expect, it } from 'vitest'
import { parseReActContent } from './react-parser'

describe('parseReActContent', () => {
  it('解析完整 Thought/Action/Observation 三段', () => {
    const content = `Thought: 我需要先看 goal-driver.ts 的循环结构。
Action: fs_read {"path": "src/main/agent/goal-driver.ts"}
Observation: 文件包含 runGoalDriver 函数。`
    const r = parseReActContent(content)
    expect(r.thought).toContain('goal-driver.ts')
    expect(r.action).toContain('fs_read')
    expect(r.observation).toContain('runGoalDriver')
  })

  it('只有 Thought + Action（无 Observation）', () => {
    const content = `Thought: 用户问基本概念。
Action: ReAct 是一种...`
    const r = parseReActContent(content)
    expect(r.thought).toContain('用户问')
    expect(r.action).toContain('ReAct')
    expect(r.observation).toBe('')
  })

  it('大小写不敏感', () => {
    const content = `thought: 小写
action: 也行`
    const r = parseReActContent(content)
    expect(r.thought).toContain('小写')
    expect(r.action).toContain('也行')
  })

  it('多行内容（标签后换行继续）', () => {
    const content = `Thought: 我需要
先读
再分析。
Action: 工具调用`
    const r = parseReActContent(content)
    expect(r.thought).toContain('先读')
    expect(r.thought).toContain('再分析')
    expect(r.action).toContain('工具调用')
  })

  it('空内容返回空 parts', () => {
    const r = parseReActContent('')
    expect(r).toEqual({ thought: '', action: '', observation: '', complete: false })
  })

  it('无标签内容全部为 thought', () => {
    const r = parseReActContent('这是一段普通文本')
    expect(r.thought).toBe('这是一段普通文本')
    expect(r.action).toBe('')
    expect(r.observation).toBe('')
  })

  it('中间有重复标签（最后一段覆盖）', () => {
    const content = `Thought: 第一次推理。
Thought: 第二次推理，更准确。`
    const r = parseReActContent(content)
    expect(r.thought).toContain('第二次')
  })

  it('标签前有缩进 / 空格容忍', () => {
    const content = `  Thought: 缩进
  Action: 缩进动作`
    const r = parseReActContent(content)
    expect(r.thought).toContain('缩进')
    expect(r.action).toContain('缩进')
  })
})
