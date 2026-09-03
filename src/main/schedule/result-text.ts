import type { SessionDetail } from '../../shared/ipc'

/** main 侧从会话提取助手结果，供 schedule run 落库 */
export function extractSessionResultSummary(session: SessionDetail | null): string | null {
  if (!session) return null
  const fromField = session.resultContent?.trim()
  if (fromField) return fromField
  const messages = session.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.kind === 'result' && m.content.trim()) return m.content.trim()
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === 'assistant' && m.content.trim()) return m.content.trim()
  }
  return null
}
