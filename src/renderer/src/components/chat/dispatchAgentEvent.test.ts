import { describe, expect, it, vi } from 'vitest'
import { dispatchAgentEvent } from './dispatchAgentEvent'
import type { AgentEventHandlers } from './useAgentEvents'

describe('dispatchAgentEvent', () => {
  it('分发 assistant 事件', () => {
    const h: AgentEventHandlers = { onAssistant: vi.fn() }
    dispatchAgentEvent({ type: 'assistant', content: 'hi' }, 's1', h)
    expect(h.onAssistant).toHaveBeenCalledWith('hi')
  })

  it('分发 assistant_delta', () => {
    const h: AgentEventHandlers = { onDelta: vi.fn() }
    dispatchAgentEvent({ type: 'assistant_delta', content: 'd' }, 's1', h)
    expect(h.onDelta).toHaveBeenCalledWith('d')
  })

  it('分发 assistant_done', () => {
    const h: AgentEventHandlers = { onAssistantDone: vi.fn() }
    dispatchAgentEvent({ type: 'assistant_done' }, 's1', h)
    expect(h.onAssistantDone).toHaveBeenCalled()
  })

  it('tool 事件含 input/detail', () => {
    const h: AgentEventHandlers = { onToolCall: vi.fn() }
    dispatchAgentEvent(
      { type: 'tool', name: 'shell', detail: { x: 1 }, input: { cmd: 'ls' } },
      's1',
      h
    )
    expect(h.onToolCall).toHaveBeenCalledWith('shell', { x: 1 }, { cmd: 'ls' })
  })

  it('sessionId 不匹配时拦截', () => {
    const h: AgentEventHandlers = { onAssistant: vi.fn() }
    dispatchAgentEvent({ type: 'assistant', content: 'no', sessionId: 's2' }, 's1', h)
    expect(h.onAssistant).not.toHaveBeenCalled()
  })

  it('sessionId 匹配放行', () => {
    const h: AgentEventHandlers = { onAssistant: vi.fn() }
    dispatchAgentEvent({ type: 'assistant', content: 'yes', sessionId: 's1' }, 's1', h)
    expect(h.onAssistant).toHaveBeenCalledWith('yes')
  })

  it('event 无 sessionId 放行（向后兼容）', () => {
    const h: AgentEventHandlers = { onAssistant: vi.fn() }
    dispatchAgentEvent({ type: 'assistant', content: 'legacy' }, 's1', h)
    expect(h.onAssistant).toHaveBeenCalledWith('legacy')
  })

  it('status / error / done 分发', () => {
    const onStatus = vi.fn()
    const onError = vi.fn()
    const onDone = vi.fn()
    dispatchAgentEvent({ type: 'status', message: 's' }, 's1', { onStatus })
    dispatchAgentEvent({ type: 'error', message: 'e' }, 's1', { onError })
    dispatchAgentEvent({ type: 'done', reason: 'paused' }, 's1', { onDone })
    expect(onStatus).toHaveBeenCalledWith('s')
    expect(onError).toHaveBeenCalledWith('e')
    expect(onDone).toHaveBeenCalledWith('paused')
  })

  it('blocked 分发 rounds / reason', () => {
    const h: AgentEventHandlers = { onBlocked: vi.fn() }
    dispatchAgentEvent({ type: 'blocked', rounds: 3, reason: 'net' }, 's1', h)
    expect(h.onBlocked).toHaveBeenCalledWith(3, 'net')
  })

  it('goal_complete 完整分发', () => {
    const h: AgentEventHandlers = { onGoalComplete: vi.fn() }
    dispatchAgentEvent(
      {
        type: 'goal_complete',
        goal: 'g',
        checklist: [],
        tokenUsed: 100,
        rounds: 5,
        durationMs: 30_000
      },
      's1',
      h
    )
    expect(h.onGoalComplete).toHaveBeenCalledWith({
      goal: 'g',
      tokenUsed: 100,
      rounds: 5,
      durationMs: 30_000
    })
  })

  it('task add / update / remove 分发', () => {
    const onTaskAdd = vi.fn()
    const onTaskUpdate = vi.fn()
    const onTaskRemove = vi.fn()
    dispatchAgentEvent(
      { type: 'task', kind: 'add', id: '1', title: 't', source: 'goal' },
      's1',
      { onTaskAdd }
    )
    dispatchAgentEvent(
      { type: 'task', kind: 'update', id: '1', done: true, source: 'goal' },
      's1',
      { onTaskUpdate }
    )
    dispatchAgentEvent({ type: 'task', kind: 'remove', id: '1' }, 's1', { onTaskRemove })
    expect(onTaskAdd).toHaveBeenCalledWith('1', 't', undefined, undefined, 'goal')
    expect(onTaskUpdate).toHaveBeenCalledWith('1', { done: true, source: 'goal' })
    expect(onTaskRemove).toHaveBeenCalledWith('1')
  })

  it('未注册的 handler 不抛错', () => {
    expect(() => dispatchAgentEvent({ type: 'status', message: 'x' }, 's1', {})).not.toThrow()
  })

  it('未知事件类型静默忽略', () => {
    const h: AgentEventHandlers = { onAssistant: vi.fn() }
    dispatchAgentEvent({ type: 'unknown' as never }, 's1', h)
    expect(h.onAssistant).not.toHaveBeenCalled()
  })
})
