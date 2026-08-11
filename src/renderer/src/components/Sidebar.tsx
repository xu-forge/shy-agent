import { useMemo, useState } from 'react'
import type { SessionSummary } from '../../../shared/ipc'
import { timeAgo } from '../lib/time'
import type { Theme } from '../lib/theme'

export type NavKey = 'chat' | 'memory' | 'skills' | 'workflows' | 'calendar' | 'settings'

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string, title: string) => void
  theme: Theme
  onToggleTheme: () => void
  ipcOk: boolean | null
  onOpenSettings: () => void
}

const items: { key: NavKey; label: string; icon: React.JSX.Element }[] = [
  {
    key: 'chat',
    label: '对话',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      </svg>
    )
  },
  {
    key: 'memory',
    label: '记忆',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    )
  },
  {
    key: 'skills',
    label: '技能',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7h11M8 12h11M8 17h11" />
        <path d="M5 7h.01M5 12h.01M5 17h.01" />
      </svg>
    )
  },
  {
    key: 'workflows',
    label: '工作流',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="15" y="15" width="6" height="6" rx="1.5" />
        <path d="M6 9v4a2 2 0 0 0 2 2h7" />
        <path d="M15 13l3 3-3 3" />
      </svg>
    )
  },
  {
    key: 'calendar',
    label: '日历',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
        <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
        <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
      </svg>
    )
  }
]

export function Sidebar({
  active,
  onChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  theme,
  onToggleTheme,
  ipcOk,
  onOpenSettings
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => s.title.toLowerCase().includes(q))
  }, [sessions, query])

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-row">
          <div className="brand" title="shy">
            s
          </div>
          <span className="brand-name">shy</span>
        </div>

        <nav className="sidebar-menu" aria-label="主导航">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-btn${active === item.key ? ' active' : ''}`}
              onClick={() => onChange(item.key)}
              aria-current={active === item.key ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            className="nav-btn new-session-btn"
            onClick={onNewSession}
            title="新建会话"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>新建会话</span>
          </button>
        </nav>
      </div>

      <div className="sidebar-history">
        <div className="history-label">历史会话</div>
        <input
          className="history-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话…"
          aria-label="搜索历史会话"
        />
        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="history-empty">暂无会话，点击上方「新建会话」开始。</p>
          ) : filtered.length === 0 ? (
            <p className="history-empty">没有匹配「{query.trim()}」的会话。</p>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className={`session-item${s.id === activeSessionId && active === 'chat' ? ' active' : ''}`}
              >
                <button
                  type="button"
                  className="session-item-main"
                  onClick={() => {
                    onChange('chat')
                    onSelectSession(s.id)
                  }}
                  title={s.title}
                >
                  <span className="session-title">{s.title}</span>
                  <span className="session-meta">
                    <span className={`chip chip-mode${s.mode === 'goal' ? ' chip-goal' : ''}`}>
                      {s.mode === 'goal' ? '目标' : '交互'}
                    </span>
                    <span className="session-time">{timeAgo(s.updatedAt)}</span>
                    {s.paused ? <span className="chip chip-paused">暂停</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="session-delete"
                  aria-label="删除会话"
                  title="删除会话"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSession(s.id, s.title)
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-bottom-row">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenSettings}
            title="设置"
            aria-label="设置"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="17" r="2" />
            </svg>
          </button>
          <span className="sidebar-footnote">shy v0.1</span>
        </div>
        <div
          className={`sidebar-status${ipcOk === null ? '' : ipcOk ? ' ok' : ' err'}`}
          role="status"
        >
          <span className="status-dot" aria-hidden="true" />
          {ipcOk === null ? '连接中…' : ipcOk ? '已连接' : '连接异常'}
        </div>
      </div>
    </aside>
  )
}
