import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerBuiltinTools } from './builtin'
import { buildTools } from './registry'
import { McpManager, setMcpManagerForTests } from '../../mcp/manager'
import { mcpConfigPath } from '../../mcp/config'
import { upsertMcpServer } from './mcp-config-ops'

describe('mcp / skill_set_enabled tools', () => {
  let tmp = ''

  beforeAll(() => {
    registerBuiltinTools()
  })

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'shy-mcp-tools-'))
    process.env.SHY_HOME = tmp
    setMcpManagerForTests(
      new McpManager({
        connector: async () => ({
          listTools: async () => [],
          callTool: async () => '',
          close: async () => undefined
        })
      })
    )
  })

  afterEach(() => {
    setMcpManagerForTests(null)
    delete process.env.SHY_HOME
    rmSync(tmp, { recursive: true, force: true })
  })

  it('mcp_remove 拒绝时不改文件', async () => {
    await upsertMcpServer({ id: 'keep', command: 'echo' })
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: async () => false,
      workspaceDir: tmp,
      sessionId: 't'
    })
    const remove = tools.find((t) => t.name === 'mcp_remove')!
    const out = JSON.parse(await remove.run({ id: 'keep' })) as { ok: boolean }
    expect(out.ok).toBe(false)
    expect(existsSync(mcpConfigPath(tmp))).toBe(true)
    const raw = JSON.parse(readFileSync(mcpConfigPath(tmp), 'utf8')) as {
      mcpServers: Record<string, unknown>
    }
    expect(raw.mcpServers.keep).toBeTruthy()
  })

  it('skill_set_enabled 禁用拒绝时不写入', async () => {
    const confirm = vi.fn(async () => false)
    const tools = buildTools({
      emit: () => undefined,
      confirmHighRisk: confirm,
      workspaceDir: tmp,
      sessionId: 't'
    })
    const tool = tools.find((t) => t.name === 'skill_set_enabled')!
    const out = JSON.parse(await tool.run({ name: 'demo', enabled: false })) as {
      ok: boolean
    }
    expect(out.ok).toBe(false)
    expect(confirm).toHaveBeenCalled()
  })
})
