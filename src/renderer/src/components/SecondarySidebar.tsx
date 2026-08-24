import { useEffect, useRef, useState } from 'react'
import type { SessionSummary } from '../../../shared/ipc'
import { timeAgo } from '../lib/time'
import type { SecondaryMode, SessionGroup } from '../lib/shellLayout'
import { FileTree } from './code/FileTree'

type Props = {
  mode: SecondaryMode
  groups: SessionGroup[]
  activeSessionId: string
  onSelectSession: (session: SessionSummary) => void
  onNewSession: () => void
  onDeleteSession: (id: string, title: string) => void
  projectId?: string | null
  rootPath?: string | null
  activeFilePath?: string | null
  onOpenFile?: (relativePath: string) => void
}

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

const TRASH_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" />
  </svg>
)

export function SecondarySidebar({
  mode,
  groups,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  projectId,
  rootPath,
  activeFilePath,
  onOpenFile
}: Props): React.JSX.Element {
  const [width, setWidth] = useState<number>(() =>
    typeof window === 'undefined' ? SIDEBAR_DEFAULT_WIDTH : loadSidebarWidth()
  )
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    const onResize = (): void => setWidth((w) => clampSidebarWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <aside className="sidebar secondary-sidebar" style={{ width }}>
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
      {mode === 'files' ? (
        projectId && rootPath && onOpenFile ? (
          <FileTree
            projectId={projectId}
            rootPath={rootPath}
            activePath={activeFilePath ?? null}
            onOpenFile={onOpenFile}
          />
        ) : (
          <div className="file-tree-stub" aria-label="文件树">
            <div className="sb-list-head">文件树</div>
            <p className="history-empty">未绑定代码项目。</p>
          </div>
        )
      ) : (
        <>
          <div className="sidebar-top">
            <button type="button" className="sb-new-task" onClick={onNewSession}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              新建任务
            </button>
          </div>
          <div className="sb-list">
            {groups.map((group) => (
              <div key={group.id ?? 'unselected'} className="sb-group">
                <div className="sb-group-head">
                  {group.title}
                  <span className="sb-section-count">{group.sessions.length}</span>
                </div>
                {group.sessions.length === 0 ? (
                  group.id === null && groups.every((g) => g.sessions.length === 0) ? (
                    <p className="history-empty">还没有会话，点击「新建任务」开始。</p>
                  ) : null
                ) : (
                  <div className="project-list">
                    {group.sessions.map((s) => {
                      const isActive = s.id === activeSessionId
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
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
