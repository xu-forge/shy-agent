/**
 * InspectorPanel — 会话右侧面板。
 * 两个 tab：任务列表 / 产物列表。
 */
import { useCallback, useEffect, useState } from 'react'
import type { SessionFileRecord, SessionTaskRecord } from '../../../shared/ipc'
import { truncateEvidence } from './goalUi'
import {
  INSPECTOR_TABS,
  artifactFiles,
  normalizeInspectorTab,
  type InspectorTab
} from '../lib/projectBind'

type Props = {
  sessionId: string
}

type PanelTask = Pick<SessionTaskRecord, 'id' | 'title' | 'done' | 'evidence' | 'source'> & {
  check?: string
  checklistItem?: boolean
}

const POLL_INTERVAL_MS = 5_000
const TAB_KEY = 'shy.inspectorTab'
const OPEN_KEY = 'shy.inspectorOpen'

const TAB_ICONS: Record<InspectorTab, React.JSX.Element> = {
  tasks: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h7" />
      <path d="M5 6h.01M5 12h.01M5 18h.01" />
    </svg>
  ),
  artifacts: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    </svg>
  )
}

function readTab(): InspectorTab {
  return normalizeInspectorTab(localStorage.getItem(TAB_KEY))
}

function readPanelOpen(): boolean {
  return localStorage.getItem(OPEN_KEY) !== 'false'
}

export function InspectorPanel({ sessionId }: Props): React.JSX.Element {
  const [tasks, setTasks] = useState<PanelTask[]>([])
  const [files, setFiles] = useState<SessionFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<InspectorTab>(readTab)
  const [panelOpen, setPanelOpen] = useState<boolean>(readPanelOpen)
  const [recentTask, setRecentTask] = useState<string | null>(null)

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
    const load = async (): Promise<void> => {
      try {
        const [nextTasks, nextFiles] = await Promise.all([fetchTasks(), fetchFiles()])
        if (!alive) return
        setTasks(nextTasks)
        setFiles(nextFiles)
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
  }, [fetchTasks, fetchFiles])

  useEffect(() => {
    return window.shy.onEvent((payload) => {
      const ev = payload as { type?: string; sessionId?: string; id?: string }
      if (ev.sessionId !== sessionId) return
      if (ev.type === 'task' || ev.type === 'goal') {
        void fetchTasks().then(setTasks)
        if (ev.id) {
          setRecentTask(ev.id)
          setTimeout(() => setRecentTask((cur) => (cur === ev.id ? null : cur)), 1500)
        }
      }
      void fetchFiles().then(setFiles)
    })
  }, [sessionId, fetchTasks, fetchFiles])

  const toggleTask = async (task: PanelTask): Promise<void> => {
    if (task.checklistItem) return
    await window.shy.updateSessionTask({
      sessionId,
      id: task.id,
      done: !task.done
    })
    void fetchTasks().then(setTasks)
  }

  const setOpenPersisted = (next: boolean): void => {
    setPanelOpen(next)
    try {
      localStorage.setItem(OPEN_KEY, String(next))
    } catch {
      /* ignore */
    }
  }

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

  const artifacts = artifactFiles(files)

  return (
    <aside className="inspector-panel">
      <div className="inspector-tabs" role="tablist" aria-label="功能面板">
        {INSPECTOR_TABS.map((t) => (
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
            {TAB_ICONS[t.key]}
            <span>{t.label}</span>
            {t.key === 'tasks' && tasks.length > 0 ? (
              <span className="inspector-count">{tasks.length}</span>
            ) : null}
            {t.key === 'artifacts' && artifacts.length > 0 ? (
              <span className="inspector-count">{artifacts.length}</span>
            ) : null}
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

      <div className="inspector-body">
        {loading ? <div className="inspector-empty">加载中…</div> : null}
        {!loading && tab === 'tasks' ? (
          tasks.length === 0 ? (
            <div className="inspector-empty">
              <div className="inspector-empty-title">暂无任务</div>
              <div className="inspector-empty-hint">目标模式或 Agent 动态任务会出现在这里</div>
            </div>
          ) : (
            <ul className="inspector-list">
              {tasks.map((t) => (
                <li
                  key={t.id}
                  className={`inspector-item task-${t.source}${t.done ? ' done' : ''}${recentTask === t.id ? ' recent' : ''}`}
                >
                  <button
                    type="button"
                    className="inspector-item-check"
                    aria-pressed={t.done}
                    aria-label={
                      t.checklistItem
                        ? '由验收命令自动更新'
                        : t.done
                          ? '标记为未完成'
                          : '标记为完成'
                    }
                    disabled={t.checklistItem}
                    onClick={() => void toggleTask(t)}
                  >
                    {t.done ? '✓' : ''}
                  </button>
                  <div className="inspector-item-body">
                    <div className="inspector-item-title">
                      {t.title}
                      <span className="inspector-item-source" data-source={t.source}>
                        {t.source === 'goal' ? '步骤' : 'Agent'}
                      </span>
                    </div>
                    {t.check ? (
                      <p className="inspector-item-evidence">验收：{t.check}</p>
                    ) : null}
                    {!t.done && t.evidence ? (
                      <p className="inspector-item-evidence">{truncateEvidence(t.evidence)}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {!loading && tab === 'artifacts' ? (
          artifacts.length === 0 ? (
            <div className="inspector-empty">
              <div className="inspector-empty-title">暂无产物</div>
              <div className="inspector-empty-hint">Agent 写入的文件会出现在这里</div>
            </div>
          ) : (
            <ul className="env-file-list">
              {artifacts.map((f) => (
                <li key={`${f.id}-${f.path}`}>
                  <button
                    type="button"
                    className="env-file"
                    title="在访达中显示"
                    onClick={() => void window.shy.revealSessionFile(sessionId, f.path)}
                  >
                    <span className="file-op">写</span>
                    <span className="file-path">{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </aside>
  )
}
