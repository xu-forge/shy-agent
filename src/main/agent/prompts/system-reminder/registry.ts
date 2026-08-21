/**
 * System Reminder Registry — 链式 provider 收集器。
 *
 * 设计参考 minimax mavis-09 §3.2 `createDefaultRegistry`：
 * - append()：普通 provider（受 criticalOnly + allowlist 双重 gate）
 * - appendCritical()：核心 provider（即使 SR 关闭也跑，但 allowlist 仍生效）
 * - resolve()：按注册顺序返回最终列表（critical 在前，便于优先注入）
 */

import type { ReminderProviderEntry, ReminderProviderFn } from './types'

export class SystemReminderRegistry {
  private entries: ReminderProviderEntry[] = []

  /** 普通 provider */
  append(name: string, fn: ReminderProviderFn): this {
    this.entries.push({ name, fn, critical: false })
    return this
  }

  /** Critical provider — disable SR 时也跑（但仍受 allowlist 控制） */
  appendCritical(name: string, fn: ReminderProviderFn): this {
    this.entries.push({ name, fn, critical: true })
    return this
  }

  /**
   * 解析最终列表：critical 在前，普通在后；同类型按注册顺序。
   * allowlist 非空时过滤（取 entry.name 与 stripProviderSuffix(entry.name) 两种 key 都允许）
   */
  resolve(allowlist: Set<string> | null, criticalOnly: boolean): ReminderProviderEntry[] {
    let filtered = this.entries.slice()
    if (criticalOnly) {
      filtered = filtered.filter((e) => e.critical)
    }
    if (allowlist) {
      filtered = filtered.filter((e) => {
        // 允许两种 key：完整名 + 去 Provider 后缀
        const shortName = stripProviderSuffix(e.name)
        return allowlist.has(e.name) || allowlist.has(shortName)
      })
    }
    // critical 排前面
    return filtered.sort((a, b) => (a.critical === b.critical ? 0 : a.critical ? -1 : 1))
  }

  /** 列出所有已注册的 provider（用于诊断） */
  list(): ReminderProviderEntry[] {
    return [...this.entries]
  }
}

/** 'identityReminderProvider' → 'identityReminder' */
function stripProviderSuffix(name: string): string {
  return name.endsWith('Provider') ? name.slice(0, -'Provider'.length) : name
}
