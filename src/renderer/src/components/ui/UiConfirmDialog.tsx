import { Modal } from './Modal'

type Props = {
  title: string
  detail: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm: () => void
}

/** 高危确认：明示路径/后果，确认按钮为危险样式 */
export function UiConfirmDialog({
  title,
  detail,
  confirmLabel = '删除',
  onCancel,
  onConfirm
}: Props): React.JSX.Element {
  return (
    <Modal
      title={title}
      danger
      closeOnBackdrop={false}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        </>
      }
    >
      <pre className="detail">{detail}</pre>
    </Modal>
  )
}
