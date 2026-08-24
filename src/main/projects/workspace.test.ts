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
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-ws-'))
  process.env.SHY_HOME = tmpDir
  rootA = join(tmpDir, 'repo-a')
  mkdirSync(rootA)
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('resolveAgentWorkspace', () => {
  it('绑定项目后工作区是 rootPath', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject } = await import('./store')
    const { resolveAgentWorkspace } = await import('./workspace')
    const s = sessions.createSession()
    const p = createProject({ type: 'code', rootPath: rootA })
    bindSessionProject(s.id, p.id)
    expect(resolveAgentWorkspace(s.id)).toBe(rootA)
  })

  it('未绑定回退会话目录', async () => {
    const sessions = await import('../sessions/store')
    const { getDefaultSessionWorkspace } = await import('../paths')
    const { resolveAgentWorkspace } = await import('./workspace')
    const s = sessions.createSession()
    expect(resolveAgentWorkspace(s.id)).toBe(getDefaultSessionWorkspace(s.id))
  })

  it('项目已删除回退会话目录且不抛错', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject, deleteProject } = await import('./store')
    const { getDefaultSessionWorkspace } = await import('../paths')
    const { resolveAgentWorkspace } = await import('./workspace')
    const s = sessions.createSession()
    const p = createProject({ type: 'code', rootPath: rootA })
    bindSessionProject(s.id, p.id)
    expect(resolveAgentWorkspace(s.id)).toBe(rootA)
    deleteProject(p.id)
    expect(() => resolveAgentWorkspace(s.id)).not.toThrow()
    expect(resolveAgentWorkspace(s.id)).toBe(getDefaultSessionWorkspace(s.id))
  })

  it('会话不存在回退默认目录且不抛错', async () => {
    const { getDefaultSessionWorkspace } = await import('../paths')
    const { resolveAgentWorkspace } = await import('./workspace')
    const missingId = 'missing-session-id'
    expect(() => resolveAgentWorkspace(missingId)).not.toThrow()
    expect(resolveAgentWorkspace(missingId)).toBe(getDefaultSessionWorkspace(missingId))
  })
})
