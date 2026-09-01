import { useEffect, useState } from 'react'
import { dataUrlToArrayBuffer } from '../../lib/dataUrlBytes'
import type { PdfPageBox } from '../../lib/pdfLayout'
import { createPdfSession, type PdfSession } from '../../lib/pdfThumb'
import { createLimiter } from '../../lib/taskLimiter'

type Props = { projectId: string; relativePath: string; title: string }

const PAGE_MAX_WIDTH = 900
const acquirePageRender = createLimiter(2)

function describePdfError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg === 'path_escape' || msg === 'not_found') return '读不到这份 PDF 文件。'
  if (/fake worker/i.test(msg) || /worker/i.test(msg)) return `PDF 引擎启动失败：${msg}`
  return msg || '未知错误'
}

function PdfPageSlot({
  session,
  pageNumber,
  box,
  scrollRoot
}: {
  session: PdfSession
  pageNumber: number
  box: PdfPageBox
  scrollRoot: HTMLElement
}): React.JSX.Element {
  const [host, setHost] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!host) return
    let alive = true
    let visible = false
    let rendering = false

    const fill = (): void => {
      if (!alive || !visible || rendering || host.querySelector('canvas')) return
      rendering = true
      void acquirePageRender().then(async (release) => {
        try {
          if (!alive || !visible || host.querySelector('canvas')) return
          const canvas = await session.renderPage(pageNumber, PAGE_MAX_WIDTH, 'lightbox-pdf-page')
          if (!alive || !visible) return
          if (canvas && !host.querySelector('canvas')) host.appendChild(canvas)
        } finally {
          rendering = false
          release()
        }
      })
    }

    const io = new IntersectionObserver(
      (entries) => {
        visible = Boolean(entries[0]?.isIntersecting)
        if (visible) fill()
        else host.querySelector('canvas')?.remove()
      },
      { root: scrollRoot, rootMargin: '800px 0px', threshold: 0.01 }
    )
    io.observe(host)
    return () => {
      alive = false
      io.disconnect()
    }
  }, [host, session, pageNumber, scrollRoot])

  return (
    <div
      ref={setHost}
      className="lightbox-pdf-slot"
      style={{ aspectRatio: `${box.width} / ${box.height}` }}
      aria-label={`第 ${pageNumber} 页`}
    />
  )
}

/** 素材灯箱：按可见页渲染，避免整本一次性画完。 */
export function PdfViewer({ projectId, relativePath, title }: Props): React.JSX.Element {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null)
  const [session, setSession] = useState<PdfSession | null>(null)
  const [boxes, setBoxes] = useState<PdfPageBox[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    let cancelled = false
    let opened: PdfSession | null = null
    setSession(null)
    setBoxes([])
    setStatus('loading')
    setDetail('')
    void (async () => {
      try {
        const r = await window.shy.projectFileReadDataUrl({ projectId, relativePath })
        if (!r.ok) throw new Error(r.error)
        if (cancelled) return
        opened = await createPdfSession(dataUrlToArrayBuffer(r.dataUrl))
        if (cancelled) {
          await opened.destroy()
          return
        }
        if (opened.numPages < 1) throw new Error('empty pdf')
        setSession(opened)
        const measured = await opened.measurePages(PAGE_MAX_WIDTH, () => cancelled, (partial) => {
          if (cancelled) return
          setBoxes([...partial])
          setStatus('ready')
        })
        if (cancelled) {
          await opened.destroy()
          return
        }
        if (measured.length < 1) throw new Error('empty pdf')
        setBoxes(measured)
        setStatus('ready')
      } catch (err) {
        if (opened) await opened.destroy()
        if (!cancelled) {
          setStatus('error')
          setDetail(describePdfError(err))
        }
      }
    })()
    return () => {
      cancelled = true
      void opened?.destroy()
    }
  }, [projectId, relativePath])

  return (
    <div ref={setScrollRoot} className="lightbox-pdf" aria-label={title}>
      {status === 'loading' ? <p className="history-empty">加载中…</p> : null}
      {status === 'error' ? (
        <p className="history-empty">
          无法预览这份 PDF。
          {detail ? <span className="lightbox-pdf-error"> {detail}</span> : null}
        </p>
      ) : null}
      {status === 'ready' && session && scrollRoot
        ? boxes.map((box, i) => (
            <PdfPageSlot
              key={i + 1}
              session={session}
              pageNumber={i + 1}
              box={box}
              scrollRoot={scrollRoot}
            />
          ))
        : null}
    </div>
  )
}
