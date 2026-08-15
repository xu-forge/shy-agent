import { useCallback, useEffect, useRef, useState } from 'react'
import { ModeToggle, type ModeKey } from './ModeToggle'
import { AssistantMessage } from './AssistantMessage'
import { MarkdownBody } from './MarkdownBody'
import { SessionPanel, PANEL_KEY } from './SessionPanel'
import { timeAgo } from '../lib/time'
import { normalizeVerifyCommand } from './goalUi'

type Props = {
  notice?: string
  sessionId: string
  onSessionsChanged?: () => void
}

type Msg = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; createdAt?: string }

const SUGGESTIONS: { label: string; text: string }[] = [
  {
    label: '梳理一个周末计划',
    text: '帮我安排一个上海周末两日计划，含行程、餐饮和大致预算。'
  },
  {
    label: '解释并优化代码',
    text: '帮我解释下面这段代码做了什么，并给出优化建议：'
  },
  {
    label: '设定目标：完成周报',
    text: '目标：根据本周的工作要点，产出一份周报草稿，保存为 Markdown 文件。'
  },
  {
    label: '整理长期记忆',
    text: '帮我看看长期记忆里有没有过时或重复的条目，合并清理一下。'
  }
]

export function ChatWorkspace({ notice, sessionId, onSessionsChanged }: Props): React.JSX.Element {
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [verifyCommand, setVerifyCommand] = useState('')
  const [busy, setBusy] = useState(false)
  const [paused, setPaused] = useState(false)
  const [status, setStatus] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PANEL_KEY) === '1'
    } catch {
      return false
    }
  })
  const togglePanel = (): void => {
    setPanelOpen((cur) => {
      const next = !cur
      try {
        localStorage.setItem(PANEL_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const hasConversation = messages.some((m) => m.role === 'user' || m.role === 'assistant')

  // 输入框主体（空状态居中版 / 底部版共用）
  const composerInner = (): React.JSX.Element => (
    <div className="composer-shell">
      <textarea
        ref={composerRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={mode === 'goal' ? '描述你的目标…' : '询问、指派任务，或粘贴上下文…'}
        aria-label="消息输入"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void onSend()
          }
        }}
      />
      {mode === 'goal' ? (
        <input
          className="verify-command-input"
          value={verifyCommand}
          onChange={(e) => setVerifyCommand(e.target.value)}
          placeholder="总验收命令，例如 npm test"
          aria-label="总验收命令"
        />
      ) : null}
      <div className="composer-bar">
        <span className="hint">Enter 发送 · Shift+Enter 换行</span>
        <div className="composer-actions">
          {busy && !paused ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void onPause()}>
                暂停
              </button>
              <button type="button" className="btn btn-danger" onClick={() => void onCancel()}>
                停止
              </button>
            </>
          ) : null}
          {paused ? (
            <button type="button" className="btn btn-primary" onClick={() => void onResume()}>
              继续
            </button>
          ) : null}
          {!busy && !paused ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onSend()}
              disabled={!draft.trim()}
            >
              发送
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )

  useEffect(() => {
    let alive = true
    window.shy.getSession(sessionId).then((detail) => {
      if (!alive || !detail) return
      setMode(detail.mode)
      setVerifyCommand(detail.mode === 'goal' ? (detail.verifyCommand ?? '') : '')
      setPaused(detail.paused)
      setBusy(false)
      setStatus('')
      setMessages(
        detail.messages.length
          ? detail.messages.map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt
            }))
          : []
      )
    })
    return () => {
      alive = false
    }
  }, [sessionId])

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as {
        sessionId?: string
        type?: string
        content?: string
        message?: string
        name?: string
        detail?: unknown
        reason?: string
        goal?: string
      }
      if (ev.sessionId && ev.sessionId !== sessionId) return
      if (ev.type === 'assistant' && ev.content) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: ev.content!, createdAt: new Date().toISOString() }
        ])
      } else if (ev.type === 'tool') {
        setMessages((prev) => [
          ...prev,
          {
            role: 'tool',
            content: `${ev.name ?? 'tool'}\n${JSON.stringify(ev.detail ?? {}, null, 2)}`,
            createdAt: new Date().toISOString()
          }
        ])
      } else if (ev.type === 'status' && ev.message) {
        setStatus(ev.message)
        if (ev.message.includes('暂停')) setPaused(true)
      } else if (ev.type === 'error' && ev.message) {
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: `错误：${ev.message}`, createdAt: new Date().toISOString() }
        ])
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
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: ev.message!, createdAt: new Date().toISOString() }
        ])
      }
    })
  }, [sessionId, onSessionsChanged])

  const focusComposer = useCallback(() => {
    composerRef.current?.focus()
  }, [])

  // 快捷键：/ 或 Ctrl/Cmd+K 聚焦输入框
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (e.key === '/' && !typing) {
        e.preventDefault()
        focusComposer()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !typing) {
        e.preventDefault()
        focusComposer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focusComposer])

  // 输入框自适应高度
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const onSend = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || !sessionId) return
    setDraft('')
    setBusy(true)
    setPaused(false)
    setStatus(mode === 'goal' ? '目标推进中' : '思考中')
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, createdAt: new Date().toISOString() }
    ])
    await window.shy.chat({
      sessionId,
      message: text,
      mode,
      verifyCommand: normalizeVerifyCommand(verifyCommand)
    })
    onSessionsChanged?.()
  }

  const onCancel = async (): Promise<void> => {
    await window.shy.cancel(sessionId)
    setBusy(false)
    setPaused(false)
    setStatus('正在取消…')
  }

  const onPause = async (): Promise<void> => {
    await window.shy.pause(sessionId)
    setPaused(true)
    setStatus('已请求暂停…')
  }

  const onResume = async (): Promise<void> => {
    setBusy(true)
    setPaused(false)
    setStatus('恢复中…')
    await window.shy.resume(sessionId)
  }

  // 状态指示：连接健康已移到底部侧栏；顶栏只显示运行中状态
  let runningCls = ''
  let runningText = ''
  if (busy) {
    runningCls = 'busy'
    runningText = status || '思考中…'
  } else if (paused) {
    runningCls = 'warn'
    runningText = status || '已暂停'
  }

  return (
    <div className={`main chat-column${panelOpen ? ' has-panel' : ''}`}>
      <div className="topbar">
        <ModeToggle
          mode={mode}
          onChange={(next) => {
            setMode(next)
            if (next !== 'goal') setVerifyCommand('')
          }}
        />
        <div className="top-actions">
          {runningCls ? (
            <div className={`status ${runningCls}`}>
              <span className="status-dot" aria-hidden="true" />
              {runningText}
            </div>
          ) : null}
          <button
            type="button"
            className={`icon-btn panel-toggle${panelOpen ? ' active' : ''}`}
            onClick={togglePanel}
            aria-pressed={panelOpen}
            aria-label="切换侧栏（任务 / 文件）"
            title="侧栏（任务 / 文件）"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="5" width="5.5" height="14" rx="1.5" />
              <rect x="11.5" y="5" width="8.5" height="14" rx="1.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-body">
        <div className="workspace">
          <div className="workspace-inner">
            {notice ? <div className="banner">{notice}</div> : null}

            <div className="thread" ref={threadRef}>
              {!hasConversation ? (
                <div className="empty-state">
                  <div className="empty-mark">m</div>
                  <h1>有什么可以帮忙的？</h1>
                  <p>
                    交互式协作，或切换到目标模式让我规划清单并验收推进。
                    <br />按 <kbd>/</kbd> 或 <kbd>⌘K</kbd> 可随时聚焦输入框。
                  </p>
                  <div className="empty-composer">{composerInner()}</div>
                  <div className="suggestion-list">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        className="suggestion"
                        onClick={() => {
                          setDraft(s.text)
                          focusComposer()
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`msg msg-${m.role}`}>
                    {m.role === 'user' ? (
                      <div className="msg-bubble">
                        <MarkdownBody content={m.content} />
                      </div>
                    ) : null}
                    {m.role === 'assistant' ? (
                      <>
                        <div className="msg-head">
                          <span className="msg-avatar" aria-hidden="true">
                            m
                          </span>
                          <span className="msg-name">shy</span>
                          {m.createdAt ? (
                            <span className="msg-time">{timeAgo(m.createdAt)}</span>
                          ) : null}
                        </div>
                        <AssistantMessage content={m.content} />
                      </>
                    ) : null}
                    {m.role === 'tool' ? (
                      <>
                        <div className="msg-head">
                          <span
                            className="msg-avatar"
                            aria-hidden="true"
                            style={{ background: 'var(--tool)' }}
                          >
                            ⚙
                          </span>
                          <span className="msg-name">{toolNameOf(m.content)}</span>
                          <span className="chip chip-tool">工具调用</span>
                        </div>
                        <pre>{toolBodyOf(m.content)}</pre>
                      </>
                    ) : null}
                    {m.role === 'system' ? <div className="msg-pill">{m.content}</div> : null}
                  </div>
                ))
              )}
            </div>

            {hasConversation ? <div className="composer-dock">{composerInner()}</div> : null}
          </div>
        </div>
        <SessionPanel sessionId={sessionId} open={panelOpen} onClose={togglePanel} />
      </div>
    </div>
  )
}

/** 工具消息内容格式：`名称\nJSON`，拆出名称与正文 */
function toolNameOf(content: string): string {
  const first = content.split('\n')[0]?.trim()
  return first || '工具'
}

function toolBodyOf(content: string): string {
  const nl = content.indexOf('\n')
  return nl >= 0 ? content.slice(nl + 1) : content
}
