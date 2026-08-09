import { useEffect, useRef, useState } from 'react'
import { ModeToggle, type ModeKey } from './ModeToggle'

type Props = {
  ipcOk: boolean | null
  onOpenSettings: () => void
  notice?: string
}

type Msg = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }

const ROLE_LABEL: Record<Msg['role'], string> = {
  user: '你',
  assistant: 'my-agent',
  system: '系统',
  tool: '工具'
}

export function ChatWorkspace({ ipcOk, onOpenSettings, notice }: Props): React.JSX.Element {
  const [sessionId] = useState(() => `session-${crypto.randomUUID()}`)
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'system',
      content: '已就绪。请先在右上角打开设置，配置 OpenAI-compatible 凭证（如 Minimax）。'
    }
  ])
  const threadRef = useRef<HTMLDivElement>(null)

  const hasConversation = messages.some((m) => m.role === 'user' || m.role === 'assistant')

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

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
      }
      if (ev.sessionId && ev.sessionId !== sessionId) return
      if (ev.type === 'assistant' && ev.content) {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { role: 'assistant', content: ev.content! }
          } else {
            next.push({ role: 'assistant', content: ev.content! })
          }
          return next
        })
      } else if (ev.type === 'tool') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'tool',
            content: `${ev.name ?? 'tool'}\n${JSON.stringify(ev.detail ?? {}, null, 2)}`
          }
        ])
      } else if (ev.type === 'status' && ev.message) {
        setStatus(ev.message)
      } else if (ev.type === 'error' && ev.message) {
        setMessages((prev) => [...prev, { role: 'system', content: `错误：${ev.message}` }])
      } else if (ev.type === 'done') {
        setBusy(false)
        setStatus(ev.reason === 'cancelled' ? '已取消' : '')
      } else if (ev.type === 'notify' && ev.message) {
        setMessages((prev) => [...prev, { role: 'system', content: ev.message! }])
      }
    })
  }, [sessionId])

  const onSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setStatus(mode === 'goal' ? '目标推进中' : '思考中')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    await window.myAgent.chat({ sessionId, message: text, mode })
  }

  const onCancel = async (): Promise<void> => {
    await window.myAgent.cancel(sessionId)
    setBusy(false)
    setStatus('正在取消…')
  }

  return (
    <div className="main">
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

          <div className="thread" ref={threadRef}>
            {!hasConversation ? (
              <div className="empty-state">
                <div className="empty-mark">m</div>
                <h1>有什么可以帮忙的？</h1>
                <p>交互式协作，或切换到目标模式让我持续推进到可验收结果。</p>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`msg msg-${m.role}`}>
                  <div className="msg-role">{ROLE_LABEL[m.role]}</div>
                  <pre>{m.content}</pre>
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
                {busy ? (
                  <button type="button" className="danger-btn" onClick={() => void onCancel()}>
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => void onSend()}
                    disabled={!draft.trim()}
                  >
                    发送
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
