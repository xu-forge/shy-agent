/**
 * Context Compaction 4 档配置 + 计划
 *
 * 设计参考 minimax mavis-08 `context-manager` 4 档概念分层。
 * 4 档强度（从轻到重）：
 *   - off:不压缩（早期 session / 测试用）
 *   - light:TRIM_OLD_TOOL_OUTPUTS（剪最早 N 个超长 tool output）
 *   - standard:SLIDING_WINDOW（保留最近 K 消息,丢最早的）
 *   - aggressive:SUMMARY_REPLACE（最早 N 消息 → 1 条 summary,触发 LLM 总结）
 *
 * 实际只实现 light / standard / aggressive 3 档。aggressive 默认走 fail-closed skip（需要 LLM 调摘要,失败就跳过,绝不坏 session）。
 * 4 档(ARCHIVE_SUMMARY)概念上存在,实现时落到"aggressive 失败 + 仍超阈值"分支,直接返回 skip。
 */

export type CompactionLevel = 'off' | 'light' | 'standard' | 'aggressive'

/** 4 档 vs minimax 4 档概念映射（注释用,代码里只认 level） */
// off         = 档 0
// light       = 档 1 TRIM_OLD_TOOL_OUTPUTS
// standard    = 档 2 SLIDING_WINDOW
// aggressive  = 档 3 SUMMARY_REPLACE
// (档 4 ARCHIVE_SUMMARY = aggressive 失败的兜底,代码不显式存在)

export type CompactionSettings = {
  /** 触发线（占 contextWindow 的比例,默认 0.6,align minimax 默认 0.7-0.9） */
  triggerRatio: number
  /** light 档:单个 tool output 超过多少字符开始截断（head+tail 各保留多少） */
  trimThresholdChars: number
  /** light 档:head+tail 各保留多少字符 */
  trimKeepPerSideChars: number
  /** standard 档:保留最近多少条消息 */
  slidingWindowKeep: number
  /** aggressive 档:从最早开始,累积多少 chars 触发总结 */
  summaryTriggerChars: number
  /** aggressive 档:summary 最多多少 chars（防止 summary 自身爆） */
  summaryMaxChars: number
  /** aggressive 档:最少压多少条消息,低于此值不值得压 */
  minCompactedMessages: number
  /** Fallback contextWindow（拿不到模型 contextWindow 时用） */
  contextWindowFallback: number
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
  triggerRatio: 0.6,
  trimThresholdChars: 8000,
  trimKeepPerSideChars: 1000,
  slidingWindowKeep: 20,
  summaryTriggerChars: 60_000,
  summaryMaxChars: 4000,
  minCompactedMessages: 2,
  contextWindowFallback: 128_000
}

/** 输入消息（不依赖 LangChain 类型） */
export type CompactionMessage = {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ReadonlyArray<{ id: string; name: string; args: string }>
  toolCallId?: string
  /** 标记消息原始 tokens（可选,用于 keepRecentTokens 计算） */
  tokens?: number
}

/** 计划 + 结果 */
export type CompactionPlan = {
  level: CompactionLevel
  reason: string
  /** 压缩前估算 tokens */
  tokensBefore: number
  /** 压缩后估算 tokens */
  tokensAfter: number
  /** 实际应用:替换后的消息列表 */
  history: CompactionMessage[]
  /** summary 文本（aggressive 档才有） */
  summaryText?: string
  /** 跳过的原因（apply 时记录） */
  skipped?: 'disabled' | 'below_threshold' | 'no_safe_cut' | 'summary_failed' | 'no_messages'
}

/** 模型信息（触发线计算需要） */
export type CompactionModelInfo = {
  contextWindow: number
  /** 当前轮 maxTokens 预算,用于触发线预留 */
  maxTokens?: number
}
