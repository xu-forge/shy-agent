import { useEffect, useState } from 'react'
import type { ModelSettings } from '../../../shared/ipc'
import type { Theme } from '../lib/theme'

type Props = {
  theme: Theme
  onToggleTheme: () => void
}

/** 常规设置（设置弹窗内容区）：模型接入 / 运行参数 / 外观。日志在独立 tab。 */
export function SettingsPanel({ theme, onToggleTheme }: Props): React.JSX.Element {
  const [form, setForm] = useState<ModelSettings>({
    baseURL: '',
    apiKey: '',
    model: '',
    stagnationRounds: 20,
    tokenBudget: 1_000_000_000,
    segmentSteps: 60,
    contextWindow: 1_000_000,
    compressThreshold: 60,
    blockedAuditRounds: 3,
    enableGoalCompleteReport: true
  })
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [shyHome, setShyHome] = useState('')

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
    return () => {
      alive = false
    }
  }, [])

  const onSave = async (): Promise<void> => {
    await window.shy.setSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const num = (key: keyof ModelSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [key]: Number(e.target.value) || 0 })
  }

  return (
    <div className="settings-body">
      <section className="settings-section">
        <h3>模型接入</h3>
        <p className="settings-section-hint">接错就不工作：三个字段与服务商控制台一致。</p>
        <label className="field">
          <span className="field-label">Base URL</span>
          <input
            className="field-input"
            value={form.baseURL}
            onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
            placeholder="https://api.minimaxi.com/v1"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span className="field-label">API Key</span>
          <span className="input-wrap field-input">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder="sk-…"
              spellCheck={false}
              autoComplete="off"
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
        <label className="field">
          <span className="field-label">Model</span>
          <input
            className="field-input"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="模型名"
            spellCheck={false}
          />
        </label>
      </section>

      <section className="settings-section">
        <h3>运行参数</h3>
        <p className="settings-section-hint">调优项：保持默认也能正常跑，改前看一眼说明。</p>
        <label className="field">
          <span className="field-label">停滞软暂停（轮）</span>
          <input
            className="field-input num"
            type="number"
            min={2}
            max={100}
            value={form.stagnationRounds ?? 20}
            onChange={num('stagnationRounds')}
          />
        </label>
        <p className="field-hint">验收清单连续这么多轮没有新完成项时暂停问你，而不是硬掐断。</p>
        <label className="field">
          <span className="field-label">token 预算（0=不限）</span>
          <input
            className="field-input num"
            type="number"
            min={0}
            step={10000}
            value={form.tokenBudget ?? 0}
            onChange={num('tokenBudget')}
          />
        </label>
        <p className="field-hint">目标模式成本上限：按每次调用 usage 累加，触顶后暂停。</p>
        <label className="field">
          <span className="field-label">单段步数</span>
          <input
            className="field-input num"
            type="number"
            min={1}
            value={form.segmentSteps ?? 60}
            onChange={num('segmentSteps')}
          />
        </label>
        <p className="field-hint">每段最多推进多少步后落盘并自动续段，支撑跨天长跑。</p>
        <label className="field">
          <span className="field-label">上下文窗口（tokens）</span>
          <input
            className="field-input num"
            type="number"
            min={1000}
            step={1000}
            value={form.contextWindow ?? 1_000_000}
            onChange={num('contextWindow')}
          />
        </label>
        <p className="field-hint">水位超过阈值% 时压缩短期记忆，避免每段白白压缩一次。</p>
        <label className="field">
          <span className="field-label">压缩阈值（%）</span>
          <input
            className="field-input num"
            type="number"
            min={10}
            max={95}
            value={form.compressThreshold ?? 60}
            onChange={num('compressThreshold')}
          />
        </label>
        <label className="field">
          <span className="field-label">Blocked 审计（轮）</span>
          <input
            className="field-input num"
            type="number"
            min={1}
            max={10}
            value={form.blockedAuditRounds ?? 3}
            onChange={num('blockedAuditRounds')}
          />
        </label>
        <p className="field-hint">LLM 判定「同一阻塞条件重复」达该轮数后强制暂停等你介入。</p>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={form.autoApproveTools ?? false}
            onChange={(e) => setForm({ ...form, autoApproveTools: e.target.checked })}
          />
            完全访问（工具不再逐条确认）
          </label>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={form.enableGoalCompleteReport ?? true}
            onChange={(e) => setForm({ ...form, enableGoalCompleteReport: e.target.checked })}
          />
            完成时报告 token 用量 / 轮数 / 时长
          </label>
      </section>

      <section className="settings-section">
        <h3>外观</h3>
        <div className="field">
          <span className="field-label">主题</span>
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

      <div className="settings-save-row">
        <span className="settings-save-path">数据目录 {shyHome || '~/.shy'}</span>
        <button type="button" className="btn btn-primary" onClick={() => void onSave()}>
          保存设置
        </button>
      </div>
      {saved ? <div className="toast">已保存到本地</div> : null}
    </div>
  )
}
