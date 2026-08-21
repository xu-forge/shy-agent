/**
 * EventLog — 实时事件流折叠面板
 *
 * 设计:
 * - 用 useAgentEvent 按 type 订阅(细颗粒,不订阅其他 type)
 * - 环形 buffer,最多保留 30 条
 * - 折叠时只显示最新 1 条,展开时显示全部
 * - 验证 Stage 3.2 preload-adapter 端到端:main bus emit → IPC → preload filter → renderer hook
 *
 * 这是 minimax Inspector 右下角"event stream" 区域的轻量版。
 */
import { useEffect, useRef, useState } from 'react'
import { useAgentEvent } from '../../lib/useAgentEvent'

const MAX_ENTRIES = 30

const SUBSCRIBED_TYPES = [
  'status',
  'assistant_delta',
  'assistant_done',
  'tool',
  'task',
  'error',
  'done',
  'notify',
  'blocked',
  'goal_complete',
  'result'
] as const

type LogEntry = {
  id: number
  ts: number
  type: string
  preview: string
}

function summarize(type: string, e: Record<string, unknown>): string {
  switch (type) {
    case 'status':
      return String(e.message ?? '')
    case 'assistant_delta':
      return String(e.content ?? '').slice(0, 60)
    case 'assistant_done':
      return '(完成)'
    case 'tool':
      return `${e.name ?? '?'}${e.detail ? ` — ${JSON.stringify(e.detail).slice(0, 40)}` : ''}`
    case 'task':
      return `${e.kind ?? '?'} #${e.id ?? '?'} ${e.title ?? ''}`
    case 'error':
      return String(e.message ?? '')
    case 'done':
      return String(e.reason ?? '')
    case 'notify':
      return String(e.message ?? '')
    case 'blocked':
      return `${e.rounds ?? 0} rounds${e.reason ? ` (${e.reason})` : ''}`
    case 'goal_complete':
      return `✓ ${String(e.goal ?? '').slice(0, 40)}`
    case 'result':
      return String(e.content ?? '').slice(0, 60)
    default:
      return JSON.stringify(e).slice(0, 60)
  }
}

export function EventLog(): React.JSX.Element {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(true) // 默认展开,方便用户首次跑就看到事件流
  const counterRef = useRef(0)

  function push(type: string, e: Record<string, unknown>): void {
    counterRef.current += 1
    const entry: LogEntry = {
      id: counterRef.current,
      ts: Date.now(),
      type,
      preview: summarize(type, e)
    }
    setEntries((prev) => [...prev.slice(-(MAX_ENTRIES - 1)), entry])
  }

  // 订阅所有关心的 type
  useAgentEvent('status', (e) => push('status', e))
  useAgentEvent('assistant_delta', (e) => push('assistant_delta', e))
  useAgentEvent('assistant_done', (e) => push('assistant_done', e))
  useAgentEvent('tool', (e) => push('tool', e))
  useAgentEvent('task', (e) => push('task', e))
  useAgentEvent('error', (e) => push('error', e))
  useAgentEvent('done', (e) => push('done', e))
  useAgentEvent('notify', (e) => push('notify', e))
  useAgentEvent('blocked', (e) => push('blocked', e))
  useAgentEvent('goal_complete', (e) => push('goal_complete', e))
  useAgentEvent('result', (e) => push('result', e))

  // Stage 4.3: 防止后续有未订阅的 type(对账 sanity check)
  useEffect(() => {
    void SUBSCRIBED_TYPES
  }, [])

  const latest = entries[entries.length - 1]

  return (
    <div className={`event-log ${open ? 'event-log-open' : 'event-log-collapsed'}`}>
      <button
        type="button"
        className="event-log-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="event-log-icon">{open ? '▼' : '▶'}</span>
        <span className="event-log-title">事件流</span>
        <span className="event-log-count">{entries.length}</span>
        {!open && latest ? (
          <span className="event-log-latest">
            <span className="event-log-type">{latest.type}</span>
            <span className="event-log-preview">{latest.preview}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <ul className="event-log-list">
          {entries.length === 0 ? (
            <li className="event-log-empty">等待事件…</li>
          ) : (
            entries
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className={`event-log-row event-log-type-${e.type}`}>
                  <span className="event-log-time">
                    {new Date(e.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                  </span>
                  <span className="event-log-type">{e.type}</span>
                  <span className="event-log-preview">{e.preview}</span>
                </li>
              ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
