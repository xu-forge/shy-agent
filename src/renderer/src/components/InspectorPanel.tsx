/**
 * InspectorPanel — 对话视图右侧功能面板（inspector-func-panel）。
 *
 * 三个 tab：
 * - 任务：进度勾选清单 + 交付物文件列表
 * - 文件：会话内文件改动 diff（jsdiff 计算 + highlight.js 高亮）
 * - 浏览器：内嵌浏览器（切走 tab 即隐藏原生视图，状态保留）
 *
 * 每 5s 轮询；tab 选择与分组展开持久化到 localStorage。
 */
import { useEffect, useState } from 'react'
import type { SessionFileRecord, SessionTaskRecord } from '../../../shared/ipc'
import { DiffView } from './DiffView'
import { BrowserPanel } from './chat/BrowserPanel'

type Props = {
  sessionId: string
}

const POLL_INTERVAL_MS = 5_000
const ACCORDION_KEY = 'shy.envAccordion'
const TAB_KEY = 'shy.inspectorTab'
const OPEN_KEY = 'shy.inspectorOpen'

type SectionKey = 'progress' | 'deliverables'
type PanelTab = 'tasks' | 'diffs' | 'browser'

const DEFAULT_OPEN: SectionKey[] = ['progress', 'deliverables']

const TABS: { key: PanelTab; label: string; icon: React.JSX.Element }[] = [
  {
    key: 'tasks',
    label: '任务',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12l4 4L19 6" />
      </svg>
    )
  },
  {
    key: 'diffs',
    label: '文件',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16M4 12h16" />
      </svg>
    )
  },
  {
    key: 'browser',
    label: '浏览器',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
      </svg>
    )
  }
]

function readTab(): PanelTab {
  const raw = localStorage.getItem(TAB_KEY)
  return raw === 'diffs' || raw === 'browser' || raw === 'tasks' ? raw : 'tasks'
}

function readPanelOpen(): boolean {
  return localStorage.getItem(OPEN_KEY) !== 'false'
}

function readOpen(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(ACCORDION_KEY)
    if (!raw) return new Set(DEFAULT_OPEN)
    const arr = JSON.parse(raw) as SectionKey[]
    return new Set(arr.filter((k): k is SectionKey => (DEFAULT_OPEN as string[]).includes(k)))
  } catch {
    return new Set(DEFAULT_OPEN)
  }
}

export function InspectorPanel({ sessionId }: Props): React.JSX.Element {
  const [tasks, setTasks] = useState<SessionTaskRecord[]>([])
  const [files, setFiles] = useState<SessionFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<PanelTab>(readTab)
  const [panelOpen, setPanelOpen] = useState<boolean>(readPanelOpen)
  const [open, setOpen] = useState<Set<SectionKey>>(readOpen)
  const [copiedPath, setCopiedPath] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(ACCORDION_KEY, JSON.stringify([...open]))
    } catch {
      /* ignore */
    }
  }, [open])

  const toggle = (key: SectionKey): void => {
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const [t, f] = await Promise.all([
          sessionId
            ? window.shy.listSessionTasks(sessionId).catch(() => [])
            : Promise.resolve([] as SessionTaskRecord[]),
          sessionId ? window.shy.listSessionFiles(sessionId).catch(() => []) : Promise.resolve([])
        ])
        if (!alive) return
        setTasks(t)
        setFiles(f)
        setLoading(false)
      } catch {
        if (alive) setLoading(false)
      }
    }
    void load()
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [sessionId])

  const done = tasks.filter((t) => t.done).length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  const editedFiles = files.filter((f) => f.op === 'write')
  const currentTask = tasks.find((t) => !t.done)

  const copyPath = async (path: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path)
      setCopiedPath(path)
      setTimeout(() => setCopiedPath(''), 1500)
    } catch {
      /* ignore */
    }
  }

  const setOpenPersisted = (next: boolean): void => {
    setPanelOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

  // 收起态：右缘只留一个展开把手（参考 ZCode 最右侧图标按钮）
  if (!panelOpen) {
    return (
      <aside className="inspector-panel collapsed">
        <button
          type="button"
          className="inspector-handle"
          title="展开功能面板"
          aria-label="展开功能面板"
          onClick={() => setOpenPersisted(true)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>
      </aside>
    )
  }

  return (
    <aside className="inspector-panel">
      <div className="inspector-tabs" role="tablist" aria-label="功能面板">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`inspector-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => {
              setTab(t.key)
              try {
                localStorage.setItem(TAB_KEY, t.key)
              } catch {
                /* ignore */
              }
            }}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        <button
          type="button"
          className="inspector-collapse"
          title="收起面板"
          aria-label="收起面板"
          onClick={() => setOpenPersisted(false)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {tab === 'browser' ? (
        <div className="inspector-browser">
          <BrowserPanel embedded />
        </div>
      ) : (
        <div className="inspector-body">
          {tab === 'diffs' ? (
            <DiffView sessionId={sessionId} />
          ) : (
            <>
              {loading ? <div className="inspector-empty">加载中…</div> : null}
              {!loading ? (
                <>
            <EnvGroup
              title="进度"
              badge={tasks.length ? `${done}/${tasks.length}` : undefined}
              open={open.has('progress')}
              onToggle={() => toggle('progress')}
            >
              {tasks.length === 0 ? (
                <EmptyHint title="还没有任务" hint="目标模式下会自动生成清单" />
              ) : (
                <div className="env-progress-wrap">
                  <div className="env-progress">
                    <div className="env-progress-bar">
                      <div className="env-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="env-progress-label">
                      {done}/{tasks.length} 完成 · {pct}%
                    </div>
                  </div>
                  <ul className="env-task-list">
                    {tasks.map((t) => {
                      const isCurrent = !t.done && currentTask?.id === t.id
                      return (
                        <li
                          key={t.id}
                          className={`env-task${t.done ? ' done' : ''}${isCurrent ? ' current' : ''}`}
                        >
                          <span className="task-check" aria-hidden="true">
                            {t.done ? '✓' : isCurrent ? '●' : '○'}
                          </span>
                          <div className="task-body">
                            <div className="task-title">{t.title}</div>
                            {t.evidence ? (
                              <div className="task-evidence">{t.evidence.slice(0, 90)}</div>
                            ) : null}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </EnvGroup>

            <EnvGroup
              title="交付物"
              badge={editedFiles.length ? `${editedFiles.length}` : undefined}
              open={open.has('deliverables')}
              onToggle={() => toggle('deliverables')}
            >
              {editedFiles.length === 0 ? (
                <EmptyHint title="暂无交付物" hint="Agent 改动的文件会出现在这里" />
              ) : (
                <ul className="env-file-list">
                  {editedFiles.map((f) => (
                    <li key={`${f.id}-${f.path}`}>
                      <button
                        type="button"
                        className="env-file"
                        onClick={() => void copyPath(f.path)}
                        title="点击复制路径"
                      >
                        <span className="file-op">改</span>
                        <span className="file-path">{f.path}</span>
                        <span className="file-copy">
                          {copiedPath === f.path ? '已复制' : '复制'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </EnvGroup>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </aside>
  )
}

function EnvGroup({
  title,
  badge,
  open,
  onToggle,
  children
}: {
  title: string
  badge?: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className={`env-section${open ? ' open' : ''}`}>
      <button type="button" className="env-section-head" onClick={onToggle} aria-expanded={open}>
        <span className="env-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span className="env-section-title">{title}</span>
        {badge ? <span className="env-section-badge">{badge}</span> : null}
      </button>
      {open ? <div className="env-section-body">{children}</div> : null}
    </section>
  )
}

function EmptyHint({ title, hint }: { title: string; hint: string }): React.JSX.Element {
  return (
    <div className="inspector-empty">
      <div className="inspector-empty-title">{title}</div>
      <div className="inspector-empty-hint">{hint}</div>
    </div>
  )
}
