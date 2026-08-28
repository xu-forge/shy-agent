import { useEffect, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import { extOf, fileNameOf, isInlineDoc, materialSourceUrl } from '../../lib/materialLibrary'
import { MarkdownBody } from '../MarkdownBody'

type Props = {
  projectId: string
  item: MaterialItem
  onClose: () => void
}

export function Lightbox({ projectId, item, onClose }: Props): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const ext = extOf(item)
  const src = materialSourceUrl(projectId, item.absPath)

  useEffect(() => {
    setFailed(false)
    setText(null)
  }, [item.id, item.mtimeMs])

  useEffect(() => {
    if (item.kind !== 'doc' || (ext !== 'md' && ext !== 'txt')) return
    let alive = true
    void window.shy
      .projectFileRead({ projectId, relativePath: item.relativePath })
      .then((r) => {
        if (alive) setText(r.ok ? r.content : null)
      })
      .catch(() => {
        if (alive) setText(null)
      })
    return () => {
      alive = false
    }
  }, [projectId, item.relativePath, item.kind, ext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const openInSystem = (): void => {
    void window.shy.projectFileOpen({ projectId, absPath: item.absPath })
  }

  const body = (() => {
    if (item.kind === 'image') {
      return failed ? null : (
        <img
          className="lightbox-media"
          src={src}
          alt={fileNameOf(item)}
          draggable={false}
          onError={() => setFailed(true)}
        />
      )
    }
    if (item.kind === 'video') {
      return failed ? null : (
        <video
          className="lightbox-media"
          src={src}
          controls
          autoPlay
          onError={() => setFailed(true)}
        />
      )
    }
    if (item.kind === 'audio') {
      return (
        <div className="lightbox-audio">
          <p>{fileNameOf(item)}</p>
          <audio src={src} controls autoPlay />
        </div>
      )
    }
    if (item.kind === 'doc' && ext === 'pdf' && !failed) {
      return <iframe className="lightbox-frame" src={src} title={fileNameOf(item)} />
    }
    if (item.kind === 'doc' && isInlineDoc(item)) {
      return text == null ? (
        <p className="history-empty">加载中…</p>
      ) : ext === 'md' ? (
        <div className="lightbox-text">
          <MarkdownBody content={text} />
        </div>
      ) : (
        <pre className="lightbox-text">{text}</pre>
      )
    }
    return null
  })()

  const unsupported = body === null

  return (
    <div className="lightbox" role="dialog" aria-label="素材查看">
      <div className="lightbox-mask" onClick={onClose} />
      <div className="lightbox-bar">
        <strong>{fileNameOf(item)}</strong>
        <div className="lightbox-actions">
          <button type="button" className="btn btn-outline" onClick={openInSystem}>
            用系统打开
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="lightbox-body">
        {unsupported ? (
          <div className="lightbox-unsupported">
            <p>此类型不支持内嵌查看。</p>
            <button type="button" className="btn btn-outline" onClick={openInSystem}>
              用系统打开
            </button>
          </div>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
