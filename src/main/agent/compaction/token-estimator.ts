/**
 * Token 估算器 — 简化版
 *
 * 完整 BPE 太重(对齐 minimax mavis-08 §3 用 gpt-tokenizer 200K base)。
 * shy 简化方案:chars/3 + CJK detection,误差 ±30%,故意过估,宁早触发。
 *
 * CJK 字符(Basic + Ext A)平均 1.5 BPE token,chars/3 会高估 1/2。
 * ASCII 字符 1 字符 ≈ 0.25-0.33 BPE token,chars/3 略高估。
 * 整体偏安全侧(早触发)。
 *
 * 不做远程 count_tokens（依赖 LLM API,网络成本高）。
 */

import type { CompactionMessage } from './types'

/** CJK 范围:基本汉字 + 扩展 A 区 */
const CJK_RE = /[\u3400-\u9fff]/g
/** CJK + 全角标点 + 日韩(粗略) */
const FULLWIDTH_RE = /[\uff00-\uffef]/g

/**
 * 估算纯文本 token 数。
 * - 全部 CJK: chars * 0.5
 * - 全部 ASCII: chars / 4
 * - 混合: 加权
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  if (text.length === 0) return 0
  // 简单统计 CJK 比例
  const cjkMatches = text.match(CJK_RE)
  const fullwidthMatches = text.match(FULLWIDTH_RE)
  const cjkCount = (cjkMatches?.length ?? 0) + (fullwidthMatches?.length ?? 0)
  const cjkRatio = Math.min(1, cjkCount / text.length)

  // CJK 字符平均 1.5 token,保守估 1
  // ASCII 字符平均 0.25 token,保守估 0.33
  // 整体公式: chars * (cjkRatio * 0.5 + (1 - cjkRatio) / 3)
  // 故意 +20% 兜底
  const factor = cjkRatio * 0.5 + (1 - cjkRatio) / 3
  return Math.ceil(text.length * factor * 1.2) + 4 // +4 per-message overhead
}

/** 估算单条消息 token(对齐 minimax token-estimator.ts:88 MESSAGE_STRUCTURAL_OVERHEAD = 4) */
export function estimateMessageTokens(message: CompactionMessage): number {
  const base = estimateTextTokens(message.content ?? '')
  // tool_call 多 +8 token(参数序列化)
  const toolCallsCost = message.toolCalls ? message.toolCalls.length * 8 : 0
  return base + toolCallsCost
}

/** 估算整段转录 token */
export function estimateHistoryTokens(messages: ReadonlyArray<CompactionMessage>): number {
  let total = 0
  for (const m of messages) {
    total += m.tokens ?? estimateMessageTokens(m)
  }
  return total
}
