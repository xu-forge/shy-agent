import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../../shared/ipc'
import { timeAgo } from '../lib/time'
import {
  NAV_GROUP_COLLAPSED_KEY,
  groupStorageKey,
  parseCollapsedGroups,
  toggleCollapsedGroup,
  type NavKey,
  type SessionGroup
} from '../lib/shellLayout'
import type { SettingsTab } from './SettingsDialog'

export type { NavKey }

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  expanded: boolean
  onToggleExpanded: () => void
  groups: SessionGroup[]
  activeSessionId: string
  onSelectSession: (session: SessionSummary) => void
  onNewSession: () => void
  onDeleteSession: (id: string, title: string) => void
  onDeleteProject: (id: string, title: string) => void
  ipcOk: boolean | null
  onOpenSettings: (tab?: SettingsTab) => void
}

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
const SIDEBAR_DEFAULT_WIDTH = 264
const SIDEBAR_MIN_WIDTH = 220

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

function ipcLabel(ipcOk: boolean | null): string {
  if (ipcOk === null) return '连接中…'
  return ipcOk ? '已连接' : '连接异常'
}

const TRASH_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" />
  </svg>
)

const PLUS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const SETTINGS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2.2M12 18.3V20.5M4.9 6.5l1.6 1.6M17.5 16.9l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.9 17.5l1.6-1.6M17.5 7.1l1.6-1.6" />
  </svg>
)

const SIDEBAR_PANEL_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
    <rect className="sb-nav-toggle-pane" x="3.5" y="4" width="6" height="16" rx="2.5" />
  </svg>
)

const GROUP_CHEVRON = (
  <svg className="sb-group-chevron" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
)

function loadCollapsedGroups(): Set<string> {
  try {
    return new Set(parseCollapsedGroups(localStorage.getItem(NAV_GROUP_COLLAPSED_KEY)))
  } catch {
    return new Set()
  }
}

/** 单列导航：展开 = 新建任务 + 会话历史（旧侧栏）；收起 = 仅图标，不展示历史。 */
export function Sidebar({
  active,
  onChange,
  expanded,
  onToggleExpanded,
  groups,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onDeleteProject,
  ipcOk,
  onOpenSettings
}: Props): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups)
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? SIDEBAR_DEFAULT_WIDTH : loadSidebarWidth()
  )
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    const onResize = (): void => setWidth((w) => clampSidebarWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onToggleGroup = (key: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(toggleCollapsedGroup([...prev], key))
      localStorage.setItem(NAV_GROUP_COLLAPSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const navToggle = (
    <button
      type="button"
      className={`sb-nav-toggle no-drag${expanded ? ' is-expanded' : ''}`}
      aria-label={expanded ? '收起导航栏' : '展开导航栏'}
      aria-expanded={expanded}
      title={expanded ? '收起导航' : '展开导航'}
      onClick={onToggleExpanded}
    >
      {SIDEBAR_PANEL_ICON}
    </button>
  )

  if (!expanded) {
    return (
      <aside className="sidebar sidebar-collapsed" aria-label="主导航">
        {navToggle}
        <div className="icon-rail-top">
            {SUB_NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`icon-rail-btn${active === item.key ? ' active' : ''}`}
                aria-label={item.label}
                aria-current={active === item.key ? 'page' : undefined}
                title={item.label}
                onClick={() => onChange(item.key)}
              >
                {item.icon}
              </button>
            ))}
            <button
              type="button"
              className="icon-rail-btn"
              aria-label="新建任务"
              title="新建任务"
              onClick={onNewSession}
            >
              {PLUS_ICON}
            </button>
          </div>
        <div className="icon-rail-bottom">
          <span
            className={`icon-rail-status${ipcOk === null ? '' : ipcOk ? ' ok' : ' err'}`}
            title={ipcLabel(ipcOk)}
            aria-label={ipcLabel(ipcOk)}
          >
            <span className="status-dot" aria-hidden="true" />
          </span>
          <button
            type="button"
            className="icon-rail-btn"
            aria-label="设置"
            title="设置"
            onClick={() => onOpenSettings('general')}
          >
            {SETTINGS_ICON}
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar" style={{ width }} aria-label="主导航">
      {navToggle}
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
          {PLUS_ICON}
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
        {groups.map((group) => {
          const key = groupStorageKey(group.id)
          const groupOpen = !collapsedGroups.has(key)
          return (
          <div key={key} className="sb-group">
            <div className="sb-group-head">
              <button
                type="button"
                className="sb-group-head-toggle"
                aria-expanded={groupOpen}
                onClick={() => onToggleGroup(key)}
              >
                {GROUP_CHEVRON}
                <span className="sb-group-head-label">
                  {group.title}
                  <span className="sb-section-count">{group.sessions.length}</span>
                </span>
              </button>
              {group.id ? (
                <span
                  className="session-delete"
                  role="button"
                  aria-label="删除项目"
                  title="删除项目"
                  onClick={() => {
                    const id = group.id
                    if (id) onDeleteProject(id, group.title)
                  }}
                >
                  {TRASH_ICON}
                </span>
              ) : null}
            </div>
            {groupOpen ? (
              group.sessions.length === 0 ? (
                group.id === null && groups.every((g) => g.sessions.length === 0) ? (
                  <p className="history-empty">还没有会话，点击「新建任务」开始。</p>
                ) : null
              ) : (
                <div className="project-list">
                  {group.sessions.map((s) => {
                    const isActive = s.id === activeSessionId && active === 'projects'
                    return (
                      <div key={s.id} className={`project-item${isActive ? ' active' : ''}`}>
                        <button
                          type="button"
                          className="project-item-main"
                          onClick={() => onSelectSession(s)}
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
                  })}
                </div>
              )
            ) : null}
          </div>
          )
        })}
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
              {ipcLabel(ipcOk)}
            </span>
          </div>
          <button type="button" className="icon-btn" aria-label="设置" title="设置">
            {SETTINGS_ICON}
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
