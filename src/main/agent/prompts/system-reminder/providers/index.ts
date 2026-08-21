/**
 * Provider 注册中心 — createDefaultRegistry()。
 *
 * 4 类 provider（每类 critical 标记 + cooldown 配置）：
 * - identityReminderProvider       critical  no cooldown
 * - platformReminderProvider       critical  no cooldown
 * - progressReminderProvider       optional  no cooldown (per-goal gate)
 * - memoryReminderProvider         optional  6h cooldown
 *
 * 共 2 critical + 2 optional = 4 provider,follows minimax mavis-09 §3.2 设计。
 */
import { SystemReminderRegistry } from '../registry'
import { identityReminderProvider } from './identity'
import { platformReminderProvider } from './platform'
import { progressReminderProvider } from './progress'
import { memoryReminderProvider } from './memory'

export function createDefaultRegistry(): SystemReminderRegistry {
  const r = new SystemReminderRegistry()
  // critical 核心（即使 SR 关闭也注入）
  r.appendCritical('identityReminderProvider', identityReminderProvider)
  r.appendCritical('platformReminderProvider', platformReminderProvider)
  // 普通（受 allowlist + criticalOnly 控制）
  r.append('progressReminderProvider', progressReminderProvider)
  r.append('memoryReminderProvider', memoryReminderProvider)
  return r
}

export { identityReminderProvider, platformReminderProvider, progressReminderProvider, memoryReminderProvider }
