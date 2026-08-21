import { describe, expect, it } from 'vitest'
import {
  applyCompaction,
  applyLight,
  applyStandard,
  applyAggressive,
  compactHistory,
  createSummaryMessage,
  estimateHistoryTokens,
  estimateMessageTokens,
  estimateTextTokens,
  findLastSummaryIndex,
  isSummarySentinel,
  selectAggressiveBoundary,
  shouldCompact,
  trimToolOutput
} from './index'
import type { CompactionMessage, CompactionSettings } from './types'
import { DEFAULT_COMPACTION_SETTINGS } from './types'

// ─── token-estimator ────────────────────────────────────────────

describe('estimateTextTokens', () => {
  it('空串返回 0', () => {
    expect(estimateTextTokens('')).toBe(0)
  })

  it('ASCII 字符串 chars/3 量级', () => {
    const text = 'a'.repeat(100)
    const t = estimateTextTokens(text)
    // 100 chars * (1/3 * 1.2) + 4 = 40 + 4 = 44
    expect(t).toBeGreaterThan(30)
    expect(t).toBeLessThan(60)
  })

  it('CJK 字符串 chars/2 量级(过估)', () => {
    const text = '中'.repeat(100)
    const t = estimateTextTokens(text)
    // 100 * (0.5 * 1.2) + 4 = 60 + 4 = 64
    expect(t).toBeGreaterThan(50)
    expect(t).toBeLessThan(80)
  })

  it('混合字符串落在 ASCII 和 CJK 之间', () => {
    const mixed = 'a中'.repeat(50) // 100 chars
    const t = estimateTextTokens(mixed)
    expect(t).toBeGreaterThan(40)
    expect(t).toBeLessThan(80)
  })
})

describe('estimateHistoryTokens / estimateMessageTokens', () => {
  it('单条 user 消息', () => {
    const t = estimateMessageTokens({ role: 'user', content: 'hello' })
    expect(t).toBeGreaterThan(0)
  })

  it('tool_call +8', () => {
    const noTc = estimateMessageTokens({ role: 'assistant', content: 'ok' })
    const withTc = estimateMessageTokens({
      role: 'assistant',
      content: 'ok',
      toolCalls: [{ id: 'a', name: 'x', args: '{}' }]
    })
    expect(withTc - noTc).toBe(8)
  })

  it('history 累加', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) }
    ]
    const t = estimateHistoryTokens(msgs)
    expect(t).toBeGreaterThan(estimateMessageTokens(msgs[0]!))
  })
})

// ─── 档 1: trimToolOutput + applyLight ──────────────────────────

describe('trimToolOutput', () => {
  it('短内容不截', () => {
    expect(trimToolOutput('abc', 10, 2)).toBe('abc')
  })

  it('长内容 head+tail+省略', () => {
    const long = 'a'.repeat(1000)
    const out = trimToolOutput(long, 100, 50)
    expect(out).toContain('a'.repeat(50))
    expect(out).toContain('…[已省略')
    expect(out.length).toBeLessThan(long.length)
  })
})

describe('applyLight', () => {
  it('只截 tool 消息', () => {
    const long = 'x'.repeat(DEFAULT_COMPACTION_SETTINGS.trimThresholdChars + 100)
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'tool', content: long, toolCallId: 't1' }
    ]
    const out = applyLight(msgs, DEFAULT_COMPACTION_SETTINGS)
    expect(out[0]!.content).toBe('hello') // user 不动
    expect(out[1]!.content).toContain('…[已省略')
    expect(out[1]!.toolCallId).toBe('t1') // 保留 toolCallId
  })

  it('assistant 消息不动', () => {
    const long = 'y'.repeat(DEFAULT_COMPACTION_SETTINGS.trimThresholdChars + 100)
    const msgs: CompactionMessage[] = [
      { role: 'assistant', content: long }
    ]
    const out = applyLight(msgs, DEFAULT_COMPACTION_SETTINGS)
    expect(out[0]!.content).toBe(long)
  })
})

// ─── 档 2: applyStandard ──────────────────────────────────────

describe('applyStandard', () => {
  it('消息数 <= K 不压', () => {
    const msgs: CompactionMessage[] = Array.from({ length: 5 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `m${i}`
    }))
    const out = applyStandard(msgs, DEFAULT_COMPACTION_SETTINGS)
    expect(out.length).toBe(5)
  })

  it('消息数 > K 保留最近 K', () => {
    const K = 5
    const settings: CompactionSettings = { ...DEFAULT_COMPACTION_SETTINGS, slidingWindowKeep: K }
    const msgs: CompactionMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `m${i}`
    }))
    const out = applyStandard(msgs, settings)
    expect(out.length).toBeLessThanOrEqual(K + 2) // 可能多 1-2 条为了切点安全
    expect(out.length).toBeGreaterThanOrEqual(K)
  })

  it('切点绝不在 toolResult', () => {
    // 构造:user, assistant(toolCall), tool, tool, assistant, ...
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0', toolCalls: [{ id: 'tc1', name: 'x', args: '{}' }] },
      { role: 'tool', content: 'tr1', toolCallId: 'tc1' },
      { role: 'tool', content: 'tr2', toolCallId: 'tc1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a2' }
    ]
    const settings: CompactionSettings = { ...DEFAULT_COMPACTION_SETTINGS, slidingWindowKeep: 2 }
    const out = applyStandard(msgs, settings)
    // 切点必须从 user 或 assistant 开始
    expect(out[0]!.role).not.toBe('tool')
  })
})

// ─── 档 3: aggressive ──────────────────────────────────────

describe('summary sentinel + findLastSummaryIndex', () => {
  it('isSummarySentinel 识别', () => {
    expect(isSummarySentinel(createSummaryMessage('hello'))).toBe(true)
    expect(isSummarySentinel({ role: 'user', content: 'hello' })).toBe(false)
    expect(isSummarySentinel({ role: 'assistant', content: '[CONTEXT_SUMMARY] x' })).toBe(false)
  })

  it('findLastSummaryIndex', () => {
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'u0' },
      createSummaryMessage('sum1'),
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' }
    ]
    expect(findLastSummaryIndex(msgs)).toBe(1)
  })
})

describe('selectAggressiveBoundary', () => {
  it('累积达到 trigger 返回 firstKept', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 500 // 降低 trigger 让测试快
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(300) },
      { role: 'assistant', content: 'b'.repeat(300) },
      { role: 'user', content: 'c'.repeat(50) } // 最后这条不进 compacted
    ]
    const plan = selectAggressiveBoundary(msgs, settings, 0)
    expect(plan).not.toBeNull()
    expect(plan!.firstKeptIndex).toBeGreaterThan(0)
    expect(plan!.firstKeptIndex).toBeLessThan(msgs.length)
  })

  it('累积不到 trigger 返回 null', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 1_000_000 // 极大值
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'short' },
      { role: 'assistant', content: 'short' }
    ]
    expect(selectAggressiveBoundary(msgs, settings, 0)).toBeNull()
  })
})

describe('applyAggressive', () => {
  it('无 apiKey / 走本地 summary', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 200
    }
    // 4 条消息,trigger 200,累积到 i=2 时 84*3=252 >= 200,firstKeptIndex=2,compactedCount=2
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) },
      { role: 'user', content: 'c'.repeat(60) },
      { role: 'assistant', content: 'd'.repeat(20) }
    ]
    const out = applyAggressive(msgs, settings)
    expect(out).not.toBeNull()
    expect(out![0]!.content).toContain('[CONTEXT_SUMMARY]')
    expect(out!.length).toBeLessThan(msgs.length)
  })

  it('generateSummary 返回 null → applyAggressive 返回 null', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 100
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) }
    ]
    const out = applyAggressive(msgs, settings, () => null)
    expect(out).toBeNull()
  })

  it('generateSummary throw → applyAggressive 返回 null(fail-closed)', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 100
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) }
    ]
    const out = applyAggressive(msgs, settings, () => {
      throw new Error('LLM 401')
    })
    expect(out).toBeNull()
  })

  it('上一个 summary 之后才开始压缩(避免重复压)', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 200
    }
    const oldSummary = createSummaryMessage('上上次总结')
    const msgs: CompactionMessage[] = [
      oldSummary,
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) },
      { role: 'user', content: 'c'.repeat(60) },
      { role: 'assistant', content: 'd'.repeat(20) }
    ]
    const out = applyAggressive(msgs, settings)
    expect(out).not.toBeNull()
    // 第一个必须是 oldSummary(没被覆盖)
    expect(out![0]).toEqual(oldSummary)
    // 然后是新的 summary
    expect(out![1]!.content).toContain('[CONTEXT_SUMMARY]')
  })
})

// ─── shouldCompact + applyCompaction + compactHistory ─────────

describe('shouldCompact', () => {
  it('用量低于触发线返回 off', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'short' }]
    const r = shouldCompact(msgs, 128_000, DEFAULT_COMPACTION_SETTINGS)
    expect(r.level).toBe('off')
    expect(r.reason).toBe('below_threshold')
  })

  it('用量超过触发线选 light(light 够)', () => {
    // 多条 tool,单条压完总量就够
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      trimThresholdChars: 1000,
      trimKeepPerSideChars: 100
    }
    // 4 条 tool,每条 2000 chars,总 8000 chars
    const msgs: CompactionMessage[] = Array.from({ length: 4 }, (_, i) => ({
      role: 'tool' as const,
      content: 'x'.repeat(2000),
      toolCallId: `t${i}`
    }))
    // contextWindow 10000,trigger 6000
    // 压前 ~ 8000/3 = 2670 token,但估算会过估到 3300+,还是 > 6000? 不,3300 < 6000
    // 让 trigger 更高确保触发
    const r = shouldCompact(msgs, 5000, settings) // trigger 3000
    expect(r.level).toBe('light')
  })

  it('light 不够升级 standard', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      trimThresholdChars: 100_000, // light 不动
      slidingWindowKeep: 2
    }
    const msgs: CompactionMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: 'x'.repeat(200)
    }))
    // trigger = 1000 * 0.6 = 600
    // 压前 50 * 84 = 4200,压后 standard K=2 留 ~250 < 600 → 选 standard
    const r = shouldCompact(msgs, 1000, settings)
    expect(r.level).toBe('standard')
  })

  it('standard 也不够上 aggressive', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      trimThresholdChars: 100_000, // light 不压
      slidingWindowKeep: 100, // standard 不压
      summaryTriggerChars: 200
    }
    const msgs: CompactionMessage[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: 'y'.repeat(100)
    }))
    const r = shouldCompact(msgs, 100, settings) // contextWindow 极小
    expect(r.level).toBe('aggressive')
  })
})

describe('applyCompaction', () => {
  it('off 档直接 skip', () => {
    const msgs: CompactionMessage[] = [{ role: 'user', content: 'hi' }]
    const plan = applyCompaction(msgs, 'off', DEFAULT_COMPACTION_SETTINGS)
    expect(plan.skipped).toBe('disabled')
    expect(plan.history).toEqual(msgs)
  })

  it('aggressive 失败 → fail-closed skip', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      summaryTriggerChars: 100
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'a'.repeat(60) },
      { role: 'assistant', content: 'b'.repeat(60) }
    ]
    const plan = applyCompaction(msgs, 'aggressive', settings, () => null)
    expect(plan.skipped).toBe('summary_failed')
    expect(plan.history).toEqual(msgs)
  })

  it('light 档实际生效', () => {
    const long = 'x'.repeat(DEFAULT_COMPACTION_SETTINGS.trimThresholdChars + 100)
    const msgs: CompactionMessage[] = [{ role: 'tool', content: long, toolCallId: 't1' }]
    const plan = applyCompaction(msgs, 'light', DEFAULT_COMPACTION_SETTINGS)
    expect(plan.skipped).toBeUndefined()
    expect(plan.tokensAfter).toBeLessThan(plan.tokensBefore)
    expect(plan.history[0]!.content).toContain('…[已省略')
  })
})

describe('compactHistory (one-shot)', () => {
  it('低于阈值直接 skip', () => {
    const plan = compactHistory([{ role: 'user', content: 'hi' }], { contextWindow: 128_000 })
    expect(plan.skipped).toBe('below_threshold')
  })

  it('无 contextWindow 用 fallback', () => {
    const plan = compactHistory([{ role: 'user', content: 'hi' }], { contextWindow: 0 })
    // fallback 128K,hi 不会触发
    expect(plan.skipped).toBe('below_threshold')
  })

  it('压缩生效并返回 plan(多条 tool 触发 light)', () => {
    const settings: CompactionSettings = {
      ...DEFAULT_COMPACTION_SETTINGS,
      trimThresholdChars: 500,
      trimKeepPerSideChars: 50
    }
    const msgs: CompactionMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'tool', content: 'x'.repeat(2000), toolCallId: 't1' },
      { role: 'tool', content: 'y'.repeat(2000), toolCallId: 't2' },
      { role: 'tool', content: 'z'.repeat(2000), toolCallId: 't3' }
    ]
    // contextWindow 2500,trigger 1500
    // 压前 2417,触发;压后 ~137 < 1500,选 light
    const plan = compactHistory(msgs, { contextWindow: 2500 }, { settings })
    expect(plan.skipped).toBeUndefined()
    expect(plan.tokensAfter).toBeLessThan(plan.tokensBefore)
    expect(plan.level).toBe('light')
  })
})
