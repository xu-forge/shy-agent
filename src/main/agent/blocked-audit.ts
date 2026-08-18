/**
 * Blocked audit — 区分于自动机器信号的 stagnantRounds。
 *
 * 语义：LLM 在 verify 阶段显式判定"是否同一阻塞条件重复"。
 * - sameCondition = true → blockedRounds + 1
 * - sameCondition = false / 缺省 → blockedRounds = 0
 * - blockedRounds >= blockedAuditRounds → 触发 blocked 事件
 *
 * 与 stagnantRounds（机器自动：无 done + 无工具活动）并存，可独立触发暂停。
 */

/** verify LLM 输出的 blocked 段 */
export type VerifyBlockedOutput = {
  sameCondition?: boolean
  reason?: string
}

/** 取自 LLM verify JSON 的 blocked 字段（容忍任何形态） */
export function extractVerifyBlocked(value: unknown): VerifyBlockedOutput | null {
  if (!value || typeof value !== 'object') return null
  const obj = value as Record<string, unknown>
  if (!('sameCondition' in obj) && !('reason' in obj)) return null
  return {
    sameCondition:
      typeof obj.sameCondition === 'boolean' ? obj.sameCondition : undefined,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined
  }
}

/**
 * 计算下一轮 blockedRounds。
 *
 * @param prev 上一轮 blockedRounds
 * @param blocked 当前 verify LLM 输出的 blocked 段（null 表示 LLM 未给）
 * @returns 新的 blockedRounds
 */
export function nextBlockedRounds(prev: number, blocked: VerifyBlockedOutput | null): number {
  if (!blocked || blocked.sameCondition !== true) return 0
  return prev + 1
}

/** blockedRounds 达阈值（应触发 paused / blocked 事件） */
export function isBlocked(blockedRounds: number, blockedAuditRounds: number): boolean {
  if (blockedAuditRounds <= 0) return false
  return blockedRounds >= blockedAuditRounds
}

/** clamp blockedAuditRounds 到合法范围 [1, 10] */
export function clampBlockedAuditRounds(value: unknown, fallback = 3): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const n = Math.floor(value)
  if (n < 1) return 1
  if (n > 10) return 10
  return n
}
