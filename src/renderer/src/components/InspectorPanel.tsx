/**
 * InspectorPanel — 未绑定会话右侧面板。
 * 两个 tab：会话详情 / 浏览器。任务与 diff 已从 UI 移除。
 */
import { useEffect, useState } from 'react'
import type { SessionDetail, SessionFileRecord } from '../../../shared/ipc'
import { BrowserPanel } from './chat/BrowserPanel'
import { timeAgo } from '../lib/time'
import {
  INSPECTOR_TABS,
  artifactFiles,
  normalizeInspectorTab,
  type InspectorTab
} from '../lib/projectBind'

type Props = {
  sessionId: string
}

const POLL_INTERVAL_MS = 5_000
const TAB_KEY = 'shy.inspectorTab'
const OPEN_KEY = 'shy.inspectorOpen'

const TAB_ICONS: Record<InspectorTab, React.JSX.Element> = {
  details: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M8 9h8M8 13h6" />
    </svg>
  ),
  browser: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
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
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [files, setFiles] = useState<SessionFileRecord[]>([])
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<InspectorTab>(readTab)
  const [panelOpen, setPanelOpen] = useState<boolean>(readPanelOpen)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const [session, fileList, settings] = await Promise.all([
          sessionId ? window.shy.getSession(sessionId).catch(() => null) : Promise.resolve(null),
          sessionId
            ? window.shy.listSessionFiles(sessionId).catch(() => [] as SessionFileRecord[])
            : Promise.resolve([] as SessionFileRecord[]),
          window.shy.getSettings().catch(() => null)
        ])
        if (!alive) return
        setDetail(session)
        setFiles(fileList)
        if (settings?.model) setModel(settings.model)
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
          {loading ? <div className="inspector-empty">加载中…</div> : null}
          {!loading ? (
            <div className="inspector-details">
              <dl className="inspector-meta">
                <div>
                  <dt>标题</dt>
                  <dd>{detail?.title || '未命名会话'}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{detail?.createdAt ? timeAgo(detail.createdAt) : '—'}</dd>
                </div>
                <div>
                  <dt>模型</dt>
                  <dd>{model || '—'}</dd>
                </div>
                <div>
                  <dt>消息数</dt>
                  <dd>{detail?.messages.length ?? 0}</dd>
                </div>
              </dl>
              <section className="inspector-artifacts">
                <h3>产物</h3>
                {artifacts.length === 0 ? (
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
                )}
              </section>
            </div>
          ) : null}
        </div>
      )}
    </aside>
  )
}
