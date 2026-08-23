import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const recorded: Array<{
  sessionId: string
  path: string
  op: string
  added: number
  removed: number
  diffText: string
  snapshotPath: string | null
}> = []
vi.mock('../memory/db', () => ({
  recordDiff: (input: (typeof recorded)[number]) => {
    recorded.push(input)
    return { id: recorded.length, occurredAt: Date.now(), ...input }
  },
  recordFileOp: () => undefined,
  upsertLongMemory: () => undefined,
  deleteLongMemory: () => undefined,
  listLongMemory: () => []
}))

let home: string
beforeEach(async () => {
  recorded.length = 0
  home = await mkdtemp(join(tmpdir(), 'shy-diff-'))
  process.env.SHY_HOME = home
})

import { captureWriteDiff, captureDeleteDiff } from './capture'
import { registerBuiltinTools } from '../agent/tools/builtin'
import { buildTools } from '../agent/tools/registry'

describe('diff capture', () => {
  it('覆盖写已有文件：记录 diff + 旧内容快照落盘', async () => {
    const file = join(home, 'a.txt')
    await writeFile(file, 'hello\nworld', 'utf8')
    await captureWriteDiff('ses-1', file, 'hello\nshy')
    expect(recorded).toHaveLength(1)
    expect(recorded[0].op).toBe('write')
    expect(recorded[0].added).toBe(1)
    expect(recorded[0].removed).toBe(1)
    expect(recorded[0].diffText).toContain('-world')
    expect(recorded[0].diffText).toContain('+shy')
    expect(recorded[0].snapshotPath).toBeTruthy()
    expect(await readFile(recorded[0].snapshotPath!, 'utf8')).toBe('hello\nworld')
  })

  it('新文件：不记录（无旧内容可比）', async () => {
    await captureWriteDiff('ses-1', join(home, 'new.txt'), 'x')
    expect(recorded).toHaveLength(0)
  })

  it('删除：全量删除 diff', async () => {
    const file = join(home, 'del.txt')
    await writeFile(file, 'a\nb\nc', 'utf8')
    await captureDeleteDiff('ses-1', file)
    expect(recorded).toHaveLength(1)
    expect(recorded[0].op).toBe('delete')
    expect(recorded[0].removed).toBe(3)
    expect(recorded[0].added).toBe(0)
  })

  it('大文件（>2MB）跳过', async () => {
    const file = join(home, 'big.txt')
    await writeFile(file, 'x'.repeat(2 * 1024 * 1024 + 100), 'utf8')
    await captureWriteDiff('ses-1', file, 'y')
    expect(recorded).toHaveLength(0)
  })

  it('fs_write 接入验证：builtin 工具覆盖写触发 capture', async () => {
    const ws = join(home, 'ws')
    await mkdir(ws, { recursive: true })
    const ctx = {
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-tool',
      workspaceDir: ws
    }
    registerBuiltinTools()
    const tools = buildTools(ctx)
    const fsWrite = tools.find((t) => t.name === 'fs_write')
    if (!fsWrite) throw new Error('fs_write 未注册')
    await fsWrite.run({ path: 'doc.md', content: 'v1\nv2' })
    await fsWrite.run({ path: 'doc.md', content: 'v1\nV2' })
    const toolRecord = recorded.find((r) => r.sessionId === 'ses-tool')
    expect(toolRecord).toBeTruthy()
    expect(toolRecord!.diffText).toContain('-v2')
    expect(toolRecord!.diffText).toContain('+V2')
  })
})

afterEach(async () => {
  delete process.env.SHY_HOME
  await rm(home, { recursive: true, force: true })
})
