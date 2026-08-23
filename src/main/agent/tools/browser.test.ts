import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { registerBrowserTool, setBrowserManagerGetter } from './browser'
import { buildTools } from './registry'

let ctx: Parameters<typeof buildTools>[0]
let executed: Array<{ action: string; input: Record<string, unknown> }>

beforeEach(async () => {
  executed = []
  const fakeManager = {
    executeAgentTool: async (
      _s: string,
      action: string,
      input: Record<string, unknown>
    ): Promise<string> => {
      executed.push({ action, input })
      return JSON.stringify({ ok: true, action })
    }
  }
  setBrowserManagerGetter(() => fakeManager)
  ctx = {
    emit: () => undefined,
    confirmHighRisk: async () => true,
    sessionId: 'ses-browser-tool',
    workspaceDir: await mkdtemp(join(tmpdir(), 'shy-bt-'))
  }
})

afterAll(async () => {
  setBrowserManagerGetter(null)
  if (ctx?.workspaceDir) await rm(ctx.workspaceDir, { recursive: true, force: true })
})

describe('browser 工具层', () => {
  it('普通导航直接执行，不触发确认', async () => {
    registerBrowserTool()
    const tool = buildTools(ctx).find((t) => t.name === 'browser')!
    const res = JSON.parse(
      await tool.run({ action: 'navigate', input: { url: 'https://example.com' } })
    )
    expect(res.ok).toBe(true)
    expect(executed).toHaveLength(1)
    expect(executed[0].input.unsafeConfirmed).toBeUndefined()
  })

  it('file: 导航触发确认，拒绝则不执行', async () => {
    registerBrowserTool()
    ctx = { ...ctx, confirmHighRisk: async () => false }
    const tool = buildTools(ctx).find((t) => t.name === 'browser')!
    const res = JSON.parse(
      await tool.run({ action: 'navigate', input: { url: 'file:///etc/passwd' } })
    )
    expect(res.ok).toBe(false)
    expect(res.error).toContain('拒绝')
    expect(executed).toHaveLength(0)
  })

  it('file: 导航确认通过后带 unsafeConfirmed 执行', async () => {
    registerBrowserTool()
    const tool = buildTools(ctx).find((t) => t.name === 'browser')!
    const res = JSON.parse(
      await tool.run({ action: 'navigate', input: { url: 'file:///tmp/x' } })
    )
    expect(res.ok).toBe(true)
    expect(executed[0].input.unsafeConfirmed).toBe(true)
  })

  it('upload_files 校验路径存在，不存在直接拒绝', async () => {
    registerBrowserTool()
    const tool = buildTools(ctx).find((t) => t.name === 'browser')!
    const bad = JSON.parse(
      await tool.run({
        action: 'upload_files',
        input: { ref: 'browser-element:x', paths: ['/nonexistent/a.txt'] }
      })
    )
    expect(bad.ok).toBe(false)
    expect(executed).toHaveLength(0)

    const good = join(ctx.workspaceDir, 'u.txt')
    await writeFile(good, 'x', 'utf8')
    const ok = JSON.parse(
      await tool.run({
        action: 'upload_files',
        input: { ref: 'browser-element:x', paths: [good] }
      })
    )
    expect(ok.ok).toBe(true)
    expect(executed).toHaveLength(1)
  })

  it('manager 抛错时返回 ok=false 而不是炸掉', async () => {
    setBrowserManagerGetter(() => {
      throw new Error('ref 无效')
    })
    registerBrowserTool()
    const tool = buildTools(ctx).find((t) => t.name === 'browser')!
    const res = JSON.parse(await tool.run({ action: 'click', input: { ref: 'bad' } }))
    expect(res.ok).toBe(false)
    expect(res.error).toContain('ref 无效')
  })
})
