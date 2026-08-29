import { useEffect, useState } from 'react'
import { Input, Modal } from '../ui'
import { isValidMaterialName } from '../../lib/materialLibrary'

type Props = {
  title: string
  initialName: string
  error?: string
  onCancel: () => void
  onSubmit: (name: string) => void
  onClearError?: () => void
}

export function RenameMaterialDialog({
  title,
  initialName,
  error,
  onCancel,
  onSubmit,
  onClearError
}: Props): React.JSX.Element {
  const [name, setName] = useState(initialName)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    setName(initialName)
    setLocalError('')
  }, [initialName])

  const submit = (): void => {
    const next = name.trim()
    if (!isValidMaterialName(next)) {
      setLocalError('名称不能为空，且不能包含路径分隔符')
      return
    }
    onSubmit(next)
  }

  const message = localError || error || ''

  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn btn-primary" onClick={submit}>
            重命名
          </button>
        </>
      }
    >
      <Input
        autoFocus
        value={name}
        invalid={Boolean(message)}
        style={{ width: '100%' }}
        onChange={(e) => {
          setName(e.target.value)
          setLocalError('')
          onClearError?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      {message ? <p className="muted">{message}</p> : null}
    </Modal>
  )
}
