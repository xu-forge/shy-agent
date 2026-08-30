import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ESTIMATED_HEIGHT = 120
const OVERSCAN = 600

export function getVirtualRange(
  count: number,
  scrollTop: number,
  viewportHeight: number,
  measured: ReadonlyMap<number, number>,
  estimatedHeight = ESTIMATED_HEIGHT,
  overscan = OVERSCAN
): { start: number; end: number; offsets: number[]; total: number } {
  const offsets = new Array<number>(count + 1).fill(0)
  for (let i = 0; i < count; i += 1) offsets[i + 1] = offsets[i] + (measured.get(i) ?? estimatedHeight)
  const startOffset = Math.max(0, scrollTop - viewportHeight + estimatedHeight - overscan)
  const endOffset = scrollTop + viewportHeight + overscan
  let start = 0
  while (start < count && offsets[start + 1] <= startOffset) start += 1
  let end = start
  while (end < count && offsets[end] < endOffset) end += 1
  return { start, end, offsets, total: offsets[count] ?? 0 }
}

export type VirtualItemProps = {
  ref: (node: HTMLElement | null) => void
  style: React.CSSProperties
  'data-message-block': true
}

export function useDynamicVirtualList(count: number, scrollTop: number, viewportHeight: number): {
  startIndex: number
  endIndex: number
  totalHeight: number
  itemProps: (index: number) => VirtualItemProps
} {
  const [heights, setHeights] = useState<Record<number, number>>({})
  const observers = useRef(new Map<number, ResizeObserver>())
  const positions = useMemo(() => {
    const result = new Array<number>(count + 1).fill(0)
    for (let i = 0; i < count; i += 1) result[i + 1] = result[i] + (heights[i] ?? ESTIMATED_HEIGHT)
    return result
  }, [count, heights])

  const findIndex = useCallback(
    (offset: number): number => {
      let low = 0
      let high = count
      while (low < high) {
        const mid = Math.floor((low + high) / 2)
        if (positions[mid + 1] <= offset) low = mid + 1
        else high = mid
      }
      return Math.min(low, Math.max(0, count - 1))
    },
    [count, positions]
  )

  const startIndex = count ? findIndex(Math.max(0, scrollTop - OVERSCAN)) : 0
  const endIndex = count
    ? Math.min(count, findIndex(scrollTop + viewportHeight + OVERSCAN) + 1)
    : 0

  const itemProps = useCallback(
    (index: number): VirtualItemProps => ({
      'data-message-block': true,
      style: { position: 'absolute', top: positions[index], left: 0, right: 0 },
      ref: (node) => {
        observers.current.get(index)?.disconnect()
        if (!node || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(([entry]) => {
          const height = Math.ceil(entry?.contentRect.height ?? 0)
          if (height > 0) {
            setHeights((previous) =>
              previous[index] === height ? previous : { ...previous, [index]: height }
            )
          }
        })
        observers.current.set(index, observer)
        observer.observe(node)
      }
    }),
    [positions]
  )

  useEffect(() => {
    const activeObservers = observers.current
    return () => {
      activeObservers.forEach((observer) => observer.disconnect())
      activeObservers.clear()
    }
  }, [])

  return { startIndex, endIndex, totalHeight: positions[count] ?? 0, itemProps }
}
