import { useEffect, useState } from 'react'
import { ModeToggle, type ModeKey } from './ModeToggle'

type Props = {
  ipcOk: boolean | null
  onOpenSettings: () => void
  notice?: string
}

type Msg = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }

export function ChatWorkspace({ ipcOk, onOpenSettings, notice }: Props): React.JSX.Element {
  const [sessionId] = useState(() => `session-${crypto.randomUUID()}`)
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'system',
      content: 'my-agent 已就绪。请先在设置中配置 OpenAI-compatible（如 Minimax）凭证。'
    }
  ])

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
          { role: 'tool', content: `工具 ${ev.name ?? ''}: ${JSON.stringify(ev.detail ?? {})}` }
        ])
      } else if (ev.type === 'status' && ev.message) {
        setStatus(ev.message)
      } else if (ev.type === 'error' && ev.message) {
        setMessages((prev) => [...prev, { role: 'system', content: `错误：${ev.message}` }])
      } else if (ev.type === 'done') {
        setBusy(false)
        setStatus(ev.reason === 'cancelled' ? '已取消' : '完成')
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
    setStatus(mode === 'goal' ? '目标模式…' : '交互式…')
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
          <button type="button" onClick={onOpenSettings}>
            设置
          </button>
          <div className={`status${ipcOk ? ' ok' : ''}`}>
            {ipcOk === null ? 'IPC…' : ipcOk ? status || 'IPC 正常' : 'IPC 异常'}
          </div>
        </div>
      </div>
      <div className="workspace">
        {notice ? <div className="banner">{notice}</div> : null}
        <div className="thread live">
          {messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              <span className="msg-role">{m.role}</span>
              <pre>{m.content}</pre>
            </div>
          ))}
        </div>
        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={mode === 'goal' ? '描述目标…' : '输入消息…'}
            aria-label="消息输入"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void onSend()
            }}
          />
          {busy ? (
            <button type="button" onClick={() => void onCancel()}>
              取消
            </button>
          ) : (
            <button type="button" className="primary" onClick={() => void onSend()}>
              发送
            </button>
          )}
        </div>
        <div className="hint">Ctrl/Cmd+Enter 发送</div>
      </div>
    </div>
  )
}
