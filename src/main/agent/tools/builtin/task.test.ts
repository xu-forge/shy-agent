import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-task-tool-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

describe('task tool 8 段式 prompt 设计', () => {
  it('task tool description 包含 4 个核心要素', async () => {
    const { registerTaskTools } = await import('./task')
    const { buildTools } = await import('../registry')
    registerTaskTools()
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-1'
    })
    const taskTool = tools.find((t) => t.name === 'task')
    expect(taskTool).toBeDefined()
    const desc = taskTool!.description
    // what
    expect(desc).toContain('sub-agent')
    // when
    expect(desc).toContain('用于')
    // when NOT
    expect(desc).toContain('不要')
    // foreground vs background
    expect(desc).toContain('前台')
    expect(desc).toContain('后台')
  })

  it('task_output tool 描述提到 status 流变', async () => {
    const { registerTaskTools } = await import('./task')
    const { buildTools } = await import('../registry')
    registerTaskTools()
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-1'
    })
    const out = tools.find((t) => t.name === 'task_output')
    expect(out?.description).toContain('status')
    expect(out?.description).toContain('completed')
  })

  it('task_query tool 区分元信息 vs output', async () => {
    const { registerTaskTools } = await import('./task')
    const { buildTools } = await import('../registry')
    registerTaskTools()
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-1'
    })
    const q = tools.find((t) => t.name === 'task_query')
    expect(q?.description).toContain('元信息')
    expect(q?.description).toContain('task_output')
  })

  it('task_stop tool 仅对运行中任务有效', async () => {
    const { registerTaskTools } = await import('./task')
    const { buildTools } = await import('../registry')
    registerTaskTools()
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => true,
      sessionId: 'ses-1'
    })
    const stop = tools.find((t) => t.name === 'task_stop')
    expect(stop?.description).toContain('queued')
    expect(stop?.description).toContain('running')
  })
})
