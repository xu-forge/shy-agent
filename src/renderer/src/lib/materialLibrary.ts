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
/** 组内固定列数，不随缩放变化 */
export const CANVAS_COLUMNS = 5
export const GROUP_MAX_DEPTH = 3
export const GROUP_PAD = 16
export const GROUP_HEADER_H = 44
export const GROUP_STACK_GAP = 20
export const GROUP_CHILD_GAP = 12
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

export function canvasInnerWidth(): number {
  return CANVAS_COLUMNS * CANVAS_CARD_W + (CANVAS_COLUMNS - 1) * CANVAS_GAP
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

export type MaterialGroupNode = {
  path: string
  name: string
  absPath: string
  files: MaterialItem[]
  children: MaterialGroupNode[]
}

export type MaterialForest = {
  rootFiles: MaterialItem[]
  groups: MaterialGroupNode[]
}

export function dirOf(relativePath: string): string {
  const i = relativePath.lastIndexOf('/')
  return i >= 0 ? relativePath.slice(0, i) : ''
}

/** 由文件 absPath 反推某级目录的绝对路径 */
export function absDirOf(item: MaterialItem, dirPath: string): string {
  const rel = item.relativePath.replace(/\\/g, '/')
  const rest = rel.slice(dirPath.length)
  const abs = item.absPath
  if (rest && abs.endsWith(rest)) return abs.slice(0, abs.length - rest.length)
  const winRest = rest.replace(/\//g, '\\')
  if (rest && abs.endsWith(winRest)) return abs.slice(0, abs.length - winRest.length)
  return abs
}

export function isValidMaterialName(name: string): boolean {
  return (
    name.length > 0 && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\')
  )
}

export function toggleCollapsedPath(collapsed: readonly string[], path: string): string[] {
  return collapsed.includes(path) ? collapsed.filter((p) => p !== path) : [...collapsed, path]
}

export function countGroupFiles(node: MaterialGroupNode): number {
  return node.files.length + node.children.reduce((n, c) => n + countGroupFiles(c), 0)
}

/** relativePath 推导分组树：最多三级目录，更深文件拍平进第三级；空目录剔除 */
export function buildMaterialGroups(items: MaterialItem[]): MaterialForest {
  const rootFiles: MaterialItem[] = []
  const top = new Map<string, MaterialGroupNode>()

  const ensure = (dirPath: string, item: MaterialItem): MaterialGroupNode => {
    const parts = dirPath.split('/').filter(Boolean)
    const topName = parts[0] ?? dirPath
    let node = top.get(topName)
    if (!node) {
      node = {
        path: topName,
        name: topName,
        absPath: absDirOf(item, topName),
        files: [],
        children: []
      }
      top.set(topName, node)
    }
    let cur = node
    for (let i = 1; i < parts.length; i++) {
      const nextPath = parts.slice(0, i + 1).join('/')
      let child = cur.children.find((c) => c.path === nextPath)
      if (!child) {
        child = {
          path: nextPath,
          name: parts[i] ?? nextPath,
          absPath: absDirOf(item, nextPath),
          files: [],
          children: []
        }
        cur.children.push(child)
      }
      cur = child
    }
    return cur
  }

  for (const item of items) {
    const parts = item.relativePath.split('/').filter(Boolean)
    if (parts.length <= 1) {
      rootFiles.push(item)
      continue
    }
    const dirParts = parts.slice(0, -1)
    const capped = dirParts.slice(0, GROUP_MAX_DEPTH)
    ensure(capped.join('/'), item).files.push(item)
  }

  const sortTree = (nodes: MaterialGroupNode[]): MaterialGroupNode[] =>
    [...nodes]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((n) => ({
        ...n,
        files: sortMaterialsByRecency(n.files),
        children: sortTree(n.children)
      }))

  return { rootFiles: sortMaterialsByRecency(rootFiles), groups: sortTree([...top.values()]) }
}

export type PlacedGroup = {
  path: string
  name: string
  absPath: string
  x: number
  y: number
  w: number
  h: number
  collapsed: boolean
  fileCount: number
  placed: PlacedMaterial[]
  children: PlacedGroup[]
}

export type GroupedPlane = {
  rootPlaced: PlacedMaterial[]
  groups: PlacedGroup[]
  placed: PlacedMaterial[]
  width: number
  height: number
}

function layoutGroupNode(
  node: MaterialGroupNode,
  x: number,
  y: number,
  collapsed: ReadonlySet<string>
): PlacedGroup {
  const innerW = canvasInnerWidth()
  let w = innerW + GROUP_PAD * 2
  const isCollapsed = collapsed.has(node.path)
  const fileCount = countGroupFiles(node)
  if (isCollapsed) {
    return {
      path: node.path,
      name: node.name,
      absPath: node.absPath,
      x,
      y,
      w,
      h: GROUP_HEADER_H,
      collapsed: true,
      fileCount,
      placed: [],
      children: []
    }
  }
  const innerX = x + GROUP_PAD
  let cy = y + GROUP_HEADER_H + GROUP_PAD
  const children = node.children.map((child) => {
    const placed = layoutGroupNode(child, innerX, cy, collapsed)
    cy += placed.h + GROUP_CHILD_GAP
    return placed
  })
  // Nested groups are offset by the parent padding; grow the parent to keep
  // the child border inside it instead of letting every level use the same width.
  const childRight = children.reduce((right, child) => Math.max(right, child.x + child.w), x)
  w = Math.max(innerX + innerW, childRight) - x + GROUP_PAD
  const grid = layoutMaterials(node.files, CANVAS_COLUMNS)
  const placed = grid.placed.map((p) => ({ ...p, x: innerX + p.x, y: cy + p.y }))
  cy += node.files.length === 0 ? 0 : grid.height
  cy += GROUP_PAD
  return {
    path: node.path,
    name: node.name,
    absPath: node.absPath,
    x,
    y,
    w,
    h: Math.max(GROUP_HEADER_H + GROUP_PAD * 2, cy - y),
    collapsed: false,
    fileCount,
    placed,
    children
  }
}

export function layoutGroupedMaterials(
  forest: MaterialForest,
  collapsedPaths: readonly string[]
): GroupedPlane {
  const collapsed = new Set(collapsedPaths)
  const rootGrid = layoutMaterials(forest.rootFiles, CANVAS_COLUMNS)
  let y = forest.rootFiles.length === 0 ? 0 : rootGrid.height + GROUP_STACK_GAP
  const groups = forest.groups.map((g) => {
    const placed = layoutGroupNode(g, 0, y, collapsed)
    y += placed.h + GROUP_STACK_GAP
    return placed
  })
  const flattenCards = (gs: PlacedGroup[]): PlacedMaterial[] =>
    gs.flatMap((g) => [...g.placed, ...flattenCards(g.children)])
  const placed = [...rootGrid.placed, ...flattenCards(groups)]
  const groupW = groups.reduce((m, g) => Math.max(m, g.w), 0)
  return {
    rootPlaced: rootGrid.placed,
    groups,
    placed,
    width: Math.max(rootGrid.width, groupW, canvasInnerWidth()),
    height: Math.max(0, y - GROUP_STACK_GAP)
  }
}

export function remapCollapsedAfterRename(
  collapsed: readonly string[],
  oldPath: string,
  newPath: string
): string[] {
  return collapsed.map((p) => {
    if (p === oldPath) return newPath
    if (p.startsWith(`${oldPath}/`)) return `${newPath}${p.slice(oldPath.length)}`
    return p
  })
}

export function isReadableDoc(item: MaterialItem): boolean {
  return item.kind === 'doc' && ['pdf', 'md', 'txt'].includes(extOf(item))
}

export type DocSequenceGroup = { dir: string; items: MaterialItem[] }

export type DocSequence = {
  items: MaterialItem[]
  groups: DocSequenceGroup[]
}

export function docSequenceOf(items: MaterialItem[]): DocSequence {
  const docs = items.filter(isReadableDoc)
  const byDir = new Map<string, MaterialItem[]>()
  for (const doc of docs) {
    const dir = dirOf(doc.relativePath)
    const list = byDir.get(dir) ?? []
    list.push(doc)
    byDir.set(dir, list)
  }
  const dirs = [...byDir.keys()].sort((a, b) => a.localeCompare(b))
  const groups = dirs.map((dir) => ({
    dir,
    items: sortMaterialsByRecency(byDir.get(dir) ?? [])
  }))
  return { items: groups.flatMap((g) => g.items), groups }
}

export function docForestOf(items: MaterialItem[]): MaterialForest {
  return buildMaterialGroups(items.filter(isReadableDoc))
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
