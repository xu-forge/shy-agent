import type { SessionSummary } from '../../../shared/ipc'

export type NavKey = 'chat' | 'memory' | 'skills'

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
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
  }
]

export function Sidebar({
  active,
  onChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession
}: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="brand-row">
          <div className="brand" title="my-agent">
            m
          </div>
          <span className="brand-name">my-agent</span>
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
        <div className="session-list">
          {sessions.length === 0 ? (
            <p className="history-empty">暂无会话</p>
          ) : (
            sessions.map((s) => (
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
                    {s.mode === 'goal' ? '目标' : '交互'}
                    {s.paused ? ' · 暂停' : ''}
                  </span>
                </button>
                <button
                  type="button"
                  className="session-delete"
                  aria-label="删除会话"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSession(s.id)
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </aside>
  )
}
