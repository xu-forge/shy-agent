/**
 * dispatchAgentEvent — 纯函数，把 AgentEvent 分发到 handlers。
 * useAgentEvents 内部调用此函数，便于单测。
 */
import type { AgentEvent } from '../../../../shared/ipc'
import type { AgentEventHandlers } from './useAgentEvents'

export function dispatchAgentEvent(
  ev: AgentEvent,
  sessionId: string,
  handlers: AgentEventHandlers
): void {
  // sessionId 字段在所有事件类型上可选（共享 ipc schema 已声明）
  const sessionIdField = (ev as { sessionId?: string }).sessionId
  if (sessionIdField && sessionIdField !== sessionId) return
  switch (ev.type) {
    case 'assistant':
      handlers.onAssistant?.(ev.content)
      break
    case 'assistant_delta':
      handlers.onDelta?.(ev.content)
      break
    case 'assistant_done':
      handlers.onAssistantDone?.()
      break
    case 'tool':
      handlers.onToolCall?.(ev.name, ev.detail, (ev as { input?: unknown }).input)
      break
    case 'status':
      handlers.onStatus?.(ev.message)
      break
    case 'error':
      handlers.onError?.(ev.message)
      break
    case 'result':
      handlers.onResult?.(ev.content, ev.reportPath)
      break
    case 'done':
      handlers.onDone?.(ev.reason)
      break
    case 'notify':
      handlers.onNotify?.(ev.message)
      break
    case 'blocked':
      handlers.onBlocked?.(ev.rounds, ev.reason)
      break
    case 'goal_complete':
      handlers.onGoalComplete?.({
        goal: ev.goal,
        tokenUsed: ev.tokenUsed,
        rounds: ev.rounds,
        durationMs: ev.durationMs
      })
      break
    case 'session':
      handlers.onSession?.(ev.title)
      break
    case 'task':
      if (ev.kind === 'add') {
        handlers.onTaskAdd?.(ev.id, ev.title, ev.done, ev.evidence, ev.source)
      } else if (ev.kind === 'update') {
        handlers.onTaskUpdate?.(ev.id, {
          title: ev.title,
          done: ev.done,
          evidence: ev.evidence,
          source: ev.source
        })
      } else if (ev.kind === 'remove') {
        handlers.onTaskRemove?.(ev.id)
      }
      break
  }
}
