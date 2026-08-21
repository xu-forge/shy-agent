/**
 * StatusBar — minimax 风格底部状态条。
 *
 * 实时显示:
 * - 当前 run 状态(idle / thinking / tool-calling / paused)
 * - 当前工具名(如有)
 * - 累计 token + 轮数
 * - 取消按钮
 *
 * 状态枚举跟 minimax mavis-13 event-bridge 对齐:
 * - idle       → 无 run,显示「空闲」
 * - thinking   → LLM 推理中,显示「正在思考...」+ 动画
 * - tool-calling → 工具执行中,显示「正在调用 X」+ 工具名
 * - paused     → 暂停,显示「已暂停」+ 原因
 * - errored    → 错误,显示「出错:...」
 * - done       → 完成,显示「完成」
 */
import { useEffect, useState } from 'react'
import type { AgentEvent } from '../../../../shared/ipc'

type RunState = 'idle' | 'thinking' | 'tool-calling' | 'paused' | 'errored' | 'done'

type StatusInfo = {
  state: RunState
  message: string
  currentTool?: string
  tokenUsed: number
  rounds: number
}

const INITIAL: StatusInfo = {
  state: 'idle',
  message: '空闲',
  tokenUsed: 0,
  rounds: 0
}

type Props = {
  /** 当前 sessionId,变化时重置 */
  sessionId: string
  /** cancel handler(可选) */
  onCancel?: () => void
}

export function StatusBar({ sessionId, onCancel }: Props): React.JSX.Element {
  const [status, setStatus] = useState<StatusInfo>(INITIAL)

  useEffect(() => {
    setStatus(INITIAL)
  }, [sessionId])

  useEffect(() => {
    const off = window.shy.onEvent((payload) => {
      const ev = payload as AgentEvent & { sessionId?: string }
      if (ev.sessionId && ev.sessionId !== sessionId) return
      switch (ev.type) {
        case 'status':
          setStatus((s) => ({
            ...s,
            state: detectRunState(ev.message, s.state),
            message: ev.message
          }))
          break
        case 'tool':
          setStatus((s) => ({
            ...s,
            state: 'tool-calling',
            currentTool: ev.name,
            message: `正在调用 ${ev.name}...`
          }))
          break
        case 'assistant_done':
          setStatus((s) => ({
            ...s,
            state: 'thinking',
            message: '正在思考下一步...'
          }))
          break
        case 'done':
          setStatus((s) => ({
            ...s,
            state: ev.reason === 'cancelled' ? 'paused' : 'done',
            message: doneMessage(ev.reason)
          }))
          break
        case 'error':
          setStatus((s) => ({ ...s, state: 'errored', message: ev.message }))
          break
        case 'goal_complete':
          setStatus((s) => ({ ...s, state: 'done', message: '目标完成 ✓' }))
          break
        default:
          break
      }
    })
    return off
  }, [sessionId])

  return (
    <div className={`status-bar status-${status.state}`}>
      <div className="status-bar-indicator">
        <span className="status-bar-dot" aria-hidden="true" />
        <span className="status-bar-label">{status.message}</span>
        {status.currentTool ? (
          <span className="status-bar-tool">{status.currentTool}</span>
        ) : null}
      </div>
      <div className="status-bar-meta">
        <span title="累计 token">⚡ {formatNum(status.tokenUsed)}</span>
        <span title="轮数">↻ {status.rounds}</span>
        {onCancel && (status.state === 'thinking' || status.state === 'tool-calling') ? (
          <button type="button" className="status-bar-cancel" onClick={onCancel} aria-label="停止">
            ⏹ 停止
          </button>
        ) : null}
      </div>
    </div>
  )
}

function detectRunState(message: string, current: RunState): RunState {
  const m = message.toLowerCase()
  if (m.includes('思考') || m.includes('思考中')) return 'thinking'
  if (m.includes('调用') || m.includes('执行')) return 'tool-calling'
  if (m.includes('暂停')) return 'paused'
  if (m.includes('错误') || m.includes('失败')) return 'errored'
  if (m.includes('完成')) return 'done'
  return current
}

function doneMessage(reason: string): string {
  switch (reason) {
    case 'completed':
      return '完成 ✓'
    case 'cancelled':
      return '已取消'
    case 'paused':
      return '已暂停'
    case 'error':
      return '出错'
    case 'budget':
      return '预算耗尽'
    default:
      return '结束'
  }
}

function formatNum(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1000000).toFixed(2)}M`
}
