import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtemp, rm, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join, isAbsolute } from 'path'
import { registerBuiltinTools, resolveWorkspacePath } from './builtin'
import { buildTools } from './registry'

// recordFileOp 会写 sqlite；mock 掉（本测试只关心路径语义）
vi.mock('../../memory/db', () => ({
  recordFileOp: () => undefined,
  upsertLongMemory: () => undefined,
  deleteLongMemory: () => undefined,
  listLongMemory: () => []
}))

let ws: string
let ctx: Parameters<typeof buildTools>[0]

beforeEach(async () => {
  ws = await mkdtemp(join(tmpdir(), 'shy-ws-'))
  ctx = {
    emit: () => undefined,
    confirmHighRisk: async () => true,
    sessionId: 'ses-ws-test',
    workspaceDir: ws
  }
})

afterAll(async () => {
  await rm(ws, { recursive: true, force: true })
})

describe('resolveWorkspacePath', () => {
  it('相对路径解析到工作区，绝对路径原样', () => {
    expect(resolveWorkspacePath('/ws', 'a/b.md')).toBe('/ws/a/b.md')
    expect(resolveWorkspacePath('/ws', '/etc/hosts')).toBe('/etc/hosts')
    expect(isAbsolute(resolveWorkspacePath('/ws', './x'))).toBe(true)
  })
})

describe('fs_write / fs_read 会话工作区', () => {
  it('fs_write 相对路径落在 workspace 下', async () => {
    registerBuiltinTools()
    const tools = buildTools(ctx)
    const fsWrite = tools.find((t) => t.name === 'fs_write')!
    const res = JSON.parse(await fsWrite.run({ path: 'reports/note.md', content: '# hi' }))
    expect(res.ok).toBe(true)
    expect(res.path).toBe(join(ws, 'reports', 'note.md'))
    expect(existsSync(join(ws, 'reports', 'note.md'))).toBe(true)
    expect(await readFile(join(ws, 'reports', 'note.md'), 'utf8')).toBe('# hi')
  })

  it('fs_read 相对路径从 workspace 读', async () => {
    await mkdir(ws, { recursive: true })
    const { writeFile } = await import('fs/promises')
    await writeFile(join(ws, 'data.txt'), '内容', 'utf8')
    const tools = buildTools(ctx)
    const fsRead = tools.find((t) => t.name === 'fs_read')!
    const res = JSON.parse(await fsRead.run({ path: 'data.txt' }))
    expect(res.ok).toBe(true)
    expect(res.content).toBe('内容')
  })
})
