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

  it('首条消息前可绑定，绑定后拒绝再绑', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject } = await import('./store')
    const s = sessions.createSession('interactive', 't')
    const p = createProject({ type: 'code', rootPath: rootA })
    expect(bindSessionProject(s.id, p.id).ok).toBe(true)
    expect(bindSessionProject(s.id, p.id)).toEqual({ ok: false, error: 'already_bound' })
  })

  it('会话不存在则返回 not_found', async () => {
    const { createProject, bindSessionProject } = await import('./store')
    const p = createProject({ type: 'code', rootPath: rootA })
    expect(bindSessionProject('missing-session', p.id)).toEqual({ ok: false, error: 'not_found' })
  })

  it('项目不存在则返回 not_found', async () => {
    const sessions = await import('../sessions/store')
    const { bindSessionProject } = await import('./store')
    const s = sessions.createSession('interactive', 't')
    expect(bindSessionProject(s.id, 'missing-project')).toEqual({ ok: false, error: 'not_found' })
  })

  it('已有用户消息则拒绝绑定', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject } = await import('./store')
    const s = sessions.createSession('interactive', 't')
    sessions.appendMessage(s.id, 'user', 'hi')
    const p = createProject({ type: 'code', rootPath: rootA })
    expect(bindSessionProject(s.id, p.id)).toEqual({ ok: false, error: 'has_messages' })
  })

  it('删项目后会话 projectId 为空且消息仍在', async () => {
    const sessions = await import('../sessions/store')
    const { createProject, bindSessionProject, deleteProject } = await import('./store')
    const s = sessions.createSession('interactive', 't')
    const p = createProject({ type: 'code', rootPath: rootA })
    bindSessionProject(s.id, p.id)
    sessions.appendMessage(s.id, 'user', 'hi')
    deleteProject(p.id)
    const d = sessions.getSession(s.id)
    expect(d?.projectId ?? null).toBeNull()
    expect(d?.messages.some((m) => m.role === 'user')).toBe(true)
  })
})
