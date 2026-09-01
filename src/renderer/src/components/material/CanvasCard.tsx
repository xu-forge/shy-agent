import { useEffect, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import {
  type PlacedMaterial,
  extOf,
  fileNameOf,
  materialSourceUrl
} from '../../lib/materialLibrary'
import { renderPdfFirstPage } from '../../lib/pdfThumb'
import { dataUrlToArrayBuffer } from '../../lib/dataUrlBytes'
import { createLimiter } from '../../lib/taskLimiter'
import { shouldDecodeThumb, THUMB_DECODE_MIN_WIDTH } from '../../lib/thumbDecode'

type Props = {
  projectId: string
  placed: PlacedMaterial
  onOpen: (item: MaterialItem) => void
  onSelect?: (item: MaterialItem) => void
  selected?: boolean
  onContextMenu?: (e: React.MouseEvent, item: MaterialItem) => void
}

type ThumbState = { url: string | null; failed: boolean }

const acquireFrameSlot = createLimiter(3)
const acquirePdfSlot = createLimiter(1)

function useThumbDecodeGate(): { ref: (el: HTMLElement | null) => void; active: boolean } {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [active, setActive] = useState(false)
  useEffect(() => {
    if (!el) return
    const root = el.closest('.canvas-viewport')
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0]
        if (!e) return
        setActive(
          shouldDecodeThumb(
            { isIntersecting: e.isIntersecting, width: e.intersectionRect.width },
            THUMB_DECODE_MIN_WIDTH
          )
        )
      },
      { root: root instanceof Element ? root : null, rootMargin: '120px', threshold: [0, 0.01, 1] }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [el])
  return { ref: setEl, active }
}

function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function kindLabel(kind: MaterialItem['kind']): string {
  switch (kind) {
    case 'image':
      return '图片'
    case 'video':
      return '视频'
    case 'audio':
      return '音频'
    case 'doc':
      return '文档'
    default:
      return '其他'
  }
}

function KindIcon({ kind, ext }: { kind: MaterialItem['kind']; ext: string }): React.JSX.Element {
  if (kind === 'doc') {
    return <span className="canvas-card-docext">{ext ? ext.toUpperCase() : 'DOC'}</span>
  }
  const path = (() => {
    switch (kind) {
      case 'video':
        return 'M8 5.5v13l11-6.5z'
      case 'audio':
        return 'M12 4v10.55A4 4 0 1 0 14 18V8h4V4z'
      default:
        return 'M5 4h10l4 4v12H5z'
    }
  })()
  return (
    <svg className="canvas-card-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

/** 图片缩略图：png/jpg/jpeg 走磁盘缓存；webp/gif 等降级为原图直载 */
function ImageThumb({
  projectId,
  item
}: {
  projectId: string
  item: MaterialItem
}): React.JSX.Element {
  const [state, setState] = useState<ThumbState>({ url: null, failed: false })
  useEffect(() => {
    let alive = true
    setState({ url: null, failed: false })
    void window.shy
      .materialThumbGet({
        projectId,
        absPath: item.absPath,
        mtimeMs: item.mtimeMs,
        size: item.size
      })
      .then((r) => {
        if (!alive) return
        if (r.ok) setState({ url: r.url, failed: false })
        else if (r.reason === 'path_escape') setState({ url: null, failed: true })
        else setState({ url: materialSourceUrl(projectId, item.absPath), failed: false })
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true })
      })
    return () => {
      alive = false
    }
  }, [projectId, item.absPath, item.mtimeMs, item.size])

  if (state.failed) return <KindIcon kind="image" ext="" />
  if (!state.url) return <div className="canvas-card-loading" />
  return (
    <img
      className="canvas-card-thumb"
      src={state.url}
      alt={fileNameOf(item)}
      loading="lazy"
      draggable={false}
      onError={() => setState({ url: null, failed: true })}
    />
  )
}

function ThumbHost({
  decodeRef,
  children
}: {
  decodeRef: (el: HTMLElement | null) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div ref={decodeRef} className="canvas-card-thumb-host">
      {children}
    </div>
  )
}

/** 视频首帧：仅在卡片够大时解码；缓存 miss 时截帧（并发 ≤3） */
function VideoThumb({
  projectId,
  item
}: {
  projectId: string
  item: MaterialItem
}): React.JSX.Element {
  const { ref, active } = useThumbDecodeGate()
  const [state, setState] = useState<ThumbState & { needFrame: boolean }>({
    url: null,
    failed: false,
    needFrame: false
  })
  useEffect(() => {
    setState({ url: null, failed: false, needFrame: false })
  }, [projectId, item.absPath, item.mtimeMs, item.size])

  useEffect(() => {
    if (!active || state.url || state.failed || state.needFrame) return
    let alive = true
    void window.shy
      .materialThumbGet({
        projectId,
        absPath: item.absPath,
        mtimeMs: item.mtimeMs,
        size: item.size
      })
      .then((r) => {
        if (!alive) return
        if (r.ok) setState({ url: r.url, failed: false, needFrame: false })
        else if (r.reason === 'path_escape') setState({ url: null, failed: true, needFrame: false })
        else setState({ url: null, failed: false, needFrame: true })
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true, needFrame: false })
      })
    return () => {
      alive = false
    }
  }, [active, state.url, state.failed, state.needFrame, projectId, item.absPath, item.mtimeMs, item.size])

  const frameAttempted = useRef(false)
  useEffect(() => {
    frameAttempted.current = false
  }, [projectId, item.absPath, item.mtimeMs, item.size])

  useEffect(() => {
    if (!state.needFrame || frameAttempted.current) return
    frameAttempted.current = true
    let alive = true
    let release: (() => void) | null = null
    let timeout = 0
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const finish = (ok: boolean, url?: string): void => {
      window.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
      release?.()
      if (!alive) return
      if (ok && url) setState({ url, failed: false, needFrame: false })
      else setState({ url: null, failed: true, needFrame: false })
    }
    const onError = (): void => finish(false)
    const onSeeked = (): void => {
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return finish(false)
        const width = Math.min(480, vw)
        canvas.width = width
        canvas.height = Math.max(1, Math.round((vh / vw) * width))
        const ctx = canvas.getContext('2d')
        if (!ctx) return finish(false)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
        void window.shy
          .materialThumbPut({
            projectId,
            absPath: item.absPath,
            mtimeMs: item.mtimeMs,
            size: item.size,
            dataUrl
          })
          .then((r) => finish(r.ok, r.ok ? r.url : undefined))
          .catch(() => finish(false))
      } catch {
        finish(false)
      }
    }
    const onLoadedMetadata = (): void => {
      const d = Number.isFinite(video.duration) ? video.duration : 1
      video.currentTime = Math.min(0.1, d / 2)
    }
    void acquireFrameSlot().then((rel) => {
      if (!alive) {
        rel()
        return
      }
      release = rel
      timeout = window.setTimeout(() => finish(false), 5000)
      video.muted = true
      video.preload = 'auto'
      video.crossOrigin = 'anonymous'
      video.addEventListener('loadedmetadata', onLoadedMetadata)
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.src = materialSourceUrl(projectId, item.absPath)
    })
    return () => {
      alive = false
    }
  }, [state.needFrame, projectId, item.absPath, item.mtimeMs, item.size])

  return (
    <ThumbHost decodeRef={ref}>
      {state.failed ? (
        <KindIcon kind="video" ext="" />
      ) : state.url ? (
        <img className="canvas-card-thumb" src={state.url} alt={fileNameOf(item)} draggable={false} />
      ) : active ? (
        <div className="canvas-card-loading" />
      ) : (
        <KindIcon kind="video" ext="" />
      )}
    </ThumbHost>
  )
}

/** 音频时长（可得时） */
function useAudioDuration(projectId: string, item: MaterialItem): number | null {
  const [duration, setDuration] = useState<number | null>(null)
  useEffect(() => {
    if (item.kind !== 'audio') return
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = materialSourceUrl(projectId, item.absPath)
    const onMeta = (): void => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration)
    }
    audio.addEventListener('loadedmetadata', onMeta)
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeAttribute('src')
    }
  }, [projectId, item.absPath, item.kind])
  return duration
}

/** PDF 首页：仅在卡片够大时解码；pdf.js 主线程并发 1 */
function PdfThumb({ projectId, item }: { projectId: string; item: MaterialItem }): React.JSX.Element {
  const { ref, active } = useThumbDecodeGate()
  const [state, setState] = useState<ThumbState>({ url: null, failed: false })
  useEffect(() => {
    setState({ url: null, failed: false })
  }, [projectId, item.absPath, item.mtimeMs, item.size])

  useEffect(() => {
    if (!active || state.url || state.failed) return
    let alive = true
    void window.shy
      .materialThumbGet({
        projectId,
        absPath: item.absPath,
        mtimeMs: item.mtimeMs,
        size: item.size
      })
      .then(async (r) => {
        if (!alive) return
        if (r.ok) {
          setState({ url: r.url, failed: false })
          return
        }
        if (r.reason === 'path_escape') {
          setState({ url: null, failed: true })
          return
        }
        const release = await acquirePdfSlot()
        if (!alive) {
          release()
          return
        }
        try {
          const file = await window.shy.projectFileReadDataUrl({
            projectId,
            relativePath: item.relativePath
          })
          if (!file.ok) throw new Error(file.error)
          const bytes = dataUrlToArrayBuffer(file.dataUrl)
          const dataUrl = await renderPdfFirstPage(bytes)
          if (!alive) return
          if (!dataUrl) {
            setState({ url: null, failed: true })
            return
          }
          const put = await window.shy.materialThumbPut({
            projectId,
            absPath: item.absPath,
            mtimeMs: item.mtimeMs,
            size: item.size,
            dataUrl
          })
          if (!alive) return
          setState({ url: put.ok ? put.url : dataUrl, failed: false })
        } catch {
          if (alive) setState({ url: null, failed: true })
        } finally {
          release()
        }
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true })
      })
    return () => {
      alive = false
    }
  }, [
    active,
    state.url,
    state.failed,
    projectId,
    item.absPath,
    item.mtimeMs,
    item.size,
    item.relativePath
  ])

  return (
    <ThumbHost decodeRef={ref}>
      {state.failed ? (
        <KindIcon kind="doc" ext="pdf" />
      ) : state.url ? (
        <img className="canvas-card-thumb" src={state.url} alt={fileNameOf(item)} draggable={false} />
      ) : active ? (
        <div className="canvas-card-loading" />
      ) : (
        <KindIcon kind="doc" ext="pdf" />
      )}
    </ThumbHost>
  )
}

export function CanvasCard({ projectId, placed, onOpen, onSelect, selected, onContextMenu }: Props): React.JSX.Element {
  const { item, x, y, w, h } = placed
  const ext = extOf(item)
  const isPdf = item.kind === 'doc' && ext === 'pdf'
  const duration = useAudioDuration(projectId, item)
  return (
    <button
      type="button"
      className={`canvas-card${selected ? ' is-selected' : ''}`}
      style={{ left: x, top: y, width: w, height: h }}
      onClick={() => (onSelect ? onSelect(item) : onOpen(item))}
      onContextMenu={(e) => {
        if (!onContextMenu) return
        e.preventDefault()
        e.stopPropagation()
        onContextMenu(e, item)
      }}
    >
      <div className="canvas-card-media">
        {item.kind === 'image' ? (
          <ImageThumb projectId={projectId} item={item} />
        ) : item.kind === 'video' ? (
          <VideoThumb projectId={projectId} item={item} />
        ) : isPdf ? (
          <PdfThumb projectId={projectId} item={item} />
        ) : (
          <div className="canvas-card-fallback">
            <KindIcon kind={item.kind} ext={ext} />
            {item.kind === 'audio' && duration != null ? (
              <span className="canvas-card-duration">{formatDuration(duration)}</span>
            ) : null}
          </div>
        )}
        {item.kind === 'video' ? <span className="canvas-card-badge">▶</span> : null}
      </div>
      <span className="canvas-card-kind">{kindLabel(item.kind)}</span>
      <span className="canvas-card-name">{fileNameOf(item)}</span>
    </button>
  )
}
