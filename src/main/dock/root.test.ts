import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''
let rootA = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-dock-'))
  process.env.SHY_HOME = tmpDir
  rootA = join(tmpDir, 'repo-a')
  mkdirSync(rootA)
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('ensureDockRoot', () => {
  it('未绑定则创建会话 workspace 并返回该路径', async () => {
    const sessions = await import('../sessions/store')
    const { getDefaultSessionWorkspace } = await import('../paths')
    const { ensureDockRoot } = await import('./root')
    const s = sessions.createSession()
    const expected = getDefaultSessionWorkspace(s.id)
    expect(existsSync(expected)).toBe(false)
    expect(ensureDockRoot(s.id)).toBe(expected)
    expect(existsSync(expected)).toBe(true)
  })

  it('已绑定则返回项目 rootPath', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject } = await import('../projects/store')
    const { ensureDockRoot } = await import('./root')
    const s = sessions.createSession()
    const p = createProject({ type: 'code', rootPath: rootA })
    bindSessionProject(s.id, p.id)
    expect(ensureDockRoot(s.id)).toBe(rootA)
  })

  it('列树忽略 node_modules，相对路径逃逸会抛错', async () => {
    const { writeFileSync, mkdirSync } = await import('fs')
    const sessions = await import('../sessions/store')
    const { listDockTree, resolveDockFile } = await import('./root')
    const s = sessions.createSession()
    const root = (await import('./root')).ensureDockRoot(s.id)
    writeFileSync(join(root, 'notes.md'), '# hi')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'x.js'), 'x')
    const listed = listDockTree(s.id)
    expect(listed.rootPath).toBe(root)
    expect(listed.tree.map((n) => n.name)).toEqual(['notes.md'])
    expect(() => resolveDockFile(s.id, '../secret.txt')).toThrow('path_escape')
  })
})
