import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-subagent-store-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('subagent task store', () => {
  it('创建任务并落库（status=queued, 计数器为 0）', async () => {
    const store = await import('./store')
    const t = store.createSubagentTask({
      parentSessionId: 'ses-1',
      description: '调研 A 股',
      prompt: '列出最近 30 天成交额前 10 的 A 股',
      subagentType: 'explore'
    })

    expect(t.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(t.status).toBe('queued')
    expect(t.tokenUsed).toBe(0)
    expect(t.rounds).toBe(0)
    expect(t.createdAt).toBeGreaterThan(0)

    const fetched = store.getSubagentTask(t.id)
    expect(fetched).toEqual(t)
  })

  it('updateSubagentTask 合并 patch 并持久化', async () => {
    const store = await import('./store')
    const t = store.createSubagentTask({
      parentSessionId: 'ses-1',
      description: '验证',
      prompt: 'p',
      subagentType: 'verifier'
    })

    const next = store.updateSubagentTask(t.id, {
      status: 'running',
      startedAt: 1000,
      tokenUsed: 250,
      rounds: 1
    })
    expect(next?.status).toBe('running')
    expect(next?.startedAt).toBe(1000)
    expect(next?.tokenUsed).toBe(250)
    expect(next?.rounds).toBe(1)

    const final = store.updateSubagentTask(t.id, {
      status: 'completed',
      output: 'OK',
      completedAt: 2000
    })
    expect(final?.status).toBe('completed')
    expect(final?.output).toBe('OK')
    expect(final?.tokenUsed).toBe(250) // 累积
  })

  it('listSubagentTasks 按 parent 过滤 + 倒序', async () => {
    const store = await import('./store')
    store.createSubagentTask({ parentSessionId: 'ses-A', description: 'A1', prompt: 'p', subagentType: 'explore' })
    await new Promise((r) => setTimeout(r, 5))
    store.createSubagentTask({ parentSessionId: 'ses-A', description: 'A2', prompt: 'p', subagentType: 'explore' })
    store.createSubagentTask({ parentSessionId: 'ses-B', description: 'B1', prompt: 'p', subagentType: 'worker' })

    const aTasks = store.listSubagentTasks('ses-A')
    expect(aTasks).toHaveLength(2)
    expect(aTasks[0]?.description).toBe('A2') // 倒序
    expect(aTasks[1]?.description).toBe('A1')

    const all = store.listSubagentTasks()
    expect(all).toHaveLength(3)
  })

  it('listRunningSubagentTasks 只返回 queued/running', async () => {
    const store = await import('./store')
    const t1 = store.createSubagentTask({ parentSessionId: 's', description: 'r1', prompt: 'p', subagentType: 'explore' })
    const t2 = store.createSubagentTask({ parentSessionId: 's', description: 'r2', prompt: 'p', subagentType: 'explore' })
    const t3 = store.createSubagentTask({ parentSessionId: 's', description: 'r3', prompt: 'p', subagentType: 'explore' })

    store.updateSubagentTask(t2.id, { status: 'running' })
    store.updateSubagentTask(t3.id, { status: 'completed' })

    const running = store.listRunningSubagentTasks()
    expect(running.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort())
  })

  it('cancelSubagentTask 仅对 queued/running 生效,其他状态返回原 task', async () => {
    const store = await import('./store')
    const t1 = store.createSubagentTask({ parentSessionId: 's', description: 'a', prompt: 'p', subagentType: 'explore' })
    const t2 = store.createSubagentTask({ parentSessionId: 's', description: 'b', prompt: 'p', subagentType: 'explore' })
    store.updateSubagentTask(t2.id, { status: 'completed', output: 'done' })

    const cancelled = store.cancelSubagentTask(t1.id)
    expect(cancelled?.status).toBe('cancelled')
    expect(cancelled?.completedAt).toBeGreaterThan(0)
    expect(cancelled?.error).toBe('已取消')

    const noop = store.cancelSubagentTask(t2.id)
    expect(noop?.status).toBe('completed') // 已完成,不变
  })

  it('deleteSubagentTask 真正删行', async () => {
    const store = await import('./store')
    const t = store.createSubagentTask({ parentSessionId: 's', description: 'x', prompt: 'p', subagentType: 'explore' })
    expect(store.deleteSubagentTask(t.id)).toBe(true)
    expect(store.getSubagentTask(t.id)).toBeNull()
    expect(store.deleteSubagentTask('missing-id')).toBe(false)
  })
})
