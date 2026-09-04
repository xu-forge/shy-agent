import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessionSummary } from '../../../shared/ipc'
import { flattenGroupSessions, recentSessions } from '../lib/sidebarRecent'
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
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5v5l3 2" />
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
  { tab: 'mcp', label: 'MCP' },
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

const NEW_CHAT_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 6.5h10.5a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2H9l-4 2.5V18.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
    <path d="M14.5 4.5l4 4M15.5 4.5v3h3" />
  </svg>
)

const FOLDER_ICON = (
  <svg className="sb-folder-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2H18.5a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9Z" />
  </svg>
)

const ELLIPSIS_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

const REMOVE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
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

function loadCollapsedGroups(): Set<string> {
  try {
    return new Set(parseCollapsedGroups(localStorage.getItem(NAV_GROUP_COLLAPSED_KEY)))
  } catch {
    return new Set()
  }
}

/** Codex 风格单列导航：短导航 + 项目文件夹树 + 最近；收起不展示历史。 */
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [projectMenu, setProjectMenu] = useState<{
    id: string
    title: string
    top: number
    left: number
  } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups)
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? SIDEBAR_DEFAULT_WIDTH : loadSidebarWidth()
  )
  const [hoverOpen, setHoverOpen] = useState(false)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)
  const hoverCloseTimer = useRef<number | null>(null)
  const projectMenuRef = useRef<HTMLDivElement | null>(null)

  const recent = useMemo(
    () => recentSessions(flattenGroupSessions(groups)),
    [groups]
  )

  useEffect(() => {
    const onResize = (): void => setWidth((w) => clampSidebarWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!expanded) return
    setHoverOpen(false)
    if (hoverCloseTimer.current != null) {
      window.clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
  }, [expanded])

  useEffect(() => {
    return () => {
      if (hoverCloseTimer.current != null) window.clearTimeout(hoverCloseTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!projectMenu) return
    const onDoc = (e: MouseEvent): void => {
      const el = projectMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setProjectMenu(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setProjectMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [projectMenu])

  const openFlyout = (): void => {
    if (hoverCloseTimer.current != null) {
      window.clearTimeout(hoverCloseTimer.current)
      hoverCloseTimer.current = null
    }
    setHoverOpen(true)
  }

  const scheduleFlyoutClose = (): void => {
    if (hoverCloseTimer.current != null) window.clearTimeout(hoverCloseTimer.current)
    hoverCloseTimer.current = window.setTimeout(() => {
      hoverCloseTimer.current = null
      setHoverOpen(false)
      setProjectMenu(null)
    }, 160)
  }

  const flyoutAware =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      setHoverOpen(false)
      setProjectMenu(null)
      fn(...args)
    }

  const onToggleGroup = (key: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(toggleCollapsedGroup([...prev], key))
      localStorage.setItem(NAV_GROUP_COLLAPSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const scrollHideTimers = useRef(new WeakMap<Element, number>())

  const onListScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    el.classList.add('is-scrolling')
    const prev = scrollHideTimers.current.get(el)
    if (prev != null) window.clearTimeout(prev)
    const t = window.setTimeout(() => {
      el.classList.remove('is-scrolling')
      scrollHideTimers.current.delete(el)
    }, 900)
    scrollHideTimers.current.set(el, t)
  }

  const navToggle = (
    <button
      type="button"
      className={`sb-nav-toggle no-drag${expanded ? ' is-expanded' : ''}`}
      aria-label={expanded ? '收起导航栏' : '展开导航栏'}
      aria-expanded={expanded}
      title={expanded ? '收起导航' : '展开导航'}
      onClick={onToggleExpanded}
      onMouseEnter={expanded ? undefined : openFlyout}
    >
      {SIDEBAR_PANEL_ICON}
    </button>
  )

  const renderBody = (flyout: boolean): React.JSX.Element => {
    const onNavigate = flyout
      ? <A extends unknown[]>(fn: (...args: A) => void) => flyoutAware(fn)
      : <A extends unknown[]>(fn: (...args: A) => void) => fn
    return (
      <>
        <div className="sidebar-top">
          <nav className="sb-subnav" aria-label="快捷入口">
            <button
              type="button"
              className="sb-subnav-item"
              onClick={onNavigate(onNewSession)}
            >
              {NEW_CHAT_ICON}
              <span>新对话</span>
            </button>
            {SUB_NAV.map((n) => (
              <button
                key={n.key}
                type="button"
                className={`sb-subnav-item${active === n.key ? ' active' : ''}`}
                onClick={onNavigate(() => onChange(n.key))}
              >
                {n.icon}
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="sb-list" onScroll={onListScroll}>
          <div className="sb-section-label">项目</div>
          {groups.map((group) => {
            const key = groupStorageKey(group.id)
            const groupOpen = !collapsedGroups.has(key)
            const named = Boolean(group.id)
            const projectActive =
              named &&
              group.sessions.some((s) => s.id === activeSessionId) &&
              active === 'projects'
            const menuOpen = projectMenu?.id === group.id
            return (
              <div key={key} className="sb-group">
                <div
                  className={`sb-project-row${projectActive ? ' is-active' : ''}${
                    menuOpen ? ' is-menu-open' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="sb-project-main"
                    aria-expanded={groupOpen}
                    onClick={() => onToggleGroup(key)}
                  >
                    {named ? FOLDER_ICON : null}
                    <span className="sb-project-title">{group.title}</span>
                  </button>
                  {named && group.id ? (
                    <div className="sb-project-more-wrap">
                      <button
                        type="button"
                        className="sb-project-more"
                        aria-label="项目菜单"
                        aria-expanded={menuOpen}
                        title="更多"
                        onClick={(e) => {
                          e.stopPropagation()
                          const id = group.id
                          if (!id) return
                          if (projectMenu?.id === id) {
                            setProjectMenu(null)
                            return
                          }
                          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                          setProjectMenu({
                            id,
                            title: group.title,
                            top: rect.bottom + 4,
                            left: Math.max(8, rect.right - 168)
                          })
                        }}
                      >
                        {ELLIPSIS_ICON}
                      </button>
                    </div>
                  ) : null}
                </div>
                <div
                  className={`sb-collapse${groupOpen ? ' is-open' : ''}`}
                  aria-hidden={!groupOpen}
                >
                  <div className="sb-collapse-inner">
                    {group.sessions.length === 0 ? (
                      group.id === null && groups.every((g) => g.sessions.length === 0) ? (
                        <p className="history-empty">还没有会话，点击「新对话」开始。</p>
                      ) : (
                        <p className="history-empty">还没有对话</p>
                      )
                    ) : (
                      <div className="sb-session-list">
                        {group.sessions.map((s) => {
                          const isActive = s.id === activeSessionId && active === 'projects'
                          return (
                            <div
                              key={s.id}
                              className={`sb-session-row${isActive ? ' is-active' : ''}`}
                            >
                              <button
                                type="button"
                                className="sb-session-main"
                                tabIndex={groupOpen ? 0 : -1}
                                onClick={() => onNavigate(onSelectSession)(s)}
                                title={s.title}
                              >
                                <span className="sb-session-title">{s.title}</span>
                              </button>
                              <button
                                type="button"
                                className="sb-session-delete"
                                tabIndex={groupOpen ? 0 : -1}
                                aria-label="删除会话"
                                title="删除会话"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onDeleteSession(s.id, s.title)
                                }}
                              >
                                {TRASH_ICON}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {recent.length > 0 ? (
            <>
              <div className="sb-section-label sb-section-label-recent">最近</div>
              <div className="sb-recent-list">
                {recent.map((s) => {
                  const isActive = s.id === activeSessionId && active === 'projects'
                  return (
                    <button
                      key={`recent-${s.id}`}
                      type="button"
                      className={`sb-recent-item${isActive ? ' is-active' : ''}`}
                      onClick={() => onNavigate(onSelectSession)(s)}
                      title={s.title}
                    >
                      {s.title}
                    </button>
                  )
                })}
              </div>
            </>
          ) : null}
        </div>

        <div className="sidebar-bottom">
          <div
            className="sb-account"
            onClick={() => onNavigate(onOpenSettings)()}
            onMouseEnter={() => setSettingsOpen(true)}
            onMouseLeave={() => setSettingsOpen(false)}
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
            {settingsOpen ? (
              <div className="settings-popover" onClick={(e) => e.stopPropagation()}>
                {SETTINGS_OPTS.map((o) => (
                  <button
                    key={o.tab}
                    type="button"
                    className="settings-pop-item"
                    onClick={() => onNavigate(onOpenSettings)(o.tab)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </>
    )
  }

  const projectMenuPortal =
    projectMenu && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={projectMenuRef}
            className="sb-project-menu sb-project-menu-fixed"
            role="menu"
            style={{ top: projectMenu.top, left: projectMenu.left }}
          >
            <button
              type="button"
              className="sb-project-menu-item danger"
              role="menuitem"
              onClick={() => {
                const { id, title } = projectMenu
                setProjectMenu(null)
                onDeleteProject(id, title)
                setHoverOpen(false)
              }}
            >
              {REMOVE_ICON}
              移除项目
            </button>
          </div>,
          document.body
        )
      : null

  if (!expanded) {
    return (
      <aside className="sidebar sidebar-collapsed" aria-label="主导航">
        <div className="sidebar-hover-zone" onMouseEnter={openFlyout} />
        {navToggle}
        {hoverOpen ? (
          <div
            className="sidebar-flyout"
            style={{ width }}
            onMouseEnter={openFlyout}
            onMouseLeave={scheduleFlyoutClose}
          >
            {renderBody(true)}
          </div>
        ) : null}
        {projectMenuPortal}
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
      {renderBody(false)}
      {projectMenuPortal}
    </aside>
  )
}
