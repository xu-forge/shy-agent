import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import {
  type CanvasViewport,
  type PlacedGroup,
  buildMaterialGroups,
  layoutGroupedMaterials,
  panViewport,
  scrollViewport,
  visiblePlaced,
  zoomViewportAt,
  fitViewportToBounds,
  placedIntersectsRect,
  screenToWorld
} from '../../lib/materialLibrary'
import { CanvasCard } from './CanvasCard'
import { MaterialGroup } from './MaterialGroup'
import { Tooltip } from '../ui/Tooltip'

type Props = {
  projectId: string
  items: MaterialItem[]
  viewport: CanvasViewport
  collapsed: readonly string[]
  onViewportChange: (v: CanvasViewport) => void
  onOpen: (item: MaterialItem) => void
  onToggleGroup: (path: string) => void
  onFileContext: (e: React.MouseEvent, item: MaterialItem) => void
  onGroupContext: (e: React.MouseEvent, group: PlacedGroup) => void
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  startViewport: CanvasViewport
  moved: boolean
}

export function MaterialCanvas({
  projectId,
  items,
  viewport,
  collapsed,
  onViewportChange,
  onOpen,
  onToggleGroup,
  onFileContext,
  onGroupContext
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const viewportRef = useRef(viewport)
  viewportRef.current = viewport
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // React 的 onWheel 是 passive，需 preventDefault，手动挂 non-passive listener。
  // 滚轮/触控板双指 = 滚动平移；Ctrl/Cmd+滚轮与触控板捏合（Chromium 合成为 ctrlKey）= 缩放
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const factor = Math.exp(-e.deltaY * 0.0015)
        onViewportChange(
          zoomViewportAt(viewportRef.current, factor, e.clientX - rect.left, e.clientY - rect.top)
        )
        return
      }
      onViewportChange(scrollViewport(viewportRef.current, e.deltaX, e.deltaY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onViewportChange])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, .material-context-menu')) return
    if (interactionMode === 'select') {
      if ((e.target as HTMLElement).closest('button, .canvas-controls')) return
      const rect = e.currentTarget.getBoundingClientRect()
      setSelectionRect({ x: e.clientX - rect.left, y: e.clientY - rect.top, width: 0, height: 0 })
      dragRef.current = {
        pointerId: e.pointerId, startX: e.clientX, startY: e.clientY,
        startViewport: viewportRef.current, moved: false
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      return
    }
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startViewport: viewportRef.current,
      moved: false
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    if (interactionMode === 'select') {
      const rect = e.currentTarget.getBoundingClientRect()
      setSelectionRect({
        x: Math.min(drag.startX, e.clientX) - rect.left,
        y: Math.min(drag.startY, e.clientY) - rect.top,
        width: Math.abs(dx), height: Math.abs(dy)
      })
    } else onViewportChange(panViewport(drag.startViewport, dx, dy))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (interactionMode === 'select') {
      if (drag.moved && selectionRect) {
        const worldStart = screenToWorld(viewportRef.current, selectionRect.x, selectionRect.y)
        const worldEnd = screenToWorld(
          viewportRef.current,
          selectionRect.x + selectionRect.width,
          selectionRect.y + selectionRect.height
        )
        const rect = {
          x: Math.min(worldStart.x, worldEnd.x), y: Math.min(worldStart.y, worldEnd.y),
          width: Math.abs(worldEnd.x - worldStart.x), height: Math.abs(worldEnd.y - worldStart.y)
        }
        const hits = plane.placed.filter((p) => placedIntersectsRect(p, rect)).map((p) => p.item.id)
        setSelectedIds((previous) => e.shiftKey ? new Set([...previous, ...hits]) : new Set(hits))
      } else if (!drag.moved) setSelectedIds(new Set())
      setSelectionRect(null)
    }
  }

  // Keep the layout stable while panning and zooming; this is intentionally a manual cache.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const plane = useMemo(
    () => layoutGroupedMaterials(buildMaterialGroups(items), collapsed),
    [items, collapsed]
  )
  const view = useMemo(
    () => ({
      x: viewport.x,
      y: viewport.y,
      width: size.width / viewport.scale,
      height: size.height / viewport.scale
    }),
    [viewport.x, viewport.y, viewport.scale, size.width, size.height]
  )
  const visibleRoot = useMemo(() => visiblePlaced(plane.rootPlaced, view), [plane.rootPlaced, view])
  const visibleGroups = useMemo(() => visiblePlaced(plane.groups, view), [plane.groups, view])
  const zoomBy = (factor: number): void => {
    onViewportChange(zoomViewportAt(viewport, factor, size.width / 2, size.height / 2))
  }
  const fitCanvas = (): void => {
    onViewportChange(fitViewportToBounds(plane, size))
  }

  return (
    <div
      ref={containerRef}
      className="canvas-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="canvas-plane"
        style={{
          width: plane.width,
          height: plane.height,
          transform: `scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`
        }}
      >
        {visibleRoot.map((p) => (
          <CanvasCard
            key={p.item.id}
            projectId={projectId}
            placed={p}
            onOpen={onOpen}
            onSelect={(item) => setSelectedIds(new Set([item.id]))}
            selected={selectedIds.has(p.item.id)}
            onContextMenu={onFileContext}
          />
        ))}
        {visibleGroups.map((g) => (
          <MaterialGroup
            key={g.path}
            projectId={projectId}
            group={g}
            view={view}
            onOpen={onOpen}
            onSelect={(item) => setSelectedIds(new Set([item.id]))}
            selectedIds={selectedIds}
            onToggle={onToggleGroup}
            onFileContext={onFileContext}
            onGroupContext={onGroupContext}
          />
        ))}
      </div>
      {selectionRect ? (
        <div
          className="canvas-selection-rect"
          style={{
            left: selectionRect.x,
            top: selectionRect.y,
            width: selectionRect.width,
            height: selectionRect.height
          }}
        />
      ) : null}
      <div className="canvas-controls" onPointerDown={(e) => e.stopPropagation()}>
        <Tooltip label="缩小"><button type="button" onClick={() => zoomBy(0.8)} aria-label="缩小">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button></Tooltip>
        <span className="canvas-zoom-label">{Math.round(viewport.scale * 100)}%</span>
        <Tooltip label="放大"><button type="button" onClick={() => zoomBy(1.25)} aria-label="放大">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button></Tooltip>
        <Tooltip label="还原到 100%"><button type="button" onClick={() => onViewportChange({ ...viewport, scale: 1 })} aria-label="还原到100%">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 5v7h7" /></svg>
        </button></Tooltip>
        <Tooltip label="适应画布"><button type="button" onClick={fitCanvas} aria-label="适应画布">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></svg>
        </button></Tooltip>
        <Tooltip label="移动画布"><button
          type="button"
          className={interactionMode === 'pan' ? 'is-active' : ''}
          onClick={() => setInteractionMode('pan')}
          aria-label="移动画布"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M3 12h18M12 3l-2 2M12 3l2 2M21 12l-2-2M21 12l-2 2M12 21l-2-2M12 21l2-2M3 12l2-2M3 12l2 2" /></svg>
        </button></Tooltip>
        <Tooltip label="框选素材"><button
          type="button"
          className={interactionMode === 'select' ? 'is-active' : ''}
          onClick={() => setInteractionMode('select')}
          aria-label="框选素材"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" strokeDasharray="3 2" /><path d="m15 15 4 4" /></svg>
        </button></Tooltip>
      </div>
      {items.length === 0 ? <div className="canvas-empty">暂无素材</div> : null}
    </div>
  )
}
