import { describe, expect, it } from 'vitest'
import { addTokenUsed, asTokenCount, tokensOf } from './token-usage'

describe('token-usage', () => {
  it('asTokenCount 收成非负整数', () => {
    expect(asTokenCount(12.9)).toBe(12)
    expect(asTokenCount('3400')).toBe(3400)
    expect(asTokenCount(-1)).toBe(0)
    expect(asTokenCount('nope')).toBe(0)
    expect(asTokenCount(5_000_000)).toBe(0)
  })

  it('tokensOf 读 usage_metadata.total_tokens', () => {
    expect(tokensOf({ usage_metadata: { total_tokens: 120 } })).toBe(120)
  })

  it('tokensOf 在 total 缺失时用 input+output', () => {
    expect(
      tokensOf({ usage_metadata: { input_tokens: 100, output_tokens: 20 } })
    ).toBe(120)
  })

  it('tokensOf 兼容 response_metadata.tokenUsage', () => {
    expect(
      tokensOf({
        response_metadata: {
          tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        }
      })
    ).toBe(15)
  })

  it('字符串 total_tokens 不会在累加时拼接暴涨', () => {
    let used = tokensOf({ usage_metadata: { total_tokens: '120000' } })
    used = addTokenUsed(used, tokensOf({ usage_metadata: { total_tokens: '120000' } }))
    used = addTokenUsed(used, tokensOf({ usage_metadata: { total_tokens: '120000' } }))
    expect(used).toBe(360_000)
    expect(typeof used).toBe('number')
  })
})
