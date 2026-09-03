import type { SessionSummary } from '../../../shared/ipc'

export const SIDEBAR_RECENT_DEFAULT_LIMIT = 10

/** 按 updatedAt 降序取最近会话；非法日期排后。 */
export function recentSessions(
  sessions: readonly SessionSummary[],
  limit: number = SIDEBAR_RECENT_DEFAULT_LIMIT
): SessionSummary[] {
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : SIDEBAR_RECENT_DEFAULT_LIMIT
  if (n === 0 || sessions.length === 0) return []
  return [...sessions]
    .sort((a, b) => {
      const ta = Date.parse(a.updatedAt)
      const tb = Date.parse(b.updatedAt)
      const sa = Number.isNaN(ta) ? 0 : ta
      const sb = Number.isNaN(tb) ? 0 : tb
      return sb - sa
    })
    .slice(0, n)
}

export function flattenGroupSessions(
  groups: readonly { sessions: readonly SessionSummary[] }[]
): SessionSummary[] {
  const out: SessionSummary[] = []
  const seen = new Set<string>()
  for (const g of groups) {
    for (const s of g.sessions) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      out.push(s)
    }
  }
  return out
}
