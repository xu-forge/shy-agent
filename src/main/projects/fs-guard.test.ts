import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TREE_IGNORE,
  TREE_NODE_LIMIT,
  assertInsideRoot,
  importMaterial,
  kindFromName,
  listMaterials,
  listProjectTree,
  readFileAsDataUrl,
  type TreeNode
} from './fs-guard'

let tmpDir = ''
let root = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-fs-'))
  root = join(tmpDir, 'proj')
  mkdirSync(root)
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...(n.children ? flatten(n.children) : [])])
}

describe('TREE_IGNORE / TREE_NODE_LIMIT', () => {
  it('matches spec ignore names and node cap', () => {
    expect(TREE_IGNORE).toEqual([
      'node_modules',
      '.git',
      'dist',
      'out',
      '.next',
      'coverage',
      '.shy'
    ])
    expect(TREE_NODE_LIMIT).toBe(5000)
  })
})

describe('assertInsideRoot', () => {
  it('throws path_escape when target walks out with ..', () => {
    expect(() => assertInsideRoot(root, join(root, '..', 'outside'))).toThrow(/path_escape/)
    expect(() => assertInsideRoot(root, '../secret')).toThrow(/path_escape/)
  })

  it('returns resolved absolute path when target is inside', () => {
    const inside = join(root, 'src', 'a.ts')
    mkdirSync(join(root, 'src'))
    writeFileSync(inside, 'x')
    expect(assertInsideRoot(root, inside)).toBe(resolve(inside))
    expect(assertInsideRoot(root, join('src', 'a.ts'))).toBe(resolve(inside))
    expect(assertInsideRoot(root, root)).toBe(resolve(root))
    expect(assertInsideRoot(root, '.')).toBe(resolve(root))
  })
})

describe('listProjectTree', () => {
  it('ignores node_modules and other TREE_IGNORE dirs', () => {
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}')
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = {}')
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'HEAD'), 'ref')

    const { tree, truncated } = listProjectTree(root)
    expect(truncated).toBe(false)
    const names = flatten(tree).map((n) => n.name)
    expect(names).toContain('src')
    expect(names).toContain('index.ts')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('pkg')
    expect(names).not.toContain('.git')
    expect(names).not.toContain('HEAD')
  })

  it('truncates when entries exceed TREE_NODE_LIMIT', () => {
    for (let i = 0; i < TREE_NODE_LIMIT + 1; i++) {
      writeFileSync(join(root, `f${String(i).padStart(4, '0')}`), '')
    }
    const { tree, truncated } = listProjectTree(root)
    expect(truncated).toBe(true)
    expect(tree.length).toBe(TREE_NODE_LIMIT)
  })
})

describe('kindFromName', () => {
  it('maps png to image and other extensions per spec', () => {
    expect(kindFromName('a.png')).toBe('image')
    expect(kindFromName('b.jpg')).toBe('image')
    expect(kindFromName('c.jpeg')).toBe('image')
    expect(kindFromName('d.webp')).toBe('image')
    expect(kindFromName('e.gif')).toBe('image')
    expect(kindFromName('f.mp4')).toBe('video')
    expect(kindFromName('g.mov')).toBe('video')
    expect(kindFromName('h.webm')).toBe('video')
    expect(kindFromName('i.mp3')).toBe('audio')
    expect(kindFromName('j.wav')).toBe('audio')
    expect(kindFromName('k.m4a')).toBe('audio')
    expect(kindFromName('l.pdf')).toBe('doc')
    expect(kindFromName('m.doc')).toBe('doc')
    expect(kindFromName('n.docx')).toBe('doc')
    expect(kindFromName('o.md')).toBe('doc')
    expect(kindFromName('p.txt')).toBe('doc')
    expect(kindFromName('q.bin')).toBe('other')
    expect(kindFromName('Photo.PNG')).toBe('image')
  })
})

describe('listMaterials', () => {
  it('classifies files and sets sourceSessionId when writes abs path matches', () => {
    writeFileSync(join(root, 'out.png'), 'img')
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'docs', 'note.md'), 'hi')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'skip.bin'), 'x')

    const outAbs = resolve(join(root, 'out.png'))
    const { items, truncated } = listMaterials(root, [{ path: outAbs, sessionId: 'sess-1' }])
    expect(truncated).toBe(false)
    const ids = items.map((i) => i.id)
    expect(ids).toContain('out.png')
    expect(ids).toContain('docs/note.md')
    expect(ids.some((id) => id.includes('skip.bin'))).toBe(false)

    const png = items.find((i) => i.id === 'out.png')
    expect(png?.kind).toBe('image')
    expect(png?.sourceSessionId).toBe('sess-1')
    expect(png?.mime).toBe('image/png')
    expect(png?.size).toBe(3)
    expect(png?.absPath).toBe(outAbs)

    const md = items.find((i) => i.id === 'docs/note.md')
    expect(md?.kind).toBe('doc')
    expect(md?.sourceSessionId).toBeUndefined()
  })

  it('truncates when files exceed TREE_NODE_LIMIT', () => {
    for (let i = 0; i < TREE_NODE_LIMIT + 1; i++) {
      writeFileSync(join(root, `m${String(i).padStart(4, '0')}.txt`), '')
    }
    const { items, truncated } = listMaterials(root)
    expect(truncated).toBe(true)
    expect(items.length).toBe(TREE_NODE_LIMIT)
  })
})

describe('importMaterial', () => {
  it('copies the source file into rootPath', () => {
    const source = join(tmpDir, 'x.png')
    writeFileSync(source, 'hello')
    const item = importMaterial(root, source)
    const dest = join(root, 'x.png')
    expect(existsSync(dest)).toBe(true)
    expect(readFileSync(dest, 'utf8')).toBe('hello')
    expect(item.kind).toBe('image')
    expect(item.id).toBe('x.png')
    expect(item.absPath).toBe(resolve(dest))
    expect(item.size).toBe(5)
  })

  it('appends a number when the destination name already exists', () => {
    writeFileSync(join(root, 'x.png'), 'old')
    const source = join(tmpDir, 'x.png')
    writeFileSync(source, 'new')
    const item = importMaterial(root, source)
    expect(basename(item.absPath)).toBe('x-1.png')
    expect(readFileSync(join(root, 'x.png'), 'utf8')).toBe('old')
    expect(readFileSync(item.absPath, 'utf8')).toBe('new')
  })
})

describe('readFileAsDataUrl', () => {
  it('returns a data URL for a file inside root', () => {
    writeFileSync(join(root, 'tiny.png'), 'PNGDATA')
    const url = readFileAsDataUrl(root, 'tiny.png')
    expect(url).toBe(`data:image/png;base64,${Buffer.from('PNGDATA').toString('base64')}`)
  })

  it('throws path_escape when the relative path walks out', () => {
    expect(() => readFileAsDataUrl(root, join('..', 'secret.png'))).toThrow(/path_escape/)
  })
})
