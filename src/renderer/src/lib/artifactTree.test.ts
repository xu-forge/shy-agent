import { describe, expect, it } from 'vitest'
import {
  artifactDisplayPath,
  buildArtifactTree,
  defaultSessionWorkspaceRoot
} from './artifactTree'

describe('defaultSessionWorkspaceRoot', () => {
  it('拼出 sessions/{id}/workspace', () => {
    expect(defaultSessionWorkspaceRoot('/Users/x/.shy', 'abc')).toBe(
      '/Users/x/.shy/sessions/abc/workspace'
    )
  })
})

describe('artifactDisplayPath', () => {
  const root = '/Users/x/.shy/sessions/s1/workspace'

  it('绝对路径收成工作区相对路径', () => {
    expect(artifactDisplayPath(root, `${root}/guides/a.html`)).toBe('guides/a.html')
  })

  it('已是相对路径则只保留文件名与目录', () => {
    expect(artifactDisplayPath(root, 'notes/todo.md')).toBe('notes/todo.md')
  })

  it('工作区外的绝对路径只保留文件名', () => {
    expect(artifactDisplayPath(root, '/tmp/other.html')).toBe('other.html')
  })
})

describe('buildArtifactTree', () => {
  const root = '/Users/x/.shy/sessions/s1/workspace'

  it('按目录嵌套，只露出相对目录与文件名', () => {
    const tree = buildArtifactTree(
      [
        { path: `${root}/guides/foshan.html` },
        { path: `${root}/guides/tips.md` },
        { path: `${root}/index.html` }
      ],
      root
    )
    expect(tree).toEqual([
      {
        type: 'dir',
        name: 'guides',
        path: 'guides',
        children: [
          {
            type: 'file',
            name: 'foshan.html',
            path: 'guides/foshan.html',
            absPath: `${root}/guides/foshan.html`
          },
          {
            type: 'file',
            name: 'tips.md',
            path: 'guides/tips.md',
            absPath: `${root}/guides/tips.md`
          }
        ]
      },
      {
        type: 'file',
        name: 'index.html',
        path: 'index.html',
        absPath: `${root}/index.html`
      }
    ])
  })

  it('同一相对路径只保留一条', () => {
    const tree = buildArtifactTree(
      [{ path: `${root}/a.html` }, { path: `${root}/a.html` }],
      root
    )
    expect(tree).toHaveLength(1)
    expect(tree[0]).toMatchObject({ type: 'file', name: 'a.html' })
  })
})
