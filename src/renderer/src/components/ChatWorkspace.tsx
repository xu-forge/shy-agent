import { useState } from 'react'
import { ModeToggle, type ModeKey } from './ModeToggle'

type Props = {
  ipcOk: boolean | null
}

export function ChatWorkspace({ ipcOk }: Props): React.JSX.Element {
  const [mode, setMode] = useState<ModeKey>('interactive')
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState('')

  const onSend = (): void => {
    setHint('尚未接通模型')
  }

  return (
    <div className="main">
      <div className="topbar">
        <ModeToggle mode={mode} onChange={setMode} />
        <div className={`status${ipcOk ? ' ok' : ''}`}>
          {ipcOk === null ? 'IPC 检查中…' : ipcOk ? 'IPC 正常' : 'IPC 异常'}
        </div>
      </div>
      <div className="workspace">
        <div className="ready-copy">
          <h1>my-agent 已就绪</h1>
          <p>
            Codex
            风格工作台壳已启动。对话、记忆、技能与本机工具将在后续能力中接入。当前输入框可见，但不会发起真实模型请求。
          </p>
        </div>
        <div className="thread">空对话区 · 工具轨迹将以内联方式显示（示意）</div>
        <div className="composer">
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              if (hint) setHint('')
            }}
            placeholder={mode === 'goal' ? '描述目标…' : '输入消息…'}
            aria-label="消息输入"
          />
          <button type="button" onClick={onSend} title="尚未接通模型">
            发送
          </button>
        </div>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
    </div>
  )
}
