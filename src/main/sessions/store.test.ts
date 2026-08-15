import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-session-store-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('sessions runStatus', () => {
  it('新会话默认为 idle，paused 为 false', async () => {
    const store = await import('./store')
    const s = store.createSession('goal', 't')
    const d = store.getSession(s.id)
    expect(d?.runStatus).toBe('idle')
    expect(d?.paused).toBe(false)
  })

  it('paused=1 的旧行迁移为 runStatus=paused', async () => {
    const { getDb } = await import('../memory/db')
    const store = await import('./store')
    store.ensureSessionTables()
    const db = getDb()
    db.exec(`
      INSERT INTO sessions (id, title, mode, goal, checklist, short_memory, paused, created_at, updated_at)
      VALUES ('old-p', 'old', 'goal', 'g', '[]', '', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `)
    store.ensureSessionTables()
    const d = store.getSession('old-p')
    expect(d?.runStatus).toBe('paused')
    expect(d?.paused).toBe(true)
  })

  it('未暂停的旧行迁移为 idle，即使有 checkpoint', async () => {
    const { getDb } = await import('../memory/db')
    const store = await import('./store')
    store.ensureSessionTables()
    const db = getDb()
    db.exec(`
      INSERT INTO sessions (id, title, mode, goal, checklist, short_memory, paused, checkpoint, created_at, updated_at)
      VALUES ('old-c', 'old', 'goal', 'g', '[]', '', 0, '{"round":1}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `)
    store.ensureSessionTables()
    const d = store.getSession('old-c')
    expect(d?.runStatus).toBe('idle')
  })

  it('更新并读取 runtime 验收字段', async () => {
    const store = await import('./store')
    const s = store.createSession('goal', 'runtime')

    store.updateSessionRuntime(s.id, {
      verifyCommand: 'npm test',
      runStatus: 'running',
      approvedChecks: ['npm test']
    })

    expect(store.getSession(s.id)).toMatchObject({
      verifyCommand: 'npm test',
      runStatus: 'running',
      paused: false,
      approvedChecks: ['npm test']
    })
  })

  it('runStatus 与旧 paused 字段双向同步', async () => {
    const store = await import('./store')
    const s = store.createSession('goal', 'pause')

    store.updateSessionRuntime(s.id, { runStatus: 'paused' })
    expect(store.getSession(s.id)).toMatchObject({ runStatus: 'paused', paused: true })

    store.updateSessionRuntime(s.id, { paused: false })
    expect(store.getSession(s.id)).toMatchObject({ runStatus: 'running', paused: false })

    store.updateSessionRuntime(s.id, { paused: true })
    expect(store.getSession(s.id)).toMatchObject({ runStatus: 'paused', paused: true })
  })

  it('按 runStatus 仅列出 goal 会话', async () => {
    const store = await import('./store')
    const running = store.createSession('goal', 'running')
    const paused = store.createSession('goal', 'paused')
    const interactive = store.createSession('interactive', 'interactive')
    store.updateSessionRuntime(running.id, { runStatus: 'running' })
    store.updateSessionRuntime(paused.id, { runStatus: 'paused' })
    store.updateSessionRuntime(interactive.id, { runStatus: 'running' })

    expect(store.listGoalSessionsByRunStatus('running').map((s) => s.id)).toEqual([running.id])
  })
})
