import { useEffect, useState } from 'react'
import type { ModelSettings } from '../../../shared/ipc'

type Props = {
  open: boolean
  onClose: () => void
}

export function SettingsPanel({ open, onClose }: Props): React.JSX.Element | null {
  const [form, setForm] = useState<ModelSettings>({ baseURL: '', apiKey: '', model: '' })
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
        <h2>模型设置（OpenAI-compatible）</h2>
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
