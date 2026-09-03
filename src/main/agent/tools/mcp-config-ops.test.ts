import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { McpManager, setMcpManagerForTests } from '../../mcp/manager'
import { mcpConfigPath } from '../../mcp/config'

describe('mcp-config-ops', () => {
  let tmp = ''

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'shy-mcp-ops-'))
    process.env.SHY_HOME = tmp
    setMcpManagerForTests(
      new McpManager({
        connector: async () => ({
          listTools: async () => [{ name: 'ping', description: 'p' }],
          callTool: async () => 'ok',
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

  it('upsert 落盘并 apply 后可见 status', async () => {
    const ops = await import('./mcp-config-ops')
    const result = await ops.upsertMcpServer({
      id: 'demo',
      command: 'npx',
      args: ['-y', 'demo-mcp'],
      env: { A: '1' }
    })
    expect(result.config.mcpServers.demo).toMatchObject({
      command: 'npx',
      args: ['-y', 'demo-mcp'],
      enabled: true
    })
    const raw = JSON.parse(readFileSync(mcpConfigPath(tmp), 'utf8')) as {
      mcpServers: Record<string, unknown>
    }
    expect(raw.mcpServers.demo).toBeTruthy()
    expect(result.status.some((s) => s.id === 'demo')).toBe(true)
  })

  it('remove 删除条目', async () => {
    const ops = await import('./mcp-config-ops')
    await ops.upsertMcpServer({ id: 'x', command: 'echo' })
    await ops.removeMcpServer('x')
    const listed = await ops.listMcpForAgent()
    expect(listed.config.mcpServers.x).toBeUndefined()
  })

  it('set enabled false', async () => {
    const ops = await import('./mcp-config-ops')
    await ops.upsertMcpServer({ id: 'y', command: 'echo' })
    const result = await ops.setMcpServerEnabled('y', false)
    expect(result.config.mcpServers.y?.enabled).toBe(false)
  })

  it('upsert HTTP url', async () => {
    const ops = await import('./mcp-config-ops')
    const result = await ops.upsertMcpServer({
      id: 'remote',
      url: 'https://mcp.example/mcp',
      headers: { Authorization: 'Bearer x' }
    })
    expect(result.config.mcpServers.remote).toMatchObject({
      url: 'https://mcp.example/mcp',
      headers: { Authorization: 'Bearer x' }
    })
  })

  it('command 与 url 互斥', async () => {
    const ops = await import('./mcp-config-ops')
    await expect(
      ops.upsertMcpServer({ id: 'z', command: 'echo', url: 'https://x' })
    ).rejects.toThrow(/互斥/)
  })

  it('authorize 走 authorizeConnector', async () => {
    let authorized = false
    setMcpManagerForTests(
      new McpManager({
        connector: async () => ({
          listTools: async () => [],
          callTool: async () => '',
          close: async () => undefined
        }),
        authorizeConnector: async () => {
          authorized = true
          return {
            listTools: async () => [{ name: 't', description: 'd' }],
            callTool: async () => 'ok',
            close: async () => undefined
          }
        }
      })
    )
    const ops = await import('./mcp-config-ops')
    await ops.upsertMcpServer({ id: 'remote', url: 'https://mcp.example/mcp' })
    const result = await ops.authorizeMcpServer('remote')
    expect(authorized).toBe(true)
    expect(result.status.find((s) => s.id === 'remote')?.state).toBe('connected')
  })
})
