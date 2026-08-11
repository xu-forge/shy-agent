import { useEffect } from 'react'

type Props = {
  action: string
  detail: string
  requestId: string
  onResolve: (requestId: string, approved: boolean) => void
}

export function ConfirmDialog({ action, detail, requestId, onResolve }: Props): React.JSX.Element {
  // Esc = 拒绝
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onResolve(requestId, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestId, onResolve])

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="高危操作确认">
        <div className="confirm-head">
          <div className="confirm-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 4 2.8 20h18.4L12 4Z" />
              <path d="M12 10v4.5M12 17.5h.01" />
            </svg>
          </div>
          <div>
            <h2>需要确认的高危操作</h2>
            <p className="muted">该操作将由 Agent 在本机执行，请确认内容。</p>
          </div>
        </div>
        <div className="confirm-action">
          <span className="chip chip-danger">操作</span>
          <strong>{action}</strong>
        </div>
        <pre className="detail">{detail}</pre>
        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onResolve(requestId, false)}
          >
            拒绝
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => onResolve(requestId, true)}
          >
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
