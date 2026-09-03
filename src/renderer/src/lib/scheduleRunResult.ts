import type { ChatMessage, ScheduleRun, ScheduleTask } from '../../../shared/ipc'

export type ScheduleResultView = {
  /** 正文区小标题 */
  heading: string
  body: string
  /** 技能成功结果用 markdown；提醒/状态用纯文本 */
  renderAs: 'markdown' | 'plain'
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

/**
 * 结果弹层正文：提醒 ≠ 技能执行结果；技能优先 run.resultSummary，再会话助手 Markdown 输出。
 */
export function resolveScheduleResultView(input: {
  run: Pick<ScheduleRun, 'status' | 'action' | 'errorMessage' | 'resultSummary' | 'sessionId'>
  task?: Pick<ScheduleTask, 'action' | 'payload'> | undefined
  occurrenceTitle?: string
  session?: SessionSlice | null
}): ScheduleResultView {
  const { run, task, occurrenceTitle, session } = input

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

  // succeeded
  if (run.action === 'remind') {
    const msg =
      task?.action === 'remind' && 'message' in task.payload
        ? String(task.payload.message).trim()
        : (occurrenceTitle ?? '')
    return { heading: '提醒内容', body: msg || '提醒已发出', renderAs: 'plain' }
  }

  const stored = run.resultSummary?.trim()
  if (stored) return { heading: '执行结果', body: stored, renderAs: 'markdown' }

  const fromSession = extractAssistantResult(session)
  if (fromSession) return { heading: '执行结果', body: fromSession, renderAs: 'markdown' }

  if (run.sessionId) {
    return {
      heading: '执行结果',
      body: '暂无模型回复正文。可点「继续对话」查看完整会话。',
      renderAs: 'plain'
    }
  }
  return { heading: '执行结果', body: '暂无结果正文', renderAs: 'plain' }
}
