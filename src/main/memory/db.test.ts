import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// ⚠️ 暂时跳过：better-sqlite3 native binary 在本机当前 Node 环境下加载即 crash (0xC0000005)。
//    已尝试 npm rebuild 但 prebuilt 仍不兼容 Node 22。spec/tasks.md 标注此偏差。
//    待用户环境修复后去掉 .skip 即可恢复。

// 必须 hoist 到 import 之前；把 electron.app.getPath 重定向到临时目录
vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'my-agent-db-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

async function loadDb(): Promise<typeof import('./db')> {
  return import('./db')
}

describe.skip('session_files', () => {
  it('记录并列出文件操作（按时间倒序）', async () => {
    const db = await loadDb()
    const a = db.recordFileOp('s1', 'read', 'C:/a.txt')
    await new Promise((r) => setTimeout(r, 2))
    const b = db.recordFileOp('s1', 'write', 'C:/b.txt')
    expect(a.id).toBeGreaterThan(0)
    expect(b.id).toBeGreaterThan(a.id)
    const list = db.listSessionFiles('s1')
    expect(list).toHaveLength(2)
    expect(list[0]?.path).toBe('C:/b.txt') // 最新在前
    expect(list[1]?.path).toBe('C:/a.txt')
    expect(list[0]?.op).toBe('write')
  })

  it('按 sessionId 隔离', async () => {
    const db = await loadDb()
    db.recordFileOp('s1', 'read', 'C:/a.txt')
    db.recordFileOp('s2', 'write', 'C:/b.txt')
    expect(db.listSessionFiles('s1')).toHaveLength(1)
    expect(db.listSessionFiles('s2')).toHaveLength(1)
    expect(db.listSessionFiles('s-other')).toHaveLength(0)
  })

  it('op 字段持久化为枚举值', async () => {
    const db = await loadDb()
    db.recordFileOp('s1', 'delete', 'C:/a.txt')
    const [row] = db.listSessionFiles('s1')
    expect(row?.op).toBe('delete')
  })
})

describe.skip('session_tasks', () => {
  it('upsert 首次插入', async () => {
    const db = await loadDb()
    const t = db.upsertSessionTask({
      id: 't1',
      sessionId: 's1',
      title: '步骤 1',
      source: 'goal'
    })
    expect(t.id).toBe('t1')
    expect(t.title).toBe('步骤 1')
    expect(t.done).toBe(false)
    expect(t.source).toBe('goal')
    expect(t.occurredAt).toBeGreaterThan(0)
    expect(t.updatedAt).toBe(t.occurredAt)
  })

  it('upsert 同 id 第二次为 update（不重置 occurred_at，更新 updated_at）', async () => {
    const db = await loadDb()
    const first = db.upsertSessionTask({
      id: 't1',
      sessionId: 's1',
      title: '原标题',
      source: 'goal'
    })
    await new Promise((r) => setTimeout(r, 3))
    const second = db.upsertSessionTask({
      id: 't1',
      sessionId: 's1',
      title: '新标题',
      done: true,
      source: 'goal'
    })
    expect(second.title).toBe('新标题')
    expect(second.done).toBe(true)
    expect(second.occurredAt).toBe(first.occurredAt) // 保留
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt)
  })

  it('updateSessionTaskDone 仅切换 done + 刷新 updated_at', async () => {
    const db = await loadDb()
    db.upsertSessionTask({ id: 't1', sessionId: 's1', title: 'X', source: 'goal' })
    const t0 = db.listSessionTasks('s1')[0]!
    await new Promise((r) => setTimeout(r, 3))
    const t1 = db.updateSessionTaskDone('s1', 't1', true, '已做')
    expect(t1?.done).toBe(true)
    expect(t1?.evidence).toBe('已做')
    expect(t1?.updatedAt).toBeGreaterThanOrEqual(t0.updatedAt)
    expect(t1?.title).toBe(t0.title)
  })

  it('updateSessionTaskDone 跨 sessionId 不命中', async () => {
    const db = await loadDb()
    db.upsertSessionTask({ id: 't1', sessionId: 's1', title: 'X', source: 'goal' })
    expect(db.updateSessionTaskDone('s2', 't1', true)).toBeNull()
    expect(db.listSessionTasks('s1')[0]?.done).toBe(false)
  })

  it('deleteSessionTask 命中返回 true', async () => {
    const db = await loadDb()
    db.upsertSessionTask({ id: 't1', sessionId: 's1', title: 'X', source: 'goal' })
    expect(db.deleteSessionTask('s1', 't1')).toBe(true)
    expect(db.listSessionTasks('s1')).toHaveLength(0)
  })

  it('deleteSessionTask 不存在返回 false', async () => {
    const db = await loadDb()
    expect(db.deleteSessionTask('s1', 'nope')).toBe(false)
  })

  it('listSessionTasks 按 updated_at 倒序', async () => {
    const db = await loadDb()
    db.upsertSessionTask({ id: 't1', sessionId: 's1', title: 'A', source: 'goal' })
    await new Promise((r) => setTimeout(r, 2))
    db.upsertSessionTask({ id: 't2', sessionId: 's1', title: 'B', source: 'agent' })
    await new Promise((r) => setTimeout(r, 2))
    db.updateSessionTaskDone('s1', 't1', true)
    const list = db.listSessionTasks('s1')
    expect(list.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('source 字段正确持久化', async () => {
    const db = await loadDb()
    db.upsertSessionTask({ id: 'g1', sessionId: 's1', title: '目标步骤', source: 'goal' })
    db.upsertSessionTask({ id: 'a1', sessionId: 's1', title: 'Agent 子任务', source: 'agent' })
    const list = db.listSessionTasks('s1')
    const g = list.find((t) => t.id === 'g1')!
    const a = list.find((t) => t.id === 'a1')!
    expect(g.source).toBe('goal')
    expect(a.source).toBe('agent')
  })
})

describe.skip('migration 幂等', () => {
  it('重复 getDb 不抛错', async () => {
    const db1 = await loadDb()
    db1.getDb()
    db1.getDb()
    const db2 = await loadDb()
    expect(() => db2.getDb()).not.toThrow()
    // 表与 helper 仍可用
    db2.recordFileOp('s1', 'read', 'C:/x')
    db2.upsertSessionTask({ id: 't', sessionId: 's1', title: 'x', source: 'goal' })
    expect(db2.listSessionFiles('s1')).toHaveLength(1)
    expect(db2.listSessionTasks('s1')).toHaveLength(1)
  })

  it('同一进程多次 resetModules 重建 DB 实例都成功建表', async () => {
    for (let i = 0; i < 3; i += 1) {
      vi.resetModules()
      const db = await loadDb()
      db.recordFileOp('s1', 'read', `C:/${i}.txt`)
      expect(db.listSessionFiles('s1')).toHaveLength(1)
    }
  })
})
