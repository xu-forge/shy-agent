import { useEffect, useRef, useState } from 'react'

type Props = {
  sessionId: string
}

export function OpenWithMenu({ sessionId }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (ev: PointerEvent): void => {
      if (!rootRef.current?.contains(ev.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const reveal = async (): Promise<void> => {
    setOpen(false)
    try {
      const result = await window.shy.dockOpenRoot(sessionId)
      if (!result.ok) {
        setError('无法在访达中打开工作区')
        return
      }
      setError('')
    } catch {
      setError('无法在访达中打开工作区')
    }
  }

  return (
    <div className="dock-open-with" ref={rootRef}>
      <button
        type="button"
        className="dock-open-with-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        title={error || '打开方式'}
        onClick={() => setOpen((v) => !v)}
      >
        打开方式
        <span className="dock-open-with-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open ? (
        <div className="dock-open-with-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => void reveal()}>
            在访达中显示
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="dock-open-error" role="status">
          {error}
        </div>
      ) : null}
    </div>
  )
}
