import { useEffect, useState } from 'react'
import type { AgentLogFileSummary, ModelSettings } from '../../../shared/ipc'
import type { Theme } from '../lib/theme'

type Props = {
  theme: Theme
  onToggleTheme: () => void
}

/** 设置页：外观 / 模型连接 / 运行参数 / 运行日志 */
export function SettingsPanel({ theme, onToggleTheme }: Props): React.JSX.Element {
  const [form, setForm] = useState<ModelSettings>({
    baseURL: '',
    apiKey: '',
    model: '',
    stagnationRounds: 20,
    tokenBudget: 1_000_000_000,
    segmentSteps: 60,
    contextWindow: 1_000_000,
    compressThreshold: 60
  })
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [shyHome, setShyHome] = useState('')
  const [logs, setLogs] = useState<AgentLogFileSummary[]>([])
  const [selectedLog, setSelectedLog] = useState<string | null>(null)
  const [logContent, setLogContent] = useState('')
  const [logTruncated, setLogTruncated] = useState(false)
  const [logOffset, setLogOffset] = useState(0)

  const refreshLogs = async (): Promise<void> => {
    const rows = await window.shy.listAgentLogs()
    setLogs(rows)
  }

  useEffect(() => {
    let alive = true
    void window.shy.getSettings().then((s) => {
      if (!alive) return
      setForm(s)
      setShowKey(false)
    })
    void window.shy.getPaths().then((p) => {
      if (!alive) return
      setShyHome(p.shyHome)
    })
    void refreshLogs()
    return () => {
      alive = false
    }
  }, [])

  const onSave = async (): Promise<void> => {
    await window.shy.setSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const openLog = async (name: string, append = false): Promise<void> => {
    const offset = append ? logOffset : 0
    const res = await window.shy.readAgentLog({ name, offset, limit: 120_000 })
    setSelectedLog(name)
    setLogContent(append ? logContent + res.content : res.content)
    setLogTruncated(res.truncated)
    setLogOffset(offset + res.content.length)
  }

  return (
    <div className="main pane">
      <div className="pane-frame">
        <div className="pane-header">
          <h1>设置</h1>
          <p className="muted">
            外观、模型与运行日志。数据目录：{shyHome || '~/.shy'}
          </p>
        </div>

        <section className="settings-section" style={{ marginTop: 18 }}>
          <h3>外观</h3>
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="muted">主题</span>
            <div className="seg" role="group" aria-label="主题">
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'light'}
                className={`seg-btn${theme === 'light' ? ' active' : ''}`}
                onClick={() => {
                  if (theme !== 'light') onToggleTheme()
                }}
              >
                浅色
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === 'dark'}
                className={`seg-btn${theme === 'dark' ? ' active' : ''}`}
                onClick={() => {
                  if (theme !== 'dark') onToggleTheme()
                }}
              >
                深色
              </button>
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>模型连接</h3>
          <label>
            Base URL
            <input
              value={form.baseURL}
              onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
              placeholder="https://api.minimaxi.com/v1"
              spellCheck={false}
            />
          </label>
          <label>
            API Key
            <span className="input-wrap">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="sk-…"
                spellCheck={false}
              />
              <button
                type="button"
                className="input-append"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </span>
          </label>
          <label>
            Model
            <input
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="模型名"
              spellCheck={false}
            />
          </label>
        </section>

        <section className="settings-section">
          <h3>运行参数</h3>
          <label>
            停滞软暂停（轮）
            <input
              type="number"
              min={2}
              max={100}
              value={form.stagnationRounds ?? 20}
              onChange={(e) => setForm({ ...form, stagnationRounds: Number(e.target.value) || 20 })}
            />
          </label>
          <p className="muted">
            验收清单连续这么多轮没有新完成项时暂停问你，而不是硬掐断。有进展会自动清零。
          </p>
          <label>
            token 成本预算（0=不限）
            <input
              type="number"
              min={0}
              step={10000}
              value={form.tokenBudget ?? 0}
              onChange={(e) => setForm({ ...form, tokenBudget: Number(e.target.value) || 0 })}
            />
          </label>
          <p className="muted">
            目标模式成本上限：按每次模型调用的 usage（input+output）累加。触顶后暂停；点「继续」开启下一段同等窗口。
          </p>
          <label>
            单段步数（长跑）
            <input
              type="number"
              min={1}
              value={form.segmentSteps ?? 60}
              onChange={(e) => setForm({ ...form, segmentSteps: Number(e.target.value) || 60 })}
            />
          </label>
          <p className="muted">
            目标模式每段最多推进多少步后落盘并自动续段，支撑跨天长跑；进程重启后可从磁盘恢复。
          </p>
          <label>
            上下文窗口（tokens）
            <input
              type="number"
              min={1000}
              step={1000}
              value={form.contextWindow ?? 1000000}
              onChange={(e) =>
                setForm({ ...form, contextWindow: Number(e.target.value) || 1000000 })
              }
            />
          </label>
          <p className="muted">
            你的模型的上下文窗口大小。上下文水位超过 60% 时才压缩短期记忆，避免每段都白白调用压缩。
          </p>
        </section>

        <section className="settings-section settings-logs">
          <div className="settings-logs-head">
            <h3>运行日志</h3>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" onClick={() => void refreshLogs()}>
                刷新
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void window.shy.revealAgentLogsDir()}
              >
                打开日志目录
              </button>
            </div>
          </div>
          <p className="muted">L2：每次 LLM turn 与工具调用写入 ~/.shy/logs/agent/*.jsonl</p>
          {logs.length === 0 ? (
            <p className="settings-logs-empty">暂无运行日志。发起一次对话或目标运行后会出现在这里。</p>
          ) : (
            <div className="settings-logs-body">
              <ul className="settings-logs-list">
                {logs.map((f) => (
                  <li key={f.name}>
                    <button
                      type="button"
                      className={`settings-log-item${selectedLog === f.name ? ' active' : ''}`}
                      onClick={() => void openLog(f.name)}
                    >
                      <span className="settings-log-name">{f.name}</span>
                      <span className="settings-log-meta">
                        {(f.size / 1024).toFixed(1)} KB ·{' '}
                        {new Date(f.mtimeMs).toLocaleString('zh-CN')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="settings-log-detail">
                {selectedLog ? (
                  <>
                    <pre className="settings-log-pre">{logContent || '（空）'}</pre>
                    {logTruncated ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void openLog(selectedLog, true)}
                      >
                        加载更多
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">选择左侧日志查看内容。</p>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => void onSave()}>
            保存设置
          </button>
        </div>
        {saved ? <div className="toast">已保存到本地</div> : null}
      </div>
    </div>
  )
}
