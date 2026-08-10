import { useCallback, useEffect, useRef, useState } from 'react'
import type { GoalChecklistItem } from '../../../shared/ipc'
import { ModeToggle, type ModeKey } from './ModeToggle'
import { AssistantMessage } from './AssistantMessage'
import { MarkdownBody } from './MarkdownBody'

type Props = {
  ipcOk: boolean | null
  onOpenSettings: () => void
  notice?: string
  sessionId: string
  onSessionsChanged?: () => void
}

type Msg = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }

const ROLE_LABEL: Record<Msg['role'], string> = {
  user: '你',
  assistant: 'my-agent',
  system: '系统',
  tool: '工具'
}

export function ChatWorkspace({
  ipcOk,
  onOpenSettings,
  notice,
  sessionId,
  onSessionsChanged
}: Props): React.JSX.Element {
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('')
  const [goal, setGoal] = useState('')
  const [checklist, setChecklist] = useState<GoalChecklistItem[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const threadRef = useRef<HTMLDivElement>(null)

  const hasConversation = messages.some((m) => m.role === 'user' || m.role === 'assistant')

  const loadSession = useCallback(async (id: string) => {
    if (!id) return
    const detail = await window.myAgent.getSession(id)
    if (!detail) return
    setMode(detail.mode)
    setPaused(detail.paused)
    setGoal(detail.goal ?? '')
    setChecklist(detail.checklist ?? [])
    setBusy(false)
    setStatus('')
    setMessages(
      detail.messages.length
        ? detail.messages.map((m) => ({ role: m.role, content: m.content }))
        : []
    )
  }, [])

  useEffect(() => {
    void loadSession(sessionId)
  }, [sessionId, loadSession])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, checklist])

  useEffect(() => {
    return window.myAgent.onEvent((payload) => {
      const ev = payload as {
        sessionId?: string
        type?: string
        content?: string
        message?: string
        name?: string
        detail?: unknown
        reason?: string
        goal?: string
        checklist?: GoalChecklistItem[]
      }
      if (ev.sessionId && ev.sessionId !== sessionId) return
      if (ev.type === 'assistant' && ev.content) {
        setMessages((prev) => [...prev, { role: 'assistant', content: ev.content! }])
      } else if (ev.type === 'tool') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'tool',
            content: `${ev.name ?? 'tool'}\n${JSON.stringify(ev.detail ?? {}, null, 2)}`
          }
        ])
      } else if (ev.type === 'goal') {
        if (ev.goal) setGoal(ev.goal)
        if (ev.checklist) setChecklist(ev.checklist)
      } else if (ev.type === 'status' && ev.message) {
        setStatus(ev.message)
        if (ev.message.includes('暂停')) setPaused(true)
      } else if (ev.type === 'error' && ev.message) {
        setMessages((prev) => [...prev, { role: 'system', content: `错误：${ev.message}` }])
      } else if (ev.type === 'done') {
        setBusy(false)
        if (ev.reason === 'paused') {
          setPaused(true)
          setStatus('已暂停')
        } else {
          setPaused(false)
          setStatus(ev.reason === 'cancelled' ? '已取消' : '')
        }
        onSessionsChanged?.()
      } else if (ev.type === 'notify' && ev.message) {
        setMessages((prev) => [...prev, { role: 'system', content: ev.message! }])
      }
    })
  }, [sessionId, onSessionsChanged])

  const onSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || !sessionId) return
    setDraft('')
    setBusy(true)
    setPaused(false)
    setStatus(mode === 'goal' ? '目标推进中' : '思考中')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    await window.myAgent.chat({ sessionId, message: text, mode })
    onSessionsChanged?.()
  }

  const onCancel = async (): Promise<void> => {
    await window.myAgent.cancel(sessionId)
    setBusy(false)
    setPaused(false)
    setStatus('正在取消…')
  }

  const onPause = async (): Promise<void> => {
    await window.myAgent.pause(sessionId)
    setPaused(true)
    setStatus('已请求暂停…')
  }

  const onResume = async (): Promise<void> => {
    setBusy(true)
    setPaused(false)
    setStatus('恢复中…')
    await window.myAgent.resume(sessionId)
  }

  const doneCount = checklist.filter((c) => c.done).length

  return (
    <div className="main chat-column">
      <div className="topbar">
        <ModeToggle mode={mode} onChange={setMode} />
        <div className="top-actions">
          <button type="button" className="ghost-btn" onClick={onOpenSettings}>
            设置
          </button>
          <div className={`status${ipcOk ? ' ok' : ''}`}>
            {ipcOk === null ? '连接中…' : ipcOk ? status || '已连接' : '连接异常'}
          </div>
        </div>
      </div>

      <div className="workspace">
        <div className="workspace-inner">
          {notice ? <div className="banner">{notice}</div> : null}

          {mode === 'goal' && (goal || checklist.length > 0) ? (
            <div className="goal-panel">
              <div className="goal-panel-head">
                <strong>{goal || '目标进度'}</strong>
                <span className="muted">
                  {doneCount}/{checklist.length || 0}
                </span>
              </div>
              <ul className="checklist">
                {checklist.map((c) => (
                  <li key={c.id} className={c.done ? 'done' : ''}>
                    <span className="check-mark">{c.done ? '✓' : '○'}</span>
                    <span>
                      {c.title}
                      {c.evidence ? <em className="evidence"> — {c.evidence}</em> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="thread" ref={threadRef}>
            {!hasConversation ? (
              <div className="empty-state">
                <div className="empty-mark">m</div>
                <h1>有什么可以帮忙的？</h1>
                <p>交互式协作，或切换到目标模式让我规划清单并验收推进。</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`msg msg-${m.role}`}>
                  <div className="msg-role">{ROLE_LABEL[m.role]}</div>
                  {m.role === 'assistant' ? (
                    <AssistantMessage content={m.content} />
                  ) : m.role === 'user' ? (
                    <MarkdownBody content={m.content} />
                  ) : (
                    <pre>{m.content}</pre>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="composer-dock">
            <div className="composer-shell">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={mode === 'goal' ? '描述你的目标…' : '询问、指派任务，或粘贴上下文…'}
                aria-label="消息输入"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void onSend()
                }}
              />
              <div className="composer-bar">
                <span className="hint">Ctrl / ⌘ + Enter 发送</span>
                <div className="composer-actions">
                  {busy && !paused ? (
                    <>
                      <button type="button" className="ghost-btn" onClick={() => void onPause()}>
                        暂停
                      </button>
                      <button type="button" className="danger-btn" onClick={() => void onCancel()}>
                        停止
                      </button>
                    </>
                  ) : null}
                  {paused ? (
                    <button type="button" className="primary" onClick={() => void onResume()}>
                      继续
                    </button>
                  ) : null}
                  {!busy && !paused ? (
                    <button
                      type="button"
                      className="primary"
                      onClick={() => void onSend()}
                      disabled={!draft.trim()}
                    >
                      发送
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
