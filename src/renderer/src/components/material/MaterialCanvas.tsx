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
  zoomViewportAt
} from '../../lib/materialLibrary'
import { CanvasCard } from './CanvasCard'
import { MaterialGroup } from './MaterialGroup'

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
    onViewportChange(panViewport(drag.startViewport, dx, dy))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const forest = useMemo(() => buildMaterialGroups(items), [items])
  const plane = useMemo(() => layoutGroupedMaterials(forest, collapsed), [forest, collapsed])
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
            onToggle={onToggleGroup}
            onFileContext={onFileContext}
            onGroupContext={onGroupContext}
          />
        ))}
      </div>
      {items.length === 0 ? <div className="canvas-empty">暂无素材</div> : null}
    </div>
  )
}
