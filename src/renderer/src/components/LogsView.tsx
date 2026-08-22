import { useEffect, useState } from 'react'
import type { AgentLogFileSummary } from '../../../shared/ipc'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString()
}

/** 运行日志：列出 Agent 日志文件，选中后查看内容。 */
export function LogsView(): React.JSX.Element {
  const [files, setFiles] = useState<AgentLogFileSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    window.shy
      .listAgentLogs()
      .then((list) => {
        if (!alive) return
        setFiles(list)
        if (list[0]) {
          setSelected(list[0].name)
        }
        setLoading(false)
      })
      .catch(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!selected) {
      setContent('')
      return
    }
    let alive = true
    setContent('加载中…')
    window.shy
      .readAgentLog({ name: selected, limit: 2000 })
      .then((r) => {
        if (!alive) return
        setContent(r.content)
        setTruncated(r.truncated)
      })
      .catch((e) => {
        if (alive) setContent(`读取失败：${String(e)}`)
      })
    return () => {
      alive = false
    }
  }, [selected])

  return (
    <div className="logs-view">
      <div className="logs-sidebar">
        {loading ? (
          <div className="logs-empty">加载中…</div>
        ) : files.length === 0 ? (
          <div className="logs-empty">暂无运行日志</div>
        ) : (
          files.map((f) => (
            <button
              key={f.path}
              type="button"
              className={`log-item${f.name === selected ? ' active' : ''}`}
              onClick={() => setSelected(f.name)}
            >
              <span className="log-item-name">{f.name}</span>
              <span className="log-item-meta">
                {fmtSize(f.size)} · {fmtTime(f.mtimeMs)}
              </span>
            </button>
          ))
        )}
      </div>
      <div className="logs-content">
        {selected ? (
          <pre className="logs-pre">
            {content}
            {truncated ? '\n…（内容已截断，仅显示前 2000 行）' : ''}
          </pre>
        ) : (
          <div className="logs-empty">选择一个日志文件查看</div>
        )}
      </div>
    </div>
  )
}
