import { describe, expect, it } from 'vitest'
import type { SessionFileRecord } from '../../../shared/ipc'
import {
  AGENT_CONFLICT_HINT,
  detectAgentWrites,
  languageFromPath,
  monacoThemeFromDataset,
  toRelativePath,
  writeHitsTab
} from './codeWorkspace'

function write(partial: Partial<SessionFileRecord> & { id: number; path: string }): SessionFileRecord {
  return {
    sessionId: 's1',
    op: 'write',
    occurredAt: 1,
    ...partial
  }
}

describe('monacoThemeFromDataset', () => {
  it('dark 用 vs-dark，其余用 vs', () => {
    expect(monacoThemeFromDataset('dark')).toBe('vs-dark')
    expect(monacoThemeFromDataset('light')).toBe('vs')
    expect(monacoThemeFromDataset(undefined)).toBe('vs')
  })
})

describe('toRelativePath', () => {
  it('把绝对路径收成相对 root 的 posix 路径', () => {
    expect(toRelativePath('/repo', '/repo/src/a.ts')).toBe('src/a.ts')
    expect(toRelativePath('C:\\repo', 'C:\\repo\\src\\a.ts')).toBe('src/a.ts')
    expect(toRelativePath('/repo', '/repo')).toBe('')
  })

  it('已是相对路径则原样规范化斜杠', () => {
    expect(toRelativePath('/repo', 'src/a.ts')).toBe('src/a.ts')
  })
})

describe('writeHitsTab', () => {
  it('绝对 write 路径命中相对 tab 路径', () => {
    expect(writeHitsTab('/repo/src/a.ts', 'src/a.ts', '/repo')).toBe(true)
    expect(writeHitsTab('/repo/src/b.ts', 'src/a.ts', '/repo')).toBe(false)
  })
})

describe('detectAgentWrites', () => {
  const tabs = [
    { relativePath: 'src/a.ts', dirty: false },
    { relativePath: 'src/b.ts', dirty: true }
  ]

  it('首次快照只记下 seenId，不刷新也不标冲突', () => {
    const writes = [write({ id: 3, path: '/repo/src/a.ts' }), write({ id: 4, path: '/repo/src/b.ts' })]
    const r = detectAgentWrites({
      tabs,
      writes,
      lastSeenId: null,
      rootPath: '/repo'
    })
    expect(r.reload).toEqual([])
    expect(r.conflict).toEqual([])
    expect(r.nextSeenId).toBe(4)
  })

  it('新 write 命中干净 tab 则 reload，命中脏 tab 则 conflict', () => {
    const writes = [
      write({ id: 5, path: '/repo/src/a.ts' }),
      write({ id: 6, path: '/repo/src/b.ts' }),
      write({ id: 7, op: 'read', path: '/repo/src/a.ts' })
    ]
    const r = detectAgentWrites({
      tabs,
      writes,
      lastSeenId: 4,
      rootPath: '/repo'
    })
    expect(r.reload).toEqual(['src/a.ts'])
    expect(r.conflict).toEqual(['src/b.ts'])
    expect(r.nextSeenId).toBe(7)
  })

  it('未命中打开 tab 的 write 忽略', () => {
    const r = detectAgentWrites({
      tabs,
      writes: [write({ id: 8, path: '/repo/other.ts' })],
      lastSeenId: 7,
      rootPath: '/repo'
    })
    expect(r.reload).toEqual([])
    expect(r.conflict).toEqual([])
    expect(r.nextSeenId).toBe(8)
  })

  it('首次空快照把 seenId 置 0，随后 write 仍能命中', () => {
    const first = detectAgentWrites({
      tabs,
      writes: [],
      lastSeenId: null,
      rootPath: '/repo'
    })
    expect(first.nextSeenId).toBe(0)
    const second = detectAgentWrites({
      tabs,
      writes: [write({ id: 1, path: '/repo/src/a.ts' })],
      lastSeenId: first.nextSeenId,
      rootPath: '/repo'
    })
    expect(second.reload).toEqual(['src/a.ts'])
  })
})

describe('languageFromPath', () => {
  it('按扩展名映射 Monaco language', () => {
    expect(languageFromPath('a.ts')).toBe('typescript')
    expect(languageFromPath('a.tsx')).toBe('typescript')
    expect(languageFromPath('a.js')).toBe('javascript')
    expect(languageFromPath('a.json')).toBe('json')
    expect(languageFromPath('a.md')).toBe('markdown')
    expect(languageFromPath('a.css')).toBe('css')
    expect(languageFromPath('a.py')).toBe('python')
    expect(languageFromPath('a.unknown')).toBe('plaintext')
  })
})

describe('AGENT_CONFLICT_HINT', () => {
  it('冲突条文案固定', () => {
    expect(AGENT_CONFLICT_HINT).toBe('Agent 已修改此文件，放弃本地更改以加载磁盘版本')
  })
})
