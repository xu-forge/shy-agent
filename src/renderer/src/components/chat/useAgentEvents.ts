/**
 * useAgentEvents — 封装 main → renderer 事件订阅。
 *
 * 设计要点：
 * - 接收 typed handlers（onAssistant / onDelta / onToolCall / onStatus / ...）
 * - 内部用 switch 分发，sessionId 过滤
 * - ChatWorkspace 调用本 hook，不再持有巨型 if-else
 */
import { useEffect } from 'react'
import type { AgentEvent } from '../../../../shared/ipc'
import { dispatchAgentEvent } from './dispatchAgentEvent'

export type AgentEventHandlers = {
  onAssistant?: (content: string) => void
  onDelta?: (delta: string) => void
  onAssistantDone?: () => void
  onToolCall?: (name: string, detail?: unknown, input?: unknown) => void
  onStatus?: (message: string) => void
  onError?: (message: string) => void
  onResult?: (content: string, reportPath?: string) => void
  onDone?: (reason: string) => void
  onNotify?: (message: string) => void
  onBlocked?: (rounds: number, reason?: string) => void
  onGoalComplete?: (info: { goal: string; tokenUsed: number; rounds: number; durationMs: number }) => void
  onSession?: (title?: string) => void
  onTaskAdd?: (id: string, title: string, done?: boolean, evidence?: string, source?: 'goal' | 'agent') => void
  onTaskUpdate?: (id: string, fields: { title?: string; done?: boolean; evidence?: string; source?: 'goal' | 'agent' }) => void
  onTaskRemove?: (id: string) => void
}

export function useAgentEvents(
  sessionId: string,
  handlers: AgentEventHandlers,
  deps: ReadonlyArray<unknown> = []
): void {
  useEffect(() => {
    return window.shy.onEvent((payload: unknown) => {
      dispatchAgentEvent(payload as AgentEvent, sessionId, handlers)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ...deps])
}
