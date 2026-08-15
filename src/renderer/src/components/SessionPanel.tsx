import { useCallback, useEffect, useState } from 'react'
import type { SessionFileRecord, SessionTaskRecord } from '../../../shared/ipc'
import { ConfirmDialog } from './ConfirmDialog'
import { truncateEvidence } from './goalUi'

type Tab = 'tasks' | 'files'

type Props = {
  sessionId: string
  open: boolean
  onClose: () => void
}

type PanelTask = Pick<SessionTaskRecord, 'id' | 'title' | 'done' | 'evidence' | 'source'> & {
  check?: string
  checklistItem?: boolean
}

const PANEL_KEY = 'shy.sidePanelOpen'
const TAB_KEY = 'shy.sidePanelTab'

export function SessionPanel({ sessionId, open, onClose }: Props): React.JSX.Element | null {
  const [tab, setTab] = useState<Tab>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(TAB_KEY) : null
    return saved === 'files' ? 'files' : 'tasks'
  })
  const [tasks, setTasks] = useState<PanelTask[]>([])
  const [files, setFiles] = useState<SessionFileRecord[]>([])
  const [recentTask, setRecentTask] = useState<string | null>(null)
  const [copiedPath, setCopiedPath] = useState<string | null>(null)
  const [confirmDelTask, setConfirmDelTask] = useState<{
    id: string
    title: string
    requestId: string
  } | null>(null)
  const [hiddenFiles, setHiddenFiles] = useState<Set<string>>(new Set())

  // 持久化 tab
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  // 拉取列表（返回数据，由调用方 setState，避免在 effect 中同步 setState）
  const fetchTasks = useCallback(async (): Promise<PanelTask[]> => {
    if (!sessionId) return []
    const [records, detail] = await Promise.all([
      window.shy.listSessionTasks(sessionId),
      window.shy.getSession(sessionId)
    ])
    const checklistIds = new Set(detail?.checklist.map((item) => item.id) ?? [])
    const checklist: PanelTask[] =
      detail?.checklist.map((item) => ({
        id: item.id,
        title: item.title,
        done: item.done,
        evidence: item.evidence,
        check: item.check,
        source: 'goal',
        checklistItem: true
      })) ?? []
    return [...checklist, ...records.filter((record) => !checklistIds.has(record.id))]
  }, [sessionId])

  const fetchFiles = useCallback(async (): Promise<SessionFileRecord[]> => {
    if (!sessionId) return []
    return window.shy.listSessionFiles(sessionId)
  }, [sessionId])

  useEffect(() => {
    let alive = true
    void fetchTasks().then((t) => {
      if (alive) setTasks(t)
    })
    void fetchFiles().then((f) => {
      if (alive) setFiles(f)
    })
    return () => {
      alive = false
    }
  }, [fetchTasks, fetchFiles])

  // 监听 task 事件实时刷新
  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as { type?: string; sessionId?: string; id?: string; kind?: string }
      if ((ev.type !== 'task' && ev.type !== 'goal') || ev.sessionId !== sessionId) return
      void fetchTasks().then(setTasks)
      if (ev.id) {
        setRecentTask(ev.id)
        setTimeout(() => setRecentTask((cur) => (cur === ev.id ? null : cur)), 1500)
      }
    })
  }, [sessionId, fetchTasks])

  // 监听事件触发文件刷新
  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as { type?: string; sessionId?: string }
      if (ev.sessionId === sessionId) {
        void fetchFiles().then(setFiles)
      }
    })
  }, [sessionId, fetchFiles])

  const toggleTask = async (task: PanelTask): Promise<void> => {
    await window.shy.updateSessionTask({
      sessionId,
      id: task.id,
      done: !task.done
    })
    void fetchTasks().then(setTasks)
  }

  const copyPath = async (p: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(p)
      setCopiedPath(p)
      setTimeout(() => setCopiedPath((cur) => (cur === p ? null : cur)), 1400)
    } catch {
      /* 剪贴板不可用则忽略 */
    }
  }

  const reveal = (p: string): void => {
    void window.shy.revealSessionFile(sessionId, p)
  }

  const hideFile = (p: string): void => {
    setHiddenFiles((cur) => {
      const next = new Set(cur)
      next.add(p)
      return next
    })
  }

  if (!open) return null

  const visibleFiles = files.filter((f) => !hiddenFiles.has(f.path))
  const fileGrouped = groupFiles(visibleFiles)

  return (
    <aside className="session-panel" role="complementary" aria-label="会话侧栏">
      <header className="session-panel-head">
        <div className="seg" role="tablist" aria-label="侧栏视图">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tasks'}
            className={`seg-btn${tab === 'tasks' ? ' active' : ''}`}
            onClick={() => setTab('tasks')}
          >
            任务 {tasks.length > 0 ? <span className="badge">{tasks.length}</span> : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'files'}
            className={`seg-btn${tab === 'files' ? ' active' : ''}`}
            onClick={() => setTab('files')}
          >
            文件 {files.length > 0 ? <span className="badge">{files.length}</span> : null}
          </button>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="关闭侧栏"
          title="关闭侧栏"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {tab === 'tasks' ? (
        <div className="task-list" role="list">
          {tasks.length === 0 ? (
            <div className="panel-empty">
              <div className="panel-empty-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6h11M9 12h11M9 18h7" />
                  <path d="M5 6h.01M5 12h.01M5 18h.01" />
                </svg>
              </div>
              <p className="muted">
                暂无任务。
                <br />
                目标模式或 Agent 动态任务会出现在这里。
              </p>
            </div>
          ) : (
            tasks.map((t) => (
              <div
                key={t.id}
                className={`task-item${t.done ? ' done' : ''}${recentTask === t.id ? ' recent' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="task-check"
                  aria-pressed={t.done}
                  aria-label={
                    t.checklistItem ? '由验收命令自动更新' : t.done ? '标记为未完成' : '标记为完成'
                  }
                  title={
                    t.checklistItem ? '由验收命令自动更新' : t.done ? '标记为未完成' : '标记为完成'
                  }
                  disabled={t.checklistItem}
                  onClick={() => void toggleTask(t)}
                >
                  {t.done ? '✓' : ''}
                </button>
                <div className="task-body">
                  <div className="task-title-row">
                    <span className="task-title">{t.title}</span>
                    <span className={`chip chip-${t.source}`}>
                      {t.source === 'goal' ? '目标' : 'Agent'}
                    </span>
                  </div>
                  {t.check ? (
                    <p className="task-evidence" title={t.check}>
                      <code>验收：{t.check}</code>
                    </p>
                  ) : null}
                  {!t.done && t.evidence ? (
                    <p className="task-evidence" title={t.evidence}>
                      {truncateEvidence(t.evidence)}
                    </p>
                  ) : null}
                </div>
                {!t.checklistItem ? (
                  <button
                    type="button"
                    className="task-delete"
                    aria-label="删除任务"
                    title="删除任务"
                    onClick={() => setConfirmDelTask({ id: t.id, title: t.title, requestId: t.id })}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'files' ? (
        <div className="file-list" role="list">
          {fileGrouped.length === 0 ? (
            <div className="panel-empty">
              <div className="panel-empty-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                </svg>
              </div>
              <p className="muted">
                本次会话暂无文件操作。
                <br />
                Agent 读取 / 写入文件后会出现在这里。
              </p>
            </div>
          ) : (
            <>
              {hiddenFiles.size > 0 ? (
                <div className="file-tools">
                  <button
                    type="button"
                    className="ghost-btn"
                    onClick={() => setHiddenFiles(new Set())}
                  >
                    显示已隐藏（{hiddenFiles.size}）
                  </button>
                </div>
              ) : null}
              {fileGrouped.map((g) => (
                <div key={g.path} className="file-item" role="listitem">
                  <div className="file-icon" data-op={g.lastOp}>
                    {labelForOp(g.lastOp)}
                  </div>
                  <div className="file-body">
                    <div className="file-path" title={g.path}>
                      {g.path}
                    </div>
                    <div className="file-meta">
                      {g.count > 1 ? `${g.count} 次 · ` : ''}
                      最后 {labelForOp(g.lastOp)} · {new Date(g.lastAt).toLocaleTimeString()}
                    </div>
                  </div>
                  <div className="file-actions">
                    <button
                      type="button"
                      className={`ghost-btn${copiedPath === g.path ? ' copied' : ''}`}
                      onClick={() => void copyPath(g.path)}
                    >
                      {copiedPath === g.path ? '已复制' : '复制'}
                    </button>
                    <button type="button" className="ghost-btn" onClick={() => reveal(g.path)}>
                      打开
                    </button>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => hideFile(g.path)}
                      title="从视图移除（不删 DB 记录）"
                    >
                      隐藏
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {confirmDelTask ? (
        <ConfirmDialog
          action="删除任务"
          detail={`「${confirmDelTask.title}」将被删除。`}
          requestId={confirmDelTask.requestId}
          onResolve={(id, approved) => {
            setConfirmDelTask(null)
            if (approved && id === confirmDelTask.id) {
              void window.shy
                .deleteSessionTask({ sessionId, id })
                .then(() => fetchTasks().then(setTasks))
            }
          }}
        />
      ) : null}
    </aside>
  )
}

function labelForOp(op: string): string {
  if (op === 'read') return '读'
  if (op === 'write') return '写'
  if (op === 'delete') return '删'
  if (op === 'edit') return '改'
  if (op === 'copy') return '拷'
  if (op === 'move') return '移'
  return op
}

type FileGroup = { path: string; count: number; lastOp: string; lastAt: number }

function groupFiles(files: SessionFileRecord[]): FileGroup[] {
  const map = new Map<string, FileGroup>()
  for (const f of files) {
    const cur = map.get(f.path)
    if (!cur) {
      map.set(f.path, { path: f.path, count: 1, lastOp: f.op, lastAt: f.occurredAt })
    } else {
      cur.count += 1
      if (f.occurredAt > cur.lastAt) {
        cur.lastOp = f.op
        cur.lastAt = f.occurredAt
      }
    }
  }
  return [...map.values()].sort((a, b) => b.lastAt - a.lastAt)
}

// re-export for callers
export { PANEL_KEY }
