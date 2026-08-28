import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaterialItem } from '../../../../shared/ipc'
import {
  type CanvasViewport,
  canvasColumnsFor,
  layoutMaterials,
  panViewport,
  scrollViewport,
  sortMaterialsByRecency,
  visiblePlaced,
  zoomViewportAt
} from '../../lib/materialLibrary'
import { CanvasCard } from './CanvasCard'

type Props = {
  projectId: string
  items: MaterialItem[]
  viewport: CanvasViewport
  onViewportChange: (v: CanvasViewport) => void
  onOpen: (item: MaterialItem) => void
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
  onViewportChange,
  onOpen
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
    if ((e.target as HTMLElement).closest('.canvas-card')) return
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

  const ordered = useMemo(() => sortMaterialsByRecency(items), [items])
  const columns = canvasColumnsFor(size.width, viewport.scale)
  const plane = useMemo(() => layoutMaterials(ordered, columns), [ordered, columns])
  const visible = useMemo(
    () =>
      visiblePlaced(plane.placed, {
        x: viewport.x,
        y: viewport.y,
        width: size.width / viewport.scale,
        height: size.height / viewport.scale
      }),
    [plane, viewport.x, viewport.y, viewport.scale, size.width, size.height]
  )

  return (
    <div
      ref={containerRef}
      className="canvas-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="canvas-plane"
        style={{
          width: plane.width,
          height: plane.height,
          transform: `scale(${viewport.scale}) translate(${-viewport.x}px, ${-viewport.y}px)`
        }}
      >
        {visible.map((p) => (
          <CanvasCard key={p.item.id} projectId={projectId} placed={p} onOpen={onOpen} />
        ))}
      </div>
      {items.length === 0 ? <div className="canvas-empty">暂无素材</div> : null}
    </div>
  )
}
