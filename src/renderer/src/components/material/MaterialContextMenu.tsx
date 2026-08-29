import { useEffect, useRef } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'

export type FileMenuTarget = { kind: 'file'; item: MaterialItem }
export type GroupMenuTarget = {
  kind: 'group'
  path: string
  name: string
  absPath: string
}
export type MaterialMenuTarget = FileMenuTarget | GroupMenuTarget

type Props = {
  x: number
  y: number
  target: MaterialMenuTarget
  onRename: () => void
  onReveal?: () => void
  onOpenSystem?: () => void
  onDelete: () => void
  onClose: () => void
}

export function MaterialContextMenu({
  x,
  y,
  target,
  onRename,
  onReveal,
  onOpenSystem,
  onDelete,
  onClose
}: Props): React.JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 200)
  const top = Math.min(y, window.innerHeight - 200)

  return (
    <div
      ref={ref}
      className="material-context-menu"
      role="menu"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onRename}>
        重命名
      </button>
      {target.kind === 'file' ? (
        <>
          <button type="button" role="menuitem" onClick={onReveal}>
            在目录中显示
          </button>
          <button type="button" role="menuitem" onClick={onOpenSystem}>
            用系统打开
          </button>
        </>
      ) : null}
      <button type="button" role="menuitem" className="is-danger" onClick={onDelete}>
        删除
      </button>
    </div>
  )
}
