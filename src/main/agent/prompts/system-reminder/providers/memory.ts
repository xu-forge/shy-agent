/**
 * Memory provider — 长期记忆摘录 + 短期压缩态上下文。
 *
 * 设计参考 minimax mavis-09 §3.3：
 * - 长期记忆：每轮必注入（受 cooldown 控制，避免冗长重复）
 * - 短期压缩：仅在非空时注入
 * - Cooldown：6h（同 minimax 长期 reminder 频率）
 *
 * 简化策略：本版直接把 input.memoryBlock / input.shortMemory 包进 block。
 * 实际生产中可加 truncate / 摘要 / 引用。
 */
import type { ReminderProviderFn } from '../types'

const LONG_TERM_COOLDOWN_MS = 6 * 60 * 60 * 1000 // 6h

const lastInjectedAt = new Map<string, number>()

export const memoryReminderProvider: ReminderProviderFn = (input) => {
  const key = `${input.env.sessionId}::memory_longterm`
  const now = Date.now()
  const last = lastInjectedAt.get(key)
  if (last !== undefined && now - last < LONG_TERM_COOLDOWN_MS) {
    // 冷却中：仅短期压缩注入
    if (!input.shortMemory.trim()) return undefined
    return `<memory-context>
  short_memory: ${input.shortMemory.slice(0, 2000)}
  long_memory: (略 — ${Math.round((now - last) / 60_000)} 分钟前已注入)
</memory-context>`
  }
  lastInjectedAt.set(key, now)
  const lines = ['<memory-context>']
  if (input.memoryBlock.trim()) {
    lines.push(`  long_memory: ${input.memoryBlock.slice(0, 4000)}`)
  }
  if (input.shortMemory.trim()) {
    lines.push(`  short_memory: ${input.shortMemory.slice(0, 2000)}`)
  }
  if (lines.length === 1) return undefined
  lines.push('</memory-context>')
  return lines.join('\n')
}

/** 测试用：清空 cooldown 状态 */
export function _resetMemoryCooldownForTests(): void {
  lastInjectedAt.clear()
}
