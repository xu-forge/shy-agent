/**
 * tool-stats — 工具调用统计与可观测性。
 *
 * 每个工具 func 被调用时，记录调用次数 / 输入 token / 输出 token / 平均耗时。
 * 后续可暴露给 UI（设置页 / debug 页）。
 */
export type ToolStat = {
  name: string
  calls: number
  totalInputTokens: number
  totalOutputTokens: number
  avgDurationMs: number
}

const stats = new Map<string, ToolStat>()

/** 记录一次工具调用 */
export function trackToolCall(
  name: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number
): void {
  const existing = stats.get(name) ?? {
    name,
    calls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    avgDurationMs: 0
  }
  existing.calls += 1
  existing.totalInputTokens += Math.max(0, inputTokens)
  existing.totalOutputTokens += Math.max(0, outputTokens)
  // 加权平均
  existing.avgDurationMs =
    (existing.avgDurationMs * (existing.calls - 1) + Math.max(0, durationMs)) / existing.calls
  stats.set(name, existing)
}

/** 获取所有工具统计（按 call 数倒序） */
export function getToolStats(): ToolStat[] {
  return [...stats.values()].sort((a, b) => b.calls - a.calls)
}

/** 重置所有统计（用于新会话 / debug） */
export function resetToolStats(): void {
  stats.clear()
}

/** 获取单个工具统计 */
export function getToolStat(name: string): ToolStat | undefined {
  return stats.get(name)
}
