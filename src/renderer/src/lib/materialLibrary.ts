import type { MaterialItem, MaterialKind } from '../../../shared/ipc'
import type { MaterialEditor } from '../components/material/registry'

export type KindFilter = 'all' | Exclude<MaterialKind, 'other'>

export const KIND_CHIPS: Array<{ id: KindFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'audio', label: '音频' },
  { id: 'doc', label: '文档' }
]

export function filterMaterialsByKind(items: MaterialItem[], filter: KindFilter): MaterialItem[] {
  if (filter === 'all') return items
  return items.filter((item) => item.kind === filter)
}

export function shouldShowEditButton(editors: MaterialEditor[]): boolean {
  return editors.length > 0
}

export function sessionFilesFingerprint(
  files: Array<{ id: number; op: string; path: string }>
): string {
  return files.map((f) => `${f.id}:${f.op}:${f.path}`).join('|')
}

export function fileNameOf(item: MaterialItem): string {
  return item.relativePath.split(/[/\\]/).pop() ?? item.relativePath
}

/* ────────── 画布（material-canvas） ────────── */

export type CanvasViewport = { x: number; y: number; scale: number }

export const CANVAS_MIN_SCALE = 0.1
export const CANVAS_MAX_SCALE = 3
/** 画布坐标上界：防极端平移下的浮点精度抖动 */
export const CANVAS_MAX_COORD = 100000
export const CANVAS_CARD_W = 220
export const CANVAS_CARD_H = 208
export const CANVAS_GAP = 16
export const CANVAS_BUFFER = 400
export const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, scale: 1 }

export function sortMaterialsByRecency(items: MaterialItem[]): MaterialItem[] {
  return [...items].sort(
    (a, b) => b.mtimeMs - a.mtimeMs || a.relativePath.localeCompare(b.relativePath)
  )
}

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_VIEWPORT.scale
  return Math.min(CANVAS_MAX_SCALE, Math.max(CANVAS_MIN_SCALE, scale))
}

export function clampViewport(v: CanvasViewport): CanvasViewport {
  const clamp = (n: number): number =>
    Number.isFinite(n) ? Math.min(CANVAS_MAX_COORD, Math.max(-CANVAS_MAX_COORD, n)) : 0
  return { x: clamp(v.x), y: clamp(v.y), scale: clampScale(v.scale) }
}

/** 缩放级别与视口宽度共同决定列数 */
export function canvasColumnsFor(viewportWidthPx: number, scale: number): number {
  const step = (CANVAS_CARD_W + CANVAS_GAP) * clampScale(scale)
  if (step <= 0) return 1
  return Math.max(1, Math.floor((Math.max(0, viewportWidthPx) - CANVAS_GAP) / step))
}

export type PlacedMaterial = {
  item: MaterialItem
  x: number
  y: number
  w: number
  h: number
}

export type MaterialPlane = {
  placed: PlacedMaterial[]
  columns: number
  width: number
  height: number
}

/** 等宽网格流：从画布原点 (0,0) 铺开，序列即传入顺序（调用方先按修改时间倒序） */
export function layoutMaterials(items: MaterialItem[], columns: number): MaterialPlane {
  const cols = Math.max(1, Math.floor(columns))
  const stepX = CANVAS_CARD_W + CANVAS_GAP
  const stepY = CANVAS_CARD_H + CANVAS_GAP
  const placed = items.map((item, i) => ({
    item,
    x: (i % cols) * stepX,
    y: Math.floor(i / cols) * stepY,
    w: CANVAS_CARD_W,
    h: CANVAS_CARD_H
  }))
  const rows = Math.max(1, Math.ceil(items.length / cols))
  return {
    placed,
    columns: cols,
    width: cols * CANVAS_CARD_W + (cols - 1) * CANVAS_GAP,
    height: rows * CANVAS_CARD_H + (rows - 1) * CANVAS_GAP
  }
}

/** 视口矩形（世界坐标）与卡片相交判定，含外扩缓冲 */
export function visiblePlaced<T extends { x: number; y: number; w: number; h: number }>(
  placed: T[],
  view: { x: number; y: number; width: number; height: number },
  bufferPx = CANVAS_BUFFER
): T[] {
  const minX = view.x - bufferPx
  const minY = view.y - bufferPx
  const maxX = view.x + view.width + bufferPx
  const maxY = view.y + view.height + bufferPx
  return placed.filter((p) => p.x < maxX && p.x + p.w > minX && p.y < maxY && p.y + p.h > minY)
}

/** 屏幕坐标 → 世界坐标（screen = (world - v) * scale） */
export function screenToWorld(v: CanvasViewport, sx: number, sy: number): { x: number; y: number } {
  return { x: v.x + sx / v.scale, y: v.y + sy / v.scale }
}

/** 以屏幕锚点为不动点缩放 */
export function zoomViewportAt(
  v: CanvasViewport,
  factor: number,
  sx: number,
  sy: number
): CanvasViewport {
  const scale = clampScale(v.scale * factor)
  const world = screenToWorld(v, sx, sy)
  return clampViewport({ scale, x: world.x - sx / scale, y: world.y - sy / scale })
}

/** 拖拽平移：屏幕位移换算为世界位移（反向） */
export function panViewport(
  start: CanvasViewport,
  dxScreen: number,
  dyScreen: number
): CanvasViewport {
  return clampViewport({
    scale: start.scale,
    x: start.x - dxScreen / start.scale,
    y: start.y - dyScreen / start.scale
  })
}

/** 滚轮滚动：向下滚动 = 视口下移（与常规滚动方向一致，不改变缩放） */
export function scrollViewport(
  v: CanvasViewport,
  dxScreen: number,
  dyScreen: number
): CanvasViewport {
  return clampViewport({
    scale: v.scale,
    x: v.x + dxScreen / v.scale,
    y: v.y + dyScreen / v.scale
  })
}

/** shy-material:// 协议源（renderer 直接加载素材原文件；仅限项目根内） */
export function materialSourceUrl(projectId: string, absPath: string): string {
  return `shy-material://m/${encodeURIComponent(projectId)}/${encodeURIComponent(absPath)}`
}

export function extOf(item: MaterialItem): string {
  const name = fileNameOf(item)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function isInlineDoc(item: MaterialItem): boolean {
  return ['pdf', 'md', 'txt'].includes(extOf(item))
}

/** 输入框 @ 素材引用：光标前存在「行首或空白后的 @token」时返回 token（不含 @），否则 null */
export function mentionQueryBefore(text: string, cursor: number): string | null {
  const match = /(^|\s)@([^\s@]*)$/.exec(text.slice(0, cursor))
  return match ? match[2] : null
}
