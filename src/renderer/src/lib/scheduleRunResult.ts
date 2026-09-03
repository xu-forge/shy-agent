import type { ChatMessage, ScheduleRun } from '../../../shared/ipc'

export type ScheduleResultView = {
  /** 正文区小标题 */
  heading: string
  body: string
  /** Agent 执行结果用 markdown；状态类用纯文本 */
  renderAs: 'markdown' | 'plain'
  /** 可选补充说明 */
  hint?: string
}

type SessionSlice = {
  resultContent?: string
  messages?: Array<Pick<ChatMessage, 'role' | 'content' | 'kind'>>
}

/** 从会话提取助手结果：绝不回落用户消息（避免把提示词当结果） */
export function extractAssistantResult(session: SessionSlice | null | undefined): string | null {
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

/** 技能执行结果：优先更长的有效正文 */
function pickSkillResultBody(stored: string | null | undefined, fromSession: string | null): string | null {
  const a = stored?.trim() || null
  const b = fromSession?.trim() || null
  if (a && b) return b.length > a.length ? b : a
  return a || b
}

/**
 * 结果弹层正文：优先 run.resultSummary，再会话助手 Markdown 输出。
 */
export function resolveScheduleResultView(input: {
  run: Pick<ScheduleRun, 'status' | 'action' | 'errorMessage' | 'resultSummary' | 'sessionId'>
  session?: SessionSlice | null
}): ScheduleResultView {
  const { run, session } = input

  if (run.status === 'running') {
    return { heading: '执行结果', body: '正在执行…', renderAs: 'plain' }
  }
  if (run.status === 'waiting_confirm') {
    return { heading: '执行结果', body: '等待高危操作确认…', renderAs: 'plain' }
  }
  if (run.status === 'failed') {
    return {
      heading: '执行结果',
      body: run.errorMessage?.trim() || '执行失败',
      renderAs: 'plain'
    }
  }

  // succeeded — 统一展示 Agent 执行结果
  const fromSession = extractAssistantResult(session)
  const body = pickSkillResultBody(run.resultSummary, fromSession)
  if (body) return { heading: '执行结果', body, renderAs: 'markdown' }

  if (run.sessionId) {
    return {
      heading: '执行结果',
      body: '暂无模型回复正文。可点「继续对话」查看完整会话。',
      renderAs: 'plain'
    }
  }
  return { heading: '执行结果', body: '暂无结果正文', renderAs: 'plain' }
}
