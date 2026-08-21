/**
 * Context Compaction 4 档策略实现
 *
 * 档 1 light(TRIM_OLD_TOOL_OUTPUTS):
 *   - 找到所有 tool 消息,挑出 content > threshold 的,head+tail 截断,中间用 `…[省略 N 字]…` 标记
 *   - 单条操作,无 token 节省上限
 *
 * 档 2 standard(SLIDING_WINDOW):
 *   - 保留最近 K 条消息(默认 20),丢更早的
 *   - 第一条必须是 user/assistant(不能是 toolResult)
 *   - 切点安全保证:绝不切碎 assistant(toolCall) + toolResult 对
 *
 * 档 3 aggressive(SUMMARY_REPLACE):
 *   - 找上一个 summary 标记(本实现不持久化 summary,简单做法:从 index 0 开始)
 *   - 从最早开始累积,直到累积 chars >= summaryTriggerChars(默认 60K)
 *   - 把累积段丢给 generateSummary(默认走 LLM,失败 skip)
 *   - 用 [SUMMARY: ...] 1 条消息替换累积段
 *
 * 档 4(ARCHIVE_SUMMARY)概念存在,实现时落到 aggressive 失败 + 仍超阈值时直接 skip。
 * 任何失败都走 fail-closed skip。
 *
 * 关键不变量:
 * 1. 切点必须在 user/assistant 边界
 * 2. toolResult 永远不能当 firstKeptIndex
 * 3. 压缩后必须保留至少最后 1 条消息
 */

import { randomUUID } from 'crypto'
import type {
  CompactionLevel,
  CompactionMessage,
  CompactionPlan,
  CompactionSettings
} from './types'
import { estimateHistoryTokens, estimateMessageTokens, estimateTextTokens } from './token-estimator'

/** SUMMARY 标记消息的 role（不参与 LLM 工具调用,仅作锚定） */
export const SUMMARY_SENTINEL_CONTENT_PREFIX = '[CONTEXT_SUMMARY]'

/** 把文本标记成 summary 消息（会作为 user 消息注入,前缀告诉 LLM 这是历史摘要） */
export function createSummaryMessage(text: string): CompactionMessage {
  return {
    role: 'user',
    content: `${SUMMARY_SENTINEL_CONTENT_PREFIX}\n${text}`
  }
}

/** 判断一条消息是否是上次 summary 标记 */
export function isSummarySentinel(m: CompactionMessage): boolean {
  return m.role === 'user' && m.content.startsWith(SUMMARY_SENTINEL_CONTENT_PREFIX)
}

/** 找上一条 summary 标记的下标(没找到返回 -1) */
export function findLastSummaryIndex(messages: ReadonlyArray<CompactionMessage>): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isSummarySentinel(messages[i]!)) return i
  }
  return -1
}

// ─── 档 1: light (TRIM_OLD_TOOL_OUTPUTS) ────────────────────────────

/**
 * 截断单条 tool 消息的 content。
 * head + tail 各保留 keepPerSide,中间加省略标记。
 */
export function trimToolOutput(
  content: string,
  threshold: number,
  keepPerSide: number
): string {
  if (content.length <= threshold) return content
  const head = content.slice(0, keepPerSide)
  const tail = content.slice(content.length - keepPerSide)
  const omitted = content.length - head.length - tail.length
  return `${head}\n\n…[已省略 ${omitted} 字符]…\n\n${tail}`
}

/**
 * 档 1: 截断所有超长 tool output。
 * 只对 tool 角色消息生效,user/assistant 不动。
 * 限制:每条 message 截断后至少保留 keepPerSide * 2 字符。
 */
export function applyLight(
  messages: ReadonlyArray<CompactionMessage>,
  settings: CompactionSettings
): CompactionMessage[] {
  const { trimThresholdChars: threshold, trimKeepPerSideChars: keep } = settings
  return messages.map((m) => {
    if (m.role !== 'tool') return m
    const trimmed = trimToolOutput(m.content, threshold, keep)
    if (trimmed === m.content) return m
    return { ...m, content: trimmed }
  })
}

// ─── 档 2: standard (SLIDING_WINDOW) ────────────────────────────

/** 判断一个角色是否是合法的 firstKeptIndex（user / assistant 即可,不能是 toolResult） */
function isValidFirstKeptRole(role: CompactionMessage['role']): boolean {
  return role === 'user' || role === 'assistant'
}

/**
 * 找到 messages[fromIndex..] 范围内,往前回溯到上一个 toolResult 配对的 assistant 起点。
 * 目的:保证 firstKeptIndex 切在 user/assistant,绝不切碎 tool pair。
 */
function safeCutForIndex(
  messages: ReadonlyArray<CompactionMessage>,
  index: number,
  boundaryStart: number
): number {
  if (index < 0 || index >= messages.length) return -1
  const m = messages[index]!
  // tool 消息不能当 firstKeptIndex,往前找
  if (!isValidFirstKeptRole(m.role)) {
    return safeCutForIndex(messages, index - 1, boundaryStart)
  }
  if (index < boundaryStart) return -1
  return index
}

/**
 * 档 2: 滑动窗口。从右往左保留 K 条,切点必须安全。
 * 如果原数组 <= K,直接返回(没必要压)。
 */
export function applyStandard(
  messages: ReadonlyArray<CompactionMessage>,
  settings: CompactionSettings
): CompactionMessage[] {
  const keep = settings.slidingWindowKeep
  if (messages.length <= keep) return [...messages]
  const firstKept = messages.length - keep
  const safeStart = safeCutForIndex(messages, firstKept, 0)
  if (safeStart < 0 || safeStart >= messages.length) return [...messages]
  return messages.slice(safeStart)
}

// ─── 档 3: aggressive (SUMMARY_REPLACE) ────────────────────────────

/**
 * 档 3 主逻辑:从 boundaryStart 开始累积 chars,直到 ≥ summaryTriggerChars,这段要被总结。
 * 同步生成一个粗略的本地 summary(把消息 role + content 前 N 字拼成清单),不调 LLM。
 * 真正的 LLM 总结由 caller 异步做（generateSummary 传进来,失败 skip）。
 */
export function selectAggressiveBoundary(
  messages: ReadonlyArray<CompactionMessage>,
  settings: CompactionSettings,
  boundaryStart: number
): { firstKeptIndex: number; compactedCount: number } | null {
  const target = settings.summaryTriggerChars
  let acc = 0
  for (let i = boundaryStart; i < messages.length; i += 1) {
    acc += estimateMessageTokens(messages[i]!) * 3 // tokens * 3 ≈ chars
    if (acc >= target) {
      // firstKeptIndex 必须落在 user/assistant
      const safe = safeCutForIndex(messages, i, boundaryStart)
      if (safe < 0 || safe <= boundaryStart) return null
      return { firstKeptIndex: safe, compactedCount: safe - boundaryStart }
    }
  }
  return null
}

/**
 * 离线生成 summary(本地模板版,不调 LLM)。
 * 适合"无 apiKey / 单元测试 / 离线场景"。
 * LLM 总结由 caller 通过 generateSummary 覆盖。
 */
export function generateLocalSummary(
  compacted: ReadonlyArray<CompactionMessage>,
  maxChars: number
): string {
  const lines: string[] = []
  for (const m of compacted) {
    const head = m.content.slice(0, 200).replace(/\n/g, ' ')
    lines.push(`[${m.role}] ${head}${m.content.length > 200 ? '…' : ''}`)
    if (lines.join('\n').length > maxChars) break
  }
  const text = lines.join('\n')
  if (text.length > maxChars) {
    return text.slice(0, maxChars) + `\n…(已截断,共 ${compacted.length} 条)`
  }
  return `共 ${compacted.length} 条早期消息:\n${text}`
}

/**
 * 档 3: 总结替换。
 * - 找 boundaryStart(上一个 summary 标记之后)
 * - 累积到 trigger 阈值,选 firstKeptIndex
 * - 生成 summary(默认 local,可被 caller 覆盖)
 * - 用 1 条 summary 消息替换累积段
 *
 * 失败返回 null（caller 走 skip）。
 */
export function applyAggressive(
  messages: ReadonlyArray<CompactionMessage>,
  settings: CompactionSettings,
  generateSummary?: (compacted: ReadonlyArray<CompactionMessage>) => string | null
): CompactionMessage[] | null {
  if (messages.length === 0) return null
  const lastSummaryIdx = findLastSummaryIndex(messages)
  const boundaryStart = lastSummaryIdx >= 0 ? lastSummaryIdx + 1 : 0

  const plan = selectAggressiveBoundary(messages, settings, boundaryStart)
  if (!plan) return null

  // 至少压 minCompactedMessages 条,1 条不值得
  if (plan.compactedCount < settings.minCompactedMessages) return null

  const compacted = messages.slice(boundaryStart, plan.firstKeptIndex)
  if (compacted.length === 0) return null

  const kept = messages.slice(plan.firstKeptIndex)
  if (kept.length === 0) return null

  let summary: string | null = null
  if (generateSummary) {
    try {
      summary = generateSummary(compacted)
    } catch {
      return null
    }
  } else {
    summary = generateLocalSummary(compacted, settings.summaryMaxChars)
  }
  if (!summary) return null

  const summaryMsg = createSummaryMessage(summary)
  // 保留 boundaryStart 之前的消息(包括 old summary),不要覆盖
  const before = messages.slice(0, boundaryStart)
  return [...before, summaryMsg, ...kept]
}

// ─── 主入口:shouldCompact + applyCompaction ────────────────────────────

/**
 * 判断是否需要压缩,选档。
 * 触发条件:估算 tokens > contextWindow * triggerRatio。
 * 选档策略:从轻到重尝试,直到找到能压下来的档。
 */
export function shouldCompact(
  messages: ReadonlyArray<CompactionMessage>,
  contextWindow: number,
  settings: CompactionSettings
): { level: CompactionLevel; reason: string; tokensBefore: number; triggerAt: number } {
  const tokensBefore = estimateHistoryTokens(messages)
  const triggerAt = Math.max(1, Math.floor(contextWindow * settings.triggerRatio))
  if (tokensBefore <= triggerAt) {
    return { level: 'off', reason: 'below_threshold', tokensBefore, triggerAt }
  }
  if (messages.length < 2) {
    return { level: 'off', reason: 'no_messages', tokensBefore, triggerAt }
  }
  // 选档:从轻到重
  // 先试 light,看压后够不够
  const lightResult = applyLight(messages, settings)
  const lightTokens = estimateHistoryTokens(lightResult)
  if (lightTokens <= triggerAt) {
    return { level: 'light', reason: 'light_sufficient', tokensBefore, triggerAt }
  }
  // light 不够,试 standard
  const standardResult = applyStandard(messages, settings)
  const standardTokens = estimateHistoryTokens(standardResult)
  if (standardTokens <= triggerAt) {
    return { level: 'standard', reason: 'standard_sufficient', tokensBefore, triggerAt }
  }
  // standard 也不够,只能上 aggressive
  return { level: 'aggressive', reason: 'aggressive_required', tokensBefore, triggerAt }
}

/**
 * 应用压缩计划。
 * 失败返回带 skipped 标记的 plan(调用方决定怎么处理)。
 */
export function applyCompaction(
  messages: ReadonlyArray<CompactionMessage>,
  level: CompactionLevel,
  settings: CompactionSettings,
  generateSummary?: (compacted: ReadonlyArray<CompactionMessage>) => string | null
): CompactionPlan {
  const tokensBefore = estimateHistoryTokens(messages)
  if (level === 'off' || messages.length === 0) {
    return {
      level,
      reason: level === 'off' ? 'disabled' : 'no_messages',
      tokensBefore,
      tokensAfter: tokensBefore,
      history: [...messages],
      skipped: level === 'off' ? 'disabled' : 'no_messages'
    }
  }

  let newHistory: CompactionMessage[]
  let summaryText: string | undefined
  if (level === 'light') {
    newHistory = applyLight(messages, settings)
  } else if (level === 'standard') {
    newHistory = applyStandard(messages, settings)
  } else {
    const agg = applyAggressive(messages, settings, generateSummary)
    if (agg === null) {
      // aggressive 失败(fail-closed skip)
      return {
        level,
        reason: 'summary_failed',
        tokensBefore,
        tokensAfter: tokensBefore,
        history: [...messages],
        skipped: 'summary_failed'
      }
    }
    newHistory = agg
    const summaryMsg = newHistory.find(isSummarySentinel)
    summaryText = summaryMsg?.content
  }

  const tokensAfter = estimateHistoryTokens(newHistory)
  return {
    level,
    reason: 'applied',
    tokensBefore,
    tokensAfter,
    history: newHistory,
    summaryText
  }
}

// 引用 randomUUID 防止 import 误报
void randomUUID
