import { describe, expect, it } from 'vitest'
import type { MaterialItem, MaterialKind } from '../../../shared/ipc'
import { materialEditors } from '../components/material/registry'
import {
  KIND_CHIPS,
  filterMaterialsByKind,
  sessionFilesFingerprint,
  shouldShowEditButton,
  viewerModeForKind
} from './materialLibrary'

function item(kind: MaterialKind, name: string): MaterialItem {
  return {
    id: name,
    relativePath: name,
    absPath: `/proj/${name}`,
    kind,
    mime: 'application/octet-stream',
    mtimeMs: 1,
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

describe('viewerModeForKind', () => {
  it('previews images in-shell and opens everything else via the system', () => {
    expect(viewerModeForKind('image')).toBe('preview')
    expect(viewerModeForKind('video')).toBe('system')
    expect(viewerModeForKind('audio')).toBe('system')
    expect(viewerModeForKind('doc')).toBe('system')
    expect(viewerModeForKind('other')).toBe('system')
  })
})

describe('sessionFilesFingerprint', () => {
  it('changes when a new write appears so the library can refresh', () => {
    const first = sessionFilesFingerprint([
      { id: 1, op: 'write', path: '/proj/a.png' }
    ])
    const second = sessionFilesFingerprint([
      { id: 1, op: 'write', path: '/proj/a.png' },
      { id: 2, op: 'write', path: '/proj/b.png' }
    ])
    expect(first).not.toBe(second)
  })
})
