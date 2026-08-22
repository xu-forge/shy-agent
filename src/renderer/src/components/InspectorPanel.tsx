/**
 * ProgressPanel — 对话视图右侧「进度」面板（对齐 MiniMax 参考图二）。
 *
 * 「进度」勾选清单，而非 "环境" 摘要：
 * - 进度：任务清单，每项带 ✓（已完成）/ ●（进行中）/ ○（待办），当前步骤高亮，分组计数
 * - 交付物：已编辑文件，点按复制路径，带操作徽标与计数
 *
 * 每 5s 轮询；sessionId 变化时立即重拉；分组展开状态持久化到 localStorage。
 */
import { useEffect, useState } from 'react'
import type { SessionFileRecord, SessionTaskRecord } from '../../../shared/ipc'

type Props = {
  sessionId: string
}

const POLL_INTERVAL_MS = 5_000
const ACCORDION_KEY = 'shy.envAccordion'

type SectionKey = 'progress' | 'deliverables'

const DEFAULT_OPEN: SectionKey[] = ['progress', 'deliverables']

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

  return (
    <aside className="inspector-panel">
      <div className="inspector-header">进度</div>
      <div className="inspector-body">
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
      </div>
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
