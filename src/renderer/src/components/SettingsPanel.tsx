import { useEffect, useState } from 'react'
import type { ModelSettings } from '../../../shared/ipc'

type Props = {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: Props): React.JSX.Element | null {
  const [form, setForm] = useState<ModelSettings>({
    baseURL: '',
    apiKey: '',
    model: '',
    stagnationRounds: 20,
    hardRoundCap: 0
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    void window.myAgent.getSettings().then(setForm)
  }, [open])

  if (!open) return null

  const onSave = async (): Promise<void> => {
    await window.myAgent.setSettings(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>模型设置</h2>
        <p className="muted">OpenAI-compatible 接口，本地保存。</p>
        <label>
          Base URL
          <input
            value={form.baseURL}
            onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
            placeholder="https://api.minimaxi.com/v1"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          />
        </label>
        <label>
          Model
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="模型名"
          />
        </label>
        <label>
          停滞软暂停（轮）
          <input
            type="number"
            min={2}
            max={100}
            value={form.stagnationRounds ?? 20}
            onChange={(e) =>
              setForm({ ...form, stagnationRounds: Number(e.target.value) || 20 })
            }
          />
        </label>
        <p className="muted" style={{ marginTop: -6 }}>
          验收清单连续这么多轮没有新完成项时暂停问你，而不是硬掐断。有进展会自动清零。
        </p>
        <label>
          LangGraph 递归上限（可选）
          <input
            type="number"
            min={0}
            placeholder="目标默认 500 / 交互 80"
            value={form.recursionLimit ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                recursionLimit: e.target.value ? Number(e.target.value) : undefined
              })
            }
          />
        </label>
        <label>
          绝对轮次上限（0=不限）
          <input
            type="number"
            min={0}
            value={form.hardRoundCap ?? 0}
            onChange={(e) =>
              setForm({ ...form, hardRoundCap: Number(e.target.value) || 0 })
            }
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button type="button" className="primary" onClick={() => void onSave()}>
            保存
          </button>
        </div>
        {saved ? <div className="hint">已保存到本地</div> : null}
      </div>
    </div>
  )
}
