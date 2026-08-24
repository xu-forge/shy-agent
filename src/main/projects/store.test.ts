import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''
let rootA = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-proj-'))
  process.env.SHY_HOME = tmpDir
  rootA = join(tmpDir, 'repo-a')
  mkdirSync(rootA)
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('projects store', () => {
  it('创建代码项目，name 默认 basename', async () => {
    const { createProject, getProject } = await import('./store')
    const p = createProject({ type: 'code', rootPath: rootA })
    expect(p.type).toBe('code')
    expect(p.name).toBe('repo-a')
    expect(getProject(p.id)?.rootPath).toBe(rootA)
  })

  it('重复 rootPath 拒绝', async () => {
    const { createProject } = await import('./store')
    createProject({ type: 'code', rootPath: rootA })
    expect(() => createProject({ type: 'material', rootPath: rootA })).toThrow(/root_path_taken/)
  })
})
