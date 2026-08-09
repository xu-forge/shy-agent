type Props = {
  action: string
  detail: string
  requestId: string
  onResolve: (requestId: string, approved: boolean) => void
}

export function ConfirmDialog({ action, detail, requestId, onResolve }: Props): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>需要确认的高危操作</h2>
        <p>
          <strong>{action}</strong>
        </p>
        <pre className="detail">{detail}</pre>
        <div className="modal-actions">
          <button type="button" onClick={() => onResolve(requestId, false)}>
            拒绝
          </button>
          <button type="button" className="danger" onClick={() => onResolve(requestId, true)}>
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
