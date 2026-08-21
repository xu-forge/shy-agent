/**
 * System Reminder Service — collect + buildReminder 主入口。
 *
 * 调用流程：
 *   1. caller 构造 ReminderInput
 *   2. service.collect(input) → 把数据汇总（可选；也可以直接传 input 给 buildReminder）
 *   3. service.buildReminder(input) → 调用 registry.resolve() 拿最终 providers
 *   4. 每个 provider(input) → string | undefined
 *   5. 拼接成 `<system-reminder>...</system-reminder>` 字符串
 *
 * Cooldown 处理：provider 自己内部用 `coldStartLastInjectedAt` Map 判断；
 * service 层只负责 orchestrate，不记 cooldown 状态。这样 provider 单元可测。
 */
import { SystemReminderRegistry } from './registry'
import type { ReminderInput } from './types'

export class SystemReminderService {
  constructor(private registry: SystemReminderRegistry) {}

  /**
   * 收集并构建 reminder 字符串。
   * - 任何 provider throw 不影响其他 provider
   * - 全部失败 / 全空 → 返回 null（caller 不注入 system-reminder block）
   */
  buildReminder(input: ReminderInput): string | null {
    const entries = this.registry.resolve(input.allowlist, input.criticalOnly)
    const blocks: string[] = []
    for (const entry of entries) {
      try {
        const result = entry.fn(input)
        const trimmed = result?.trim()
        if (trimmed) blocks.push(trimmed)
      } catch (err) {
        // fail-open：单个 provider 挂掉不影响其他
        console.error(`[shy:system-reminder] provider ${entry.name} threw:`, err)
      }
    }
    if (blocks.length === 0) return null
    return `<system-reminder>\n${blocks.join('\n\n')}\n</system-reminder>`
  }
}

/** 默认的全局 registry 单例 */
let _default: SystemReminderRegistry | null = null
export function getDefaultRegistry(): SystemReminderRegistry {
  if (!_default) {
    // 延迟加载：避免循环 import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDefaultRegistry } = require('./providers') as typeof import('./providers')
    _default = createDefaultRegistry()
  }
  return _default
}

export function setDefaultRegistry(r: SystemReminderRegistry): void {
  _default = r
}
