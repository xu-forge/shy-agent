import { useEffect, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import { fileNameOf, shouldShowEditButton, viewerModeForKind } from '../../lib/materialLibrary'
import { materialEditors } from './registry'

type Props = {
  projectId: string
  item: MaterialItem
  onClose: () => void
}

export function MaterialViewer({ projectId, item, onClose }: Props): React.JSX.Element {
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const mode = viewerModeForKind(item.kind)
  const showEdit = shouldShowEditButton(materialEditors)

  useEffect(() => {
    if (mode !== 'preview') {
      setPreviewUrl('')
      setPreviewError('')
      return
    }
    let alive = true
    setPreviewUrl('')
    setPreviewError('')
    void window.shy
      .projectFileReadDataUrl({ projectId, relativePath: item.relativePath })
      .then((r) => {
        if (!alive) return
        if (r.ok) setPreviewUrl(r.dataUrl)
        else setPreviewError('无法预览该图片')
      })
      .catch(() => {
        if (alive) setPreviewError('无法预览该图片')
      })
    return () => {
      alive = false
    }
  }, [mode, projectId, item.relativePath])

  const openInSystem = (): void => {
    void window.shy.projectReveal({ projectId, absPath: item.absPath })
  }

  return (
    <div className="material-viewer" role="dialog" aria-label="素材查看器">
      <div className="material-viewer-bar">
        <strong>{fileNameOf(item)}</strong>
        <div className="material-viewer-actions">
          {mode === 'system' ? (
            <button type="button" className="btn btn-outline" onClick={openInSystem}>
              用系统打开
            </button>
          ) : null}
          {showEdit ? (
            <button type="button" className="btn btn-outline">
              编辑
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="material-viewer-body">
        {mode === 'preview' ? (
          previewError ? (
            <p className="history-empty">{previewError}</p>
          ) : previewUrl ? (
            <img className="material-preview" src={previewUrl} alt={fileNameOf(item)} />
          ) : (
            <p className="history-empty">加载预览…</p>
          )
        ) : (
          <p className="history-empty">此类型不支持内嵌预览，请用系统打开。</p>
        )}
      </div>
    </div>
  )
}
