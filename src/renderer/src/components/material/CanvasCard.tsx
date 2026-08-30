import { useEffect, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import {
  type PlacedMaterial,
  extOf,
  fileNameOf,
  materialSourceUrl
} from '../../lib/materialLibrary'

type Props = {
  projectId: string
  placed: PlacedMaterial
  onOpen: (item: MaterialItem) => void
  onSelect?: (item: MaterialItem) => void
  selected?: boolean
  onContextMenu?: (e: React.MouseEvent, item: MaterialItem) => void
}

type ThumbState = { url: string | null; failed: boolean }

const THUMB_CONCURRENCY = 3
let activeFrames = 0
const frameQueue: Array<() => void> = []

function acquireFrameSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const run = (): void => {
      activeFrames++
      resolve(() => {
        activeFrames--
        const next = frameQueue.shift()
        if (next) next()
      })
    }
    if (activeFrames < THUMB_CONCURRENCY) run()
    else frameQueue.push(run)
  })
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

/** 视频首帧：缓存 miss 时用 Chromium 截帧（并发 ≤3），失败/超时降级图标卡 */
function VideoThumb({
  projectId,
  item
}: {
  projectId: string
  item: MaterialItem
}): React.JSX.Element {
  const [state, setState] = useState<ThumbState & { needFrame: boolean }>({
    url: null,
    failed: false,
    needFrame: false
  })
  useEffect(() => {
    let alive = true
    setState({ url: null, failed: false, needFrame: false })
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
        else if (r.reason === 'not_found') setState({ url: null, failed: false, needFrame: true })
        else setState({ url: null, failed: true, needFrame: false })
      })
      .catch(() => {
        if (alive) setState({ url: null, failed: true, needFrame: false })
      })
    return () => {
      alive = false
    }
  }, [projectId, item.absPath, item.mtimeMs, item.size])

  const frameAttempted = useRef(false)
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
      video.addEventListener('loadedmetadata', onLoadedMetadata)
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onError)
      video.src = materialSourceUrl(projectId, item.absPath)
    })
    return () => {
      alive = false
    }
  }, [state.needFrame, projectId, item.absPath, item.mtimeMs, item.size])

  if (state.failed) return <KindIcon kind="video" ext="" />
  if (!state.url) return <div className="canvas-card-loading" />
  return (
    <img className="canvas-card-thumb" src={state.url} alt={fileNameOf(item)} draggable={false} />
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

export function CanvasCard({ projectId, placed, onOpen, onSelect, selected, onContextMenu }: Props): React.JSX.Element {
  const { item, x, y, w, h } = placed
  const ext = extOf(item)
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
