/**
 * 页面元素快照与 ref 模型（移植自 MiniMaxCode browser-semantic-tree/element-map，小型化）。
 *
 * - 注入脚本收集可交互元素（含唯一 CSS 路径与视口矩形）
 * - 每次快照为元素分配 `browser-element:{uuid}` ref（仅该快照有效）
 * - 快照按 tab 保存、TTL 5 分钟、主导航后失效
 */
import { randomUUID } from 'crypto'

export const MAX_SNAPSHOT_ELEMENTS = 200
export const SNAPSHOT_TTL_MS = 5 * 60 * 1000
export const DEFAULT_SNAPSHOT_PAGE_SIZE = 100

/** 注入页面的元素收集脚本（返回 JSON 数组） */
export const PAGE_ELEMENTS_SCRIPT = `(() => {
  const cssPath = (el) => {
    if (el.id) return '#' + CSS.escape(el.id)
    const parts = []
    let node = el
    while (node && node.nodeType === 1 && parts.length < 12) {
      let part = node.tagName.toLowerCase()
      if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break }
      const parent = node.parentElement
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === node.tagName)
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
      }
      parts.unshift(part)
      node = parent
    }
    return parts.join(' > ')
  }
  const sel = 'a[href],button,input,select,textarea,[role],[contenteditable],[onclick],[tabindex]'
  const els = [...document.querySelectorAll(sel)]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
    .slice(0, 400)
  return JSON.stringify(els.map((el) => {
    const r = el.getBoundingClientRect()
    const text = (el.innerText || el.getAttribute('aria-label') || el.value || el.placeholder || '')
      .trim().replace(/\\s+/g, ' ').slice(0, 100)
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      type: el.getAttribute('type') || '',
      name: el.getAttribute('name') || '',
      text,
      cssPath: cssPath(el),
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      inViewport: r.top < window.innerHeight && r.bottom > 0
    }
  }))
})()`

export type RawSnapshotElement = {
  tag: string
  role: string
  type: string
  name: string
  text: string
  cssPath: string
  rect: { x: number; y: number; width: number; height: number }
  inViewport: boolean
}

export type SnapshotElement = RawSnapshotElement & {
  ref: string
  backendRef: string
}

/** agent 优先级：可输入/可点击的语义元素排前 */
const TAG_PRIORITY: Record<string, number> = {
  button: 0,
  a: 1,
  input: 2,
  select: 3,
  textarea: 4
}

export function buildSnapshot(raw: RawSnapshotElement[]): SnapshotElement[] {
  return [...raw]
    .sort((a, b) => {
      const pd = (TAG_PRIORITY[a.tag] ?? 5) - (TAG_PRIORITY[b.tag] ?? 5)
      if (pd !== 0) return pd
      return Number(b.inViewport) - Number(a.inViewport)
    })
    .slice(0, MAX_SNAPSHOT_ELEMENTS)
    .map((e) => ({
      ...e,
      ref: `browser-element:${randomUUID()}`,
      backendRef: e.cssPath
    }))
}

/** 快照渲染为文本（分页） */
export function renderSnapshotPage(
  elements: SnapshotElement[],
  offset = 0,
  limit = DEFAULT_SNAPSHOT_PAGE_SIZE,
  total?: number
): string {
  const page = elements.slice(offset, offset + limit)
  const totalAll = total ?? elements.length
  const header = `元素 ${offset + 1}-${Math.min(offset + limit, totalAll)} / 共 ${totalAll} 个；ref 仅本次快照有效`
  const lines = page.map(
    (e) =>
      `- [${e.ref}] <${e.tag}${e.role ? ` role=${e.role}` : ''}${e.type ? ` type=${e.type}` : ''}>${e.text ? ` "${e.text}"` : ''}`
  )
  const more =
    offset + limit < totalAll
      ? `\n（还有 ${totalAll - offset - limit} 个元素，用 input.offset=${offset + limit} 翻页）`
      : ''
  return [header, ...lines, more].filter(Boolean).join('\n')
}

/** 按 tab 的快照存储（ref → element；TTL；导航失效） */
export class SnapshotStore {
  private elements: SnapshotElement[] = []
  private byRef = new Map<string, SnapshotElement>()
  private createdAt = 0
  private generation = 0

  store(raw: RawSnapshotElement[]): SnapshotElement[] {
    this.elements = buildSnapshot(raw)
    this.byRef = new Map(this.elements.map((e) => [e.ref, e]))
    this.createdAt = Date.now()
    this.generation++
    return this.elements
  }

  /** 主文档导航后调用：清空旧 ref */
  invalidate(): void {
    this.elements = []
    this.byRef.clear()
    this.createdAt = 0
  }

  isExpired(now = Date.now()): boolean {
    return this.createdAt === 0 || now - this.createdAt > SNAPSHOT_TTL_MS
  }

  resolve(ref: string): SnapshotElement | undefined {
    if (this.isExpired()) return undefined
    return this.byRef.get(ref)
  }

  list(): SnapshotElement[] {
    return this.isExpired() ? [] : this.elements
  }
}
