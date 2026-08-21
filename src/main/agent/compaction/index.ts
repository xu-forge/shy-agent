/**
 * Compaction 主入口 — 提供 shouldCompact + applyCompaction + 自动档位选择
 *
 * 用法:
 *   import { compactHistory } from '../compaction'
 *   const plan = compactHistory(messages, { contextWindow: 128_000 })
 *   if (!plan.skipped) input.history = plan.history
 */

export * from './types'
export * from './strategy'
export * from './token-estimator'

import type { CompactionMessage, CompactionModelInfo, CompactionPlan, CompactionSettings } from './types'
import { DEFAULT_COMPACTION_SETTINGS } from './types'
import { applyCompaction, shouldCompact } from './strategy'

/** 一步式入口:评估 + 应用 */
export function compactHistory(
  messages: ReadonlyArray<CompactionMessage>,
  model: CompactionModelInfo,
  options?: {
    settings?: Partial<CompactionSettings>
    generateSummary?: (compacted: ReadonlyArray<CompactionMessage>) => string | null
  }
): CompactionPlan {
  const settings: CompactionSettings = {
    ...DEFAULT_COMPACTION_SETTINGS,
    ...(options?.settings ?? {})
  }
  const contextWindow =
    model.contextWindow > 0 ? model.contextWindow : settings.contextWindowFallback

  const decision = shouldCompact(messages, contextWindow, settings)
  if (decision.level === 'off') {
    return {
      level: 'off',
      reason: decision.reason,
      tokensBefore: decision.tokensBefore,
      tokensAfter: decision.tokensBefore,
      history: [...messages],
      skipped: decision.reason === 'below_threshold' ? 'below_threshold' : 'no_messages'
    }
  }
  return applyCompaction(messages, decision.level, settings, options?.generateSummary)
}
