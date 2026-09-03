import { describe, expect, it } from 'vitest'
import { extractAssistantResult, resolveScheduleResultView } from './scheduleRunResult'

describe('extractAssistantResult', () => {
  it('优先 resultContent，绝不返回 user 消息', () => {
    expect(
      extractAssistantResult({
        resultContent: '正式结果',
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '中间话' }
        ]
      })
    ).toBe('正式结果')

    expect(
      extractAssistantResult({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'assistant', content: '助手回复' }
        ]
      })
    ).toBe('助手回复')

    expect(
      extractAssistantResult({
        messages: [{ role: 'user', content: '你好' }]
      })
    ).toBeNull()
  })

  it('优先 kind=result 的助手消息', () => {
    expect(
      extractAssistantResult({
        messages: [
          { role: 'assistant', content: '过程' },
          { role: 'assistant', content: '完整结果', kind: 'result' }
        ]
      })
    ).toBe('完整结果')
  })
})

describe('resolveScheduleResultView', () => {
  it('直接执行成功展示 Agent 执行结果', () => {
    const view = resolveScheduleResultView({
      run: {
        status: 'succeeded',
        action: 'remind',
        errorMessage: null,
        resultSummary: 'RAG 优化建议…',
        sessionId: 's1'
      }
    })
    expect(view).toEqual({
      heading: '执行结果',
      body: 'RAG 优化建议…',
      renderAs: 'markdown'
    })
  })

  it('技能成功优先 resultSummary，且不把 user 提示词当结果', () => {
    expect(
      resolveScheduleResultView({
        run: {
          status: 'succeeded',
          action: 'run_skill',
          errorMessage: null,
          resultSummary: '行情总结…',
          sessionId: 's1'
        },
        session: { messages: [{ role: 'user', content: '提示词' }] }
      })
    ).toEqual({ heading: '执行结果', body: '行情总结…', renderAs: 'markdown' })

    expect(
      resolveScheduleResultView({
        run: {
          status: 'succeeded',
          action: 'run_skill',
          errorMessage: null,
          resultSummary: null,
          sessionId: 's1'
        },
        session: { messages: [{ role: 'user', content: '你好' }] }
      }).body
    ).toContain('暂无模型回复')
  })
})
