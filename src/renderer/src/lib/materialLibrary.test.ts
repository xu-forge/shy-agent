import { describe, expect, it } from 'vitest'
import type { MaterialItem, MaterialKind } from '../../../shared/ipc'
import { materialEditors } from '../components/material/registry'
import {
  CANVAS_BUFFER,
  CANVAS_CARD_H,
  CANVAS_CARD_W,
  CANVAS_GAP,
  CANVAS_MAX_COORD,
  DEFAULT_VIEWPORT,
  KIND_CHIPS,
  canvasColumnsFor,
  clampScale,
  clampViewport,
  extOf,
  filterMaterialsByKind,
  isInlineDoc,
  layoutMaterials,
  materialSourceUrl,
  mentionQueryBefore,
  panViewport,
  screenToWorld,
  scrollViewport,
  sessionFilesFingerprint,
  shouldShowEditButton,
  sortMaterialsByRecency,
  visiblePlaced,
  zoomViewportAt
} from './materialLibrary'

function item(kind: MaterialKind, name: string, mtimeMs = 1): MaterialItem {
  return {
    id: name,
    relativePath: name,
    absPath: `/proj/${name}`,
    kind,
    mime: 'application/octet-stream',
    mtimeMs,
    size: 1
  }
}

describe('KIND_CHIPS', () => {
  it('lists 全部 plus the four named kinds with spec labels', () => {
    expect(KIND_CHIPS).toEqual([
      { id: 'all', label: '全部' },
      { id: 'image', label: '图片' },
      { id: 'video', label: '视频' },
      { id: 'audio', label: '音频' },
      { id: 'doc', label: '文档' }
    ])
  })
})

describe('filterMaterialsByKind', () => {
  const items = [
    item('image', 'a.png'),
    item('video', 'b.mp4'),
    item('audio', 'c.mp3'),
    item('doc', 'd.pdf'),
    item('other', 'e.bin')
  ]

  it('keeps every item when filter is 全部', () => {
    expect(filterMaterialsByKind(items, 'all')).toEqual(items)
  })

  it('keeps only matching kind when a named chip is selected', () => {
    expect(filterMaterialsByKind(items, 'image').map((i) => i.id)).toEqual(['a.png'])
    expect(filterMaterialsByKind(items, 'doc').map((i) => i.id)).toEqual(['d.pdf'])
  })
})

describe('shouldShowEditButton', () => {
  it('is false while the v1 registry is empty', () => {
    expect(materialEditors).toHaveLength(0)
    expect(shouldShowEditButton(materialEditors)).toBe(false)
  })

  it('is true only after at least one editor is registered', () => {
    expect(shouldShowEditButton([{ id: 'x', kinds: ['image'], label: '修图' }])).toBe(true)
    expect(shouldShowEditButton([])).toBe(false)
  })
})

describe('sessionFilesFingerprint', () => {
  it('changes when a new write appears so the library can refresh', () => {
    const first = sessionFilesFingerprint([{ id: 1, op: 'write', path: '/proj/a.png' }])
    const second = sessionFilesFingerprint([
      { id: 1, op: 'write', path: '/proj/a.png' },
      { id: 2, op: 'write', path: '/proj/b.png' }
    ])
    expect(first).not.toBe(second)
  })
})

describe('sortMaterialsByRecency', () => {
  it('orders by mtime descending with relativePath as the stable tiebreak', () => {
    const sorted = sortMaterialsByRecency([
      item('image', 'a.png', 10),
      item('image', 'c.png', 30),
      item('image', 'b.png', 30),
      item('image', 'd.png', 20)
    ])
    expect(sorted.map((i) => i.relativePath)).toEqual(['b.png', 'c.png', 'd.png', 'a.png'])
  })

  it('does not mutate the input', () => {
    const items = [item('image', 'a.png', 1), item('image', 'b.png', 2)]
    sortMaterialsByRecency(items)
    expect(items.map((i) => i.relativePath)).toEqual(['a.png', 'b.png'])
  })
})

describe('canvasColumnsFor', () => {
  it('scales columns with viewport width and zoom level', () => {
    const step = CANVAS_CARD_W + CANVAS_GAP
    expect(canvasColumnsFor(step * 3 + CANVAS_GAP, 1)).toBe(3)
    expect(canvasColumnsFor(step * 3 + CANVAS_GAP, 2)).toBe(1)
    expect(canvasColumnsFor(400, 0.1)).toBeGreaterThan(3)
    expect(canvasColumnsFor(0, 1)).toBe(1)
  })
})

describe('layoutMaterials', () => {
  it('lays items out in a grid from the origin and reports the plane size', () => {
    const items = ['1.png', '2.png', '3.png', '4.png', '5.png'].map((n) => item('image', n))
    const { placed, columns, width, height } = layoutMaterials(items, 3)
    expect(columns).toBe(3)
    expect(placed[0]).toMatchObject({ x: 0, y: 0, w: CANVAS_CARD_W, h: CANVAS_CARD_H })
    expect(placed[2].x).toBe((CANVAS_CARD_W + CANVAS_GAP) * 2)
    expect(placed[3]).toMatchObject({ x: 0, y: CANVAS_CARD_H + CANVAS_GAP })
    expect(width).toBe(CANVAS_CARD_W * 3 + CANVAS_GAP * 2)
    expect(height).toBe(CANVAS_CARD_H * 2 + CANVAS_GAP)
  })

  it('keeps existing placements stable when new items are prepended', () => {
    const first = layoutMaterials([item('image', 'a.png'), item('image', 'b.png')], 3)
    const second = layoutMaterials(
      [item('image', 'new.png'), item('image', 'a.png'), item('image', 'b.png')],
      3
    )
    // 序列顺序保持；已有项整体顺移一格，不重排
    expect(second.placed.map((p) => p.item.relativePath)).toEqual(['new.png', 'a.png', 'b.png'])
    const step = CANVAS_CARD_W + CANVAS_GAP
    expect(second.placed[1].x).toBe(first.placed[0].x + step)
    expect(second.placed[1].y).toBe(first.placed[0].y)
    expect(second.placed[2].x).toBe(first.placed[1].x + step)
    expect(second.placed[2].y).toBe(first.placed[1].y)
  })

  it('clamps columns to at least one', () => {
    const { placed } = layoutMaterials([item('image', 'a.png')], 0)
    expect(placed[0]).toMatchObject({ x: 0, y: 0 })
  })
})

describe('visiblePlaced', () => {
  const plane = layoutMaterials(
    Array.from({ length: 400 }, (_, i) => item('image', `${i}.png`)),
    20
  )

  it('mounts only cards intersecting the viewport plus buffer', () => {
    const view = { x: 0, y: 0, width: 800, height: 600 }
    const visible = visiblePlaced(plane.placed, view)
    expect(visible.length).toBeGreaterThan(0)
    expect(visible.length).toBeLessThan(plane.placed.length / 4)
    for (const p of visible) {
      const withinBuffer =
        p.x < view.x + view.width + CANVAS_BUFFER &&
        p.x + p.w > view.x - CANVAS_BUFFER &&
        p.y < view.y + view.height + CANVAS_BUFFER &&
        p.y + p.h > view.y - CANVAS_BUFFER
      expect(withinBuffer).toBe(true)
    }
  })

  it('mounts nothing when the viewport is far away', () => {
    const visible = visiblePlaced(plane.placed, { x: 999999, y: 999999, width: 100, height: 100 })
    expect(visible).toHaveLength(0)
  })
})

describe('clampScale / clampViewport', () => {
  it('clamps scale into the allowed range and non-finite to default', () => {
    expect(clampScale(0.01)).toBeCloseTo(0.1)
    expect(clampScale(99)).toBe(3)
    expect(clampScale(NaN)).toBe(DEFAULT_VIEWPORT.scale)
  })

  it('clamps pan coordinates to the canvas bounds', () => {
    const v = clampViewport({ x: CANVAS_MAX_COORD * 2, y: -CANVAS_MAX_COORD * 2, scale: NaN })
    expect(v.x).toBe(CANVAS_MAX_COORD)
    expect(v.y).toBe(-CANVAS_MAX_COORD)
    expect(v.scale).toBe(DEFAULT_VIEWPORT.scale)
  })
})

describe('screenToWorld / zoomViewportAt / panViewport', () => {
  it('keeps the anchor point fixed while zooming', () => {
    const v = { x: 100, y: 50, scale: 1 }
    const world = screenToWorld(v, 400, 300)
    const zoomed = zoomViewportAt(v, 2, 400, 300)
    const after = screenToWorld(zoomed, 400, 300)
    expect(after.x).toBeCloseTo(world.x)
    expect(after.y).toBeCloseTo(world.y)
    expect(zoomed.scale).toBe(2)
  })

  it('converts screen drag deltas into inverse world pan', () => {
    const panned = panViewport({ x: 0, y: 0, scale: 2 }, 100, -50)
    expect(panned.x).toBe(-50)
    expect(panned.y).toBe(25)
  })

  it('scrolls the viewport along the wheel direction without zooming', () => {
    const v = { x: 10, y: 20, scale: 2 }
    const scrolled = scrollViewport(v, 100, -50)
    expect(scrolled.scale).toBe(2)
    expect(scrolled.x).toBe(60)
    expect(scrolled.y).toBe(-5)
  })
})

describe('mentionQueryBefore', () => {
  it('returns the token after a leading or whitespace-prefixed @', () => {
    expect(mentionQueryBefore('@', 1)).toBe('')
    expect(mentionQueryBefore('@tex', 4)).toBe('tex')
    expect(mentionQueryBefore('看看 @texture_00', 16)).toBe('texture_00')
    expect(mentionQueryBefore('a\n@b', 4)).toBe('b')
  })

  it('returns null when the @ is not at a token start or is already closed', () => {
    expect(mentionQueryBefore('mail@example.com', 16)).toBeNull()
    expect(mentionQueryBefore('引用 @a.png 后', 15)).toBeNull()
    expect(mentionQueryBefore('no mention', 10)).toBeNull()
  })
})

describe('materialSourceUrl', () => {
  it('embeds project id and encoded abs path under the fixed host', () => {
    const src = materialSourceUrl('p/1', '/proj/a.png')
    expect(src.startsWith('shy-material://m/')).toBe(true)
    expect(src).toContain(encodeURIComponent('p/1'))
    expect(src).toContain(encodeURIComponent('/proj/a.png'))
  })
})

describe('extOf / isInlineDoc', () => {
  it('extracts the lowercased extension and flags inline-readable docs', () => {
    expect(extOf(item('doc', 'a.PDF'))).toBe('pdf')
    expect(isInlineDoc(item('doc', 'a.pdf'))).toBe(true)
    expect(isInlineDoc(item('doc', 'a.md'))).toBe(true)
    expect(isInlineDoc(item('doc', 'a.txt'))).toBe(true)
    expect(isInlineDoc(item('doc', 'a.docx'))).toBe(false)
    expect(extOf(item('other', 'noext'))).toBe('')
  })
})
