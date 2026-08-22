import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../../shared/ipc'
import { timeAgo } from '../lib/time'
import type { SettingsTab } from './SettingsDialog'

export type NavKey = 'chat' | 'skills' | 'calendar'

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  sessions: SessionSummary[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string, title: string) => void
  ipcOk: boolean | null
  onOpenSettings: (tab?: SettingsTab) => void
}

/** 左栏次级入口（zcode-home-replica：自动化/插件市场位 → shy 真实功能） */
const SUB_NAV: { key: NavKey; label: string; icon: React.JSX.Element }[] = [
  {
    key: 'calendar',
    label: '定时任务',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
        <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
        <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
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

const SETTINGS_OPTS: { tab: SettingsTab; label: string }[] = [
  { tab: 'memory', label: '记忆' },
  { tab: 'general', label: '常规设置' },
  { tab: 'logs', label: '运行日志' }
]

const SIDEBAR_WIDTH_KEY = 'shy.sidebar-width'
const SIDEBAR_DEFAULT_WIDTH = 530
const SIDEBAR_MIN_WIDTH = 260

/** 最大宽度 = 窗口一半（窗口太小时保底 240） */
function sidebarMaxWidth(): number {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH
  return Math.max(240, Math.floor(window.innerWidth / 2))
}

function clampSidebarWidth(w: number): number {
  if (!Number.isFinite(w)) return SIDEBAR_DEFAULT_WIDTH
  return Math.min(sidebarMaxWidth(), Math.max(SIDEBAR_MIN_WIDTH, Math.round(w)))
}

function loadSidebarWidth(): number {
  const saved = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  return clampSidebarWidth(saved)
}

const TRASH_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" />
  </svg>
)

export function Sidebar({
  active,
  onChange,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  ipcOk,
  onOpenSettings
}: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? SIDEBAR_DEFAULT_WIDTH : loadSidebarWidth()
  )
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

  // 窗口缩放后保持 ≤ 一半窗口宽
  useEffect(() => {
    const onResize = (): void => setWidth((w) => clampSidebarWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <aside className="sidebar" style={{ width }}>
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="拖拽调整侧栏宽度"
        title="拖拽调整宽度"
        onPointerDown={(e) => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          dragState.current = { startX: e.clientX, startW: width }
        }}
        onPointerMove={(e) => {
          const d = dragState.current
          if (!d) return
          setWidth(clampSidebarWidth(d.startW + (e.clientX - d.startX)))
        }}
        onPointerUp={(e) => {
          dragState.current = null
          ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
          setWidth((w) => {
            localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w))
            return w
          })
        }}
        onDoubleClick={() => setWidth(SIDEBAR_DEFAULT_WIDTH)}
      />
      <div className="sidebar-top">
        <div className="sb-brand">shy</div>
        <button type="button" className="sb-new-task" onClick={onNewSession}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          新建任务
        </button>
        <nav className="sb-subnav">
          {SUB_NAV.map((n) => (
            <button
              key={n.key}
              type="button"
              className={`sb-subnav-item${active === n.key ? ' active' : ''}`}
              onClick={() => onChange(n.key)}
            >
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="sb-list">
        <div className="sb-list-head">
          会话
          <span className="sb-section-count">{sessions.length}</span>
        </div>

        <div className="project-list">
          {sessions.length === 0 ? (
            <p className="history-empty">还没有会话，点击「新建任务」开始。</p>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId && active === 'chat'
              return (
                <div key={s.id} className={`project-item${isActive ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="project-item-main"
                    onClick={() => {
                      onChange('chat')
                      onSelectSession(s.id)
                    }}
                    title={s.title}
                  >
                    <span className="project-item-title">{s.title}</span>
                    <span className="project-item-meta">
                      <span className="project-item-time">{timeAgo(s.updatedAt)}</span>
                      <span
                        className="session-delete"
                        role="button"
                        aria-label="删除会话"
                        title="删除会话"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSession(s.id, s.title)
                        }}
                      >
                        {TRASH_ICON}
                      </span>
                    </span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="sb-tasks">
          <div className="sb-tasks-head">
            任务
            <span className="sb-section-count">0</span>
          </div>
          <p className="history-empty">还没有任务</p>
        </div>
      </div>

      <div className="sidebar-bottom">
        <div
          className="sb-account"
          onClick={() => onOpenSettings()}
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
          role="button"
          tabIndex={0}
        >
          <div className="sb-avatar">s</div>
          <div className="sb-account-meta">
            <span className="sb-account-name">shy</span>
            <span className={`sb-account-status${ipcOk === null ? '' : ipcOk ? ' ok' : ' err'}`}>
              <span className="status-dot" aria-hidden="true" />
              {ipcOk === null ? '连接中…' : ipcOk ? '已连接' : '连接异常'}
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label="设置" title="设置">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
              <circle cx="15" cy="7" r="2" />
              <circle cx="9" cy="17" r="2" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="settings-popover" onClick={(e) => e.stopPropagation()}>
              {SETTINGS_OPTS.map((o) => (
                <button
                  key={o.tab}
                  type="button"
                  className="settings-pop-item"
                  onClick={() => onOpenSettings(o.tab)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
