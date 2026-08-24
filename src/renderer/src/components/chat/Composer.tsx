import { forwardRef, type KeyboardEvent } from 'react'
import type { ModeKey } from '../ModeToggle'
import { ProjectPicker } from '../ProjectPicker'

type Props = {
  mode: ModeKey
  draft: string
  verifyCommand: string
  busy: boolean
  projectId: string | null
  projectPickerDisabled: boolean
  onDraftChange: (v: string) => void
  onVerifyChange: (v: string) => void
  onProjectChange: (projectId: string | null) => void
  onProjectsChanged?: () => void
  onSend: () => void
}

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
  {
    mode,
    draft,
    verifyCommand,
    busy,
    projectId,
    projectPickerDisabled,
    onDraftChange,
    onVerifyChange,
    onProjectChange,
    onProjectsChanged,
    onSend
  },
  ref
) {
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void onSend()
    }
  }
  return (
    <div className="composer-shell">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder={mode === 'goal' ? '描述你的目标…' : '询问、指派任务，或粘贴上下文…'}
        aria-label="消息输入"
        rows={1}
        onKeyDown={onKeyDown}
        disabled={busy}
      />
      {mode === 'goal' && (
        <input
          className="verify-command-input"
          value={verifyCommand}
          onChange={(e) => onVerifyChange(e.target.value)}
          placeholder="总验收命令，例如 npm test"
          aria-label="总验收命令"
          disabled={busy}
        />
      )}
      <div className="composer-bar">
        <ProjectPicker
          value={projectId}
          disabled={projectPickerDisabled}
          onChange={onProjectChange}
          onProjectsChanged={onProjectsChanged}
        />
        <button type="button" className="btn-send" onClick={() => void onSend()} disabled={busy}>
          发送
        </button>
      </div>
    </div>
  )
})
