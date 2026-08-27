import { describe, expect, it } from 'vitest'
import { delimiter } from 'path'
import type { McpConfigFile, McpServerEntry } from './config'
import {
  McpManager,
  formatConnectError,
  mergePath,
  mergeSpawnEnv,
  type McpConnector,
  type McpToolInfo
} from './manager'

function entry(partial: Partial<McpServerEntry> & { command?: string } = {}): McpServerEntry {
  return {
    command: partial.command ?? 'uvx',
    args: partial.args ?? ['minimax-coding-plan-mcp', '-y'],
    env: partial.env ?? {},
    enabled: partial.enabled ?? true
  }
}

function connector(opts: {
  fail?: Record<string, Error>
  hang?: string[]
  tools?: Record<string, McpToolInfo[]>
  connects?: string[]
}): McpConnector {
  return async (id) => {
    opts.connects?.push(id)
    if (opts.hang?.includes(id)) {
      return new Promise(() => undefined) as never
    }
    if (opts.fail?.[id]) throw opts.fail[id]
    const tools = opts.tools?.[id] ?? [{ name: 'web_search', description: 'search' }]
    return {
      listTools: async () => tools,
      callTool: async (name, args) => JSON.stringify({ server: id, name, args }),
      close: async () => undefined
    }
  }
}

describe('mergeSpawnEnv / mergePath', () => {
  it('PATH 追加 homebrew / usr/local / ~/.local/bin', () => {
    const env = mergeSpawnEnv({ K: 'v' }, { PATH: '/bin' }, '/Users/x')
    const parts = env.PATH.split(delimiter)
    expect(parts).toContain('/opt/homebrew/bin')
    expect(parts).toContain('/usr/local/bin')
    expect(parts).toContain('/Users/x/.local/bin')
    expect(env.K).toBe('v')
    expect(mergePath('/bin', '/Users/x')).toContain('/opt/homebrew/bin')
  })
})

describe('formatConnectError', () => {
  it('ENOENT 提示绝对路径', () => {
    const err = Object.assign(new Error('spawn uvx ENOENT'), { code: 'ENOENT' })
    expect(formatConnectError(err)).toMatch(/绝对路径/)
    expect(formatConnectError(err)).toMatch(/ENOENT/)
  })
})

describe('McpManager', () => {
  it('单点失败隔离：一个 ENOENT 不影响另一个 listTools', async () => {
    const fail = Object.assign(new Error('spawn uvx ENOENT'), { code: 'ENOENT' })
    const mgr = new McpManager({
      connector: connector({
        fail: { bad: fail },
        tools: { good: [{ name: 'web_search', description: 's' }] }
      })
    })
    const cfg: McpConfigFile = {
      mcpServers: {
        bad: entry({ command: 'uvx' }),
        good: entry({ command: 'uvx' })
      }
    }
    await mgr.connectAll(cfg)
    const status = mgr.getStatus()
    const bad = status.find((s) => s.id === 'bad')
    const good = status.find((s) => s.id === 'good')
    expect(bad?.state).toBe('error')
    expect(bad?.error).toMatch(/ENOENT/)
    expect(good?.state).toBe('connected')
    expect(mgr.listExposedTools().map((t) => t.exposedName)).toContain('web_search')
  })

  it('disabled 与无 command 不连接', async () => {
    const connects: string[] = []
    const mgr = new McpManager({ connector: connector({ connects }) })
    await mgr.connectAll({
      mcpServers: {
        off: entry({ enabled: false }),
        empty: entry({ command: '' }),
        on: entry()
      }
    })
    expect(connects).toEqual(['on'])
    expect(mgr.getStatus().find((s) => s.id === 'off')?.state).toBe('disabled')
    expect(mgr.getStatus().find((s) => s.id === 'empty')?.state).toBe('invalid')
  })

  it('同名工具后者加 mcp_<id>_ 前缀', async () => {
    const mgr = new McpManager({
      connector: connector({
        tools: {
          a: [{ name: 'foo', description: 'a' }],
          b: [{ name: 'foo', description: 'b' }]
        }
      })
    })
    await mgr.connectAll({
      mcpServers: {
        a: entry(),
        b: entry()
      }
    })
    const names = mgr.listExposedTools().map((t) => t.exposedName)
    expect(names).toEqual(['foo', 'mcp_b_foo'])
    const fromB = JSON.parse(await mgr.callTool('mcp_b_foo', { q: 1 })) as { server: string }
    expect(fromB.server).toBe('b')
  })

  it('与已占用名冲突时 MCP 侧加前缀', async () => {
    const mgr = new McpManager({
      connector: connector({
        tools: { MiniMax: [{ name: 'grep', description: 'g' }] }
      }),
      getOccupiedNames: () => ['grep']
    })
    await mgr.connectAll({ mcpServers: { MiniMax: entry() } })
    expect(mgr.listExposedTools().map((t) => t.exposedName)).toEqual(['mcp_MiniMax_grep'])
  })

  it('连接超时记 error 且不抛出', async () => {
    const mgr = new McpManager({
      connector: connector({ hang: ['slow'] }),
      timeoutMs: 40
    })
    await mgr.connectAll({ mcpServers: { slow: entry() } })
    const row = mgr.getStatus()[0]
    expect(row?.state).toBe('error')
    expect(row?.error).toMatch(/timeout/i)
  })

  it('applyConfig 改 env 后重连', async () => {
    const connects: string[] = []
    const mgr = new McpManager({ connector: connector({ connects }) })
    await mgr.connectAll({
      mcpServers: { MiniMax: entry({ env: { K: '1' } }) }
    })
    expect(connects).toEqual(['MiniMax'])
    await mgr.applyConfig({
      mcpServers: { MiniMax: entry({ env: { K: '2' } }) }
    })
    expect(connects).toEqual(['MiniMax', 'MiniMax'])
    expect(mgr.getStatus()[0]?.state).toBe('connected')
  })

  it('applyConfig 禁用则关闭', async () => {
    const mgr = new McpManager({ connector: connector({}) })
    await mgr.connectAll({ mcpServers: { MiniMax: entry() } })
    expect(mgr.listExposedTools()).toHaveLength(1)
    await mgr.applyConfig({
      mcpServers: { MiniMax: entry({ enabled: false }) }
    })
    expect(mgr.getStatus()[0]?.state).toBe('disabled')
    expect(mgr.listExposedTools()).toEqual([])
  })
})
