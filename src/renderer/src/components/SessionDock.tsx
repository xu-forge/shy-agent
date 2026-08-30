import { useCallback, useEffect, useRef, useState } from 'react'
import type { DockMode } from '../lib/dockMode'
import {
  DOCK_DEFAULT_WIDTH,
  DOCK_MAX_WIDTH,
  DOCK_MIN_WIDTH,
  DOCK_WIDTH_KEY,
  clampDockWidth,
  parseDockWidth
} from '../lib/dockMode'
import { BrowserPanel } from './chat/BrowserPanel'
import { DockFilesView } from './dock/DockFilesView'
import { DockTasksView } from './InspectorPanel'
import { RightDockIcon } from './RightDockIcon'

const TITLES: Record<Exclude<DockMode, null>, string> = {
  tasks: '任务详情',
  browser: '浏览器',
  files: '文件'
}

type Props = {
  sessionId: string
  mode: DockMode
  onClose: () => void
  launchUrl?: string | null
  onLaunchUrlConsumed?: () => void
}

function loadDockWidth(): number {
  try {
    return parseDockWidth(localStorage.getItem(DOCK_WIDTH_KEY))
  } catch {
    return DOCK_DEFAULT_WIDTH
  }
}

function persistDockWidth(w: number): void {
  try {
    localStorage.setItem(DOCK_WIDTH_KEY, String(w))
  } catch {
    /* ignore */
  }
}

export function SessionDock({
  sessionId,
  mode,
  onClose,
  launchUrl,
  onLaunchUrlConsumed
}: Props): React.JSX.Element {
  const open = mode !== null
  const title = mode ? TITLES[mode] : '任务详情'
  const [dockWidth, setDockWidth] = useState(loadDockWidth)
  const [dragging, setDragging] = useState(false)
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    const onResize = (): void => setDockWidth((w) => clampDockWidth(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const finishDrag = useCallback((): void => {
    dragState.current = null
    setDragging(false)
    setDockWidth((w) => {
      const next = clampDockWidth(w)
      persistDockWidth(next)
      return next
    })
  }, [])

  const onResizerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
      dragState.current = { startX: e.clientX, startW: dockWidth }
    },
    [dockWidth]
  )

  const onResizerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragState.current
    if (!d) return
    setDockWidth(clampDockWidth(d.startW + (d.startX - e.clientX)))
  }, [])

  const onResizerDoubleClick = useCallback((): void => {
    setDockWidth(DOCK_DEFAULT_WIDTH)
    persistDockWidth(DOCK_DEFAULT_WIDTH)
  }, [])

  return (
    <aside
      className={`inspector-panel${open ? '' : ' is-closed'}${dragging ? ' is-dragging' : ''}`}
      aria-hidden={!open}
      style={{ width: open ? dockWidth : 0 }}
    >
      {open ? (
        <div
          className="dock-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={dockWidth}
          aria-valuemin={DOCK_MIN_WIDTH}
          aria-valuemax={DOCK_MAX_WIDTH}
          aria-label="拖拽调整右侧面板宽度"
          title="拖拽调整宽度（双击恢复默认）"
          onPointerDown={onResizerPointerDown}
          onPointerMove={onResizerPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onDoubleClick={onResizerDoubleClick}
        />
      ) : null}
      <div className="inspector-panel-inner" style={{ width: dockWidth }}>
        <div className="inspector-head">
          <span className="inspector-title">{title}</span>
          <button
            type="button"
            className="inspector-collapse"
            title="收起面板"
            aria-label="收起面板"
            onClick={onClose}
          >
            <RightDockIcon />
          </button>
        </div>
        <div className="dock-body">
          {mode === 'tasks' ? <DockTasksView sessionId={sessionId} /> : null}
          {mode === 'browser' ? (
            <div className="inspector-browser dock-page">
              <BrowserPanel
                embedded
                launchUrl={launchUrl}
                onLaunchUrlConsumed={onLaunchUrlConsumed}
              />
            </div>
          ) : null}
          {mode === 'files' ? <DockFilesView sessionId={sessionId} /> : null}
        </div>
      </div>
    </aside>
  )
}
