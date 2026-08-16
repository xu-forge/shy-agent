import { describe, expect, it } from 'vitest'
import { stripThink } from '../agent/goal-policy'
import { localSummaryTitle } from './title'

describe('session title', () => {
  it('stripThink 后不含 think 标签', () => {
    expect(stripThink('<think>用户想要我为这个对话生成一个极短的')).not.toMatch(/<think>/i)
  })

  it('本地标题来自用户原话首句', () => {
    expect(localSummaryTitle('帮我到同花顺总结周末新闻。后面还有废话')).toContain('同花顺')
  })
})
