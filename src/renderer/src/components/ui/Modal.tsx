import { useEffect, type ReactNode } from 'react'

type Props = {
  title: ReactNode
  /** 标题下的说明文字 */
  subtitle?: ReactNode
  children: ReactNode
  /** 底部操作区（按钮排） */
  footer?: ReactNode
  onClose: () => void
  /** 点击遮罩是否关闭，默认 true；危险确认场景传 false */
  closeOnBackdrop?: boolean
  /** 危险确认样式（标题区带警示图标） */
  danger?: boolean
  width?: number
  'aria-label'?: string
}

/** 统一弹窗壳：遮罩 + Esc 关闭 + 标题区 + 滚动内容区 + 底部操作区 */
export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  closeOnBackdrop = true,
  danger,
  width,
  'aria-label': ariaLabel
}: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`ui-modal${danger ? ' ui-modal-danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}
      >
        <header className="ui-modal-head">
          {danger ? (
            <span className="ui-modal-warn" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 4 2.8 20h18.4L12 4Z" />
                <path d="M12 10v4.5M12 17.5h.01" />
              </svg>
            </span>
          ) : null}
          <div className="ui-modal-titles">
            <h2>{title}</h2>
            {subtitle ? <p className="ui-modal-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="ui-modal-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="ui-modal-body">{children}</div>
        {footer ? <footer className="ui-modal-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}
