import { useEffect, useState } from 'react'
import type { McpConfigFile, McpServerEntry, McpServerStatus } from '../../../shared/ipc'
import { Switch } from './ui'

type Draft = {
  key: string
  id: string
  command: string
  argsText: string
  envRows: Array<{ key: string; value: string }>
  enabled: boolean
}

function entryToDraft(id: string, entry: McpServerEntry): Draft {
  const envRows = Object.entries(entry.env).map(([k, v]) => ({ key: k, value: v }))
  if (envRows.length === 0) envRows.push({ key: '', value: '' })
  return {
    key: id,
    id,
    command: entry.command,
    argsText: entry.args.join('\n'),
    envRows,
    enabled: entry.enabled
  }
}

function draftsToConfig(drafts: Draft[]): McpConfigFile {
  const mcpServers: Record<string, McpServerEntry> = {}
  for (const d of drafts) {
    const id = d.id.trim()
    if (!id) continue
    const env: Record<string, string> = {}
    for (const row of d.envRows) {
      const k = row.key.trim()
      if (!k) continue
      env[k] = row.value
    }
    mcpServers[id] = {
      command: d.command.trim(),
      args: d.argsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      env,
      enabled: d.enabled
    }
  }
  return { mcpServers }
}

function statusLabel(row: McpServerStatus | undefined, enabled: boolean): { text: string; kind: string } {
  if (!enabled) return { text: '已禁用', kind: 'disabled' }
  if (!row) return { text: '未保存', kind: 'idle' }
  if (row.state === 'connected') {
    const n = row.tools.length
    return { text: n > 0 ? `已连接 · ${n} 个工具` : '已连接', kind: 'ok' }
  }
  if (row.state === 'connecting') return { text: '连接中…', kind: 'idle' }
  if (row.state === 'invalid') return { text: row.error || '配置无效', kind: 'err' }
  if (row.state === 'error') return { text: row.error || '连接失败', kind: 'err' }
  if (row.state === 'disabled') return { text: '已禁用', kind: 'disabled' }
  return { text: row.state, kind: 'idle' }
}

let draftSeq = 0

export function McpSettingsPanel(): React.JSX.Element {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [status, setStatus] = useState<McpServerStatus[]>([])
  const [showEnv, setShowEnv] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [configPath, setConfigPath] = useState('~/.shy/config/mcp.json')

  const load = async (): Promise<void> => {
    const [cfg, st, paths] = await Promise.all([
      window.shy.getMcpConfig(),
      window.shy.getMcpStatus(),
      window.shy.getPaths()
    ])
    const next = Object.entries(cfg.mcpServers).map(([id, entry]) => entryToDraft(id, entry))
    setDrafts(next)
    setStatus(st)
    setConfigPath(`${paths.shyHome}/config/mcp.json`)
  }

  useEffect(() => {
    let alive = true
    void load().then(() => {
      if (!alive) return
    })
    return () => {
      alive = false
    }
  }, [])

  const patch = (key: string, next: Partial<Draft>): void => {
    setDrafts((rows) => rows.map((r) => (r.key === key ? { ...r, ...next } : r)))
  }

  const onSave = async (): Promise<void> => {
    setSaving(true)
    setError('')
    try {
      const result = await window.shy.setMcpConfig(draftsToConfig(drafts))
      setDrafts(Object.entries(result.config.mcpServers).map(([id, entry]) => entryToDraft(id, entry)))
      setStatus(result.status)
      setSaved(true)
      setTimeout(() => setSaved(false), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const statusById = new Map(status.map((s) => [s.id, s]))

  return (
    <div className="settings-body mcp-settings">
      <section className="settings-section">
        <h3>stdio 服务器</h3>
        <p className="settings-section-hint">
          配置写入 mcp.json。仅支持 command / args / env；保存后自动重连，无需重启。
        </p>
        {drafts.length === 0 ? (
          <div className="mcp-empty">
            尚未配置 MCP。可添加 stdio server（例如 MiniMax Token Plan：
            <code>uvx minimax-coding-plan-mcp -y</code>）。
          </div>
        ) : null}
        {drafts.map((d) => {
          const st = statusLabel(statusById.get(d.id.trim()), d.enabled)
          return (
            <article key={d.key} className="mcp-card">
              <header className="mcp-card-head">
                <input
                  className="field-input mcp-id"
                  value={d.id}
                  onChange={(e) => patch(d.key, { id: e.target.value })}
                  placeholder="Server id（如 MiniMax）"
                  spellCheck={false}
                />
                <span className={`mcp-status mcp-status-${st.kind}`} title={st.text}>
                  {st.text}
                </span>
                <Switch
                  size="s"
                  checked={d.enabled}
                  onChange={(enabled) => patch(d.key, { enabled })}
                  label="启用"
                />
                <button
                  type="button"
                  className="btn mcp-remove"
                  onClick={() => setDrafts((rows) => rows.filter((r) => r.key !== d.key))}
                >
                  删除
                </button>
              </header>
              <label className="field">
                <span className="field-label">command</span>
                <input
                  className="field-input"
                  value={d.command}
                  onChange={(e) => patch(d.key, { command: e.target.value })}
                  placeholder="uvx 或绝对路径"
                  spellCheck={false}
                />
              </label>
              <label className="field field-top">
                <span className="field-label">args</span>
                <textarea
                  className="field-input mcp-textarea"
                  value={d.argsText}
                  onChange={(e) => patch(d.key, { argsText: e.target.value })}
                  placeholder={'每行一个参数，例如\nminimax-coding-plan-mcp\n-y'}
                  spellCheck={false}
                  rows={3}
                />
              </label>
              <div className="field field-top">
                <span className="field-label">env</span>
                <div className="mcp-env">
                  {d.envRows.map((row, i) => (
                    <div key={i} className="mcp-env-row">
                      <input
                        className="field-input"
                        value={row.key}
                        onChange={(e) => {
                          const envRows = d.envRows.map((r, j) =>
                            j === i ? { ...r, key: e.target.value } : r
                          )
                          patch(d.key, { envRows })
                        }}
                        placeholder="KEY"
                        spellCheck={false}
                      />
                      <input
                        className="field-input"
                        type={showEnv ? 'text' : 'password'}
                        value={row.value}
                        onChange={(e) => {
                          const envRows = d.envRows.map((r, j) =>
                            j === i ? { ...r, value: e.target.value } : r
                          )
                          patch(d.key, { envRows })
                        }}
                        placeholder="value"
                        spellCheck={false}
                        autoComplete="off"
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    onClick={() => patch(d.key, { envRows: [...d.envRows, { key: '', value: '' }] })}
                  >
                    添加变量
                  </button>
                </div>
              </div>
            </article>
          )
        })}
        <button
          type="button"
          className="btn"
          onClick={() => {
            draftSeq += 1
            setDrafts((rows) => [
              ...rows,
              entryToDraft(rows.length === 0 ? 'MiniMax' : `server-${draftSeq}`, {
                command: 'uvx',
                args: ['minimax-coding-plan-mcp', '-y'],
                env: { MINIMAX_API_KEY: '', MINIMAX_API_HOST: 'https://api.minimaxi.com' },
                enabled: true
              })
            ])
          }}
        >
          添加 server
        </button>
      </section>

      <div className="settings-save-row">
        <span className="settings-save-path">{configPath}</span>
        <div className="mcp-save-actions">
          <Switch size="s" checked={showEnv} onChange={setShowEnv} label="显示 env" />
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void onSave()}>
            {saving ? '保存并重连…' : '保存 MCP'}
          </button>
        </div>
      </div>
      {saved ? <div className="toast">已保存并重连</div> : null}
      {error ? <div className="toast toast-error">{error}</div> : null}
    </div>
  )
}
