import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../../../shared/ipc'
import { filterTreeByName, previewKind } from './filePreview'

describe('previewKind', () => {
  it('按扩展名分流', () => {
    expect(previewKind('a.md')).toBe('markdown')
    expect(previewKind('notes.markdown')).toBe('markdown')
    expect(previewKind('a.png')).toBe('image')
    expect(previewKind('shot.JPEG')).toBe('image')
    expect(previewKind('a.html')).toBe('html')
    expect(previewKind('index.htm')).toBe('html')
    expect(previewKind('readme.txt')).toBe('text')
    expect(previewKind('src/app.ts')).toBe('text')
    expect(previewKind('a.bin')).toBe('other')
    expect(previewKind('archive.zip')).toBe('other')
  })
})

describe('filterTreeByName', () => {
  const tree: TreeNode[] = [
    {
      name: 'docs',
      path: '/w/docs',
      type: 'dir',
      children: [
        { name: 'guide.md', path: '/w/docs/guide.md', type: 'file' },
        { name: 'secret.bin', path: '/w/docs/secret.bin', type: 'file' }
      ]
    },
    { name: 'readme.md', path: '/w/readme.md', type: 'file' }
  ]

  it('空查询原样返回', () => {
    expect(filterTreeByName(tree, '  ')).toEqual(tree)
  })

  it('保留匹配文件及其父目录', () => {
    const filtered = filterTreeByName(tree, 'guide')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.name).toBe('docs')
    expect(filtered[0]?.children?.map((c) => c.name)).toEqual(['guide.md'])
  })
})
