import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseMcpConfig, readMcpConfig, writeMcpConfig } from './config'

describe('parseMcpConfig', () => {
  it('空对象与缺字段视为零 server', () => {
    expect(parseMcpConfig(null).mcpServers).toEqual({})
    expect(parseMcpConfig(undefined).mcpServers).toEqual({})
    expect(parseMcpConfig({}).mcpServers).toEqual({})
  })

  it('enabled 缺省 true；解析 command/args/env', () => {
    const cfg = parseMcpConfig({
      mcpServers: {
        MiniMax: {
          command: 'uvx',
          args: ['minimax-coding-plan-mcp', '-y'],
          env: { MINIMAX_API_KEY: 'k', MINIMAX_API_HOST: 'https://api.minimaxi.com' }
        }
      }
    })
    expect(cfg.mcpServers.MiniMax).toEqual({
      command: 'uvx',
      args: ['minimax-coding-plan-mcp', '-y'],
      env: { MINIMAX_API_KEY: 'k', MINIMAX_API_HOST: 'https://api.minimaxi.com' },
      enabled: true
    })
  })

  it('解析 HTTP url/headers', () => {
    const cfg = parseMcpConfig({
      mcpServers: {
        remote: {
          url: 'https://mcp.example/mcp',
          headers: { Authorization: 'Bearer t' }
        }
      }
    })
    expect(cfg.mcpServers.remote).toEqual({
      url: 'https://mcp.example/mcp',
      headers: { Authorization: 'Bearer t' },
      enabled: true
    })
  })

  it('command 与 url 同时存在标为可解析但仍可检出互斥', async () => {
    const { entryTransportKind } = await import('./config')
    const cfg = parseMcpConfig({
      mcpServers: {
        bad: { command: 'uvx', url: 'https://x' }
      }
    })
    expect(entryTransportKind(cfg.mcpServers.bad!)).toBe('invalid')
  })

  it('enabled false 保留；无 command 仍收录以便 UI 标无效', () => {
    const cfg = parseMcpConfig({
      mcpServers: {
        bad: { args: ['x'] },
        off: { command: 'echo', enabled: false }
      }
    })
    expect(cfg.mcpServers.bad?.command).toBe('')
    expect(cfg.mcpServers.off?.enabled).toBe(false)
  })

  it('忽略非对象条目', () => {
    const cfg = parseMcpConfig({ mcpServers: { a: 'nope', b: { command: 'uvx' } } })
    expect(cfg.mcpServers.a).toBeUndefined()
    expect(cfg.mcpServers.b?.command).toBe('uvx')
  })
})

describe('readMcpConfig / writeMcpConfig', () => {
  it('缺文件视为空；写入后再读回', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shy-mcp-'))
    try {
      expect((await readMcpConfig(home)).mcpServers).toEqual({})
      await writeMcpConfig(
        {
          mcpServers: {
            MiniMax: { command: 'uvx', args: ['-y'], env: { K: 'v' }, enabled: true }
          }
        },
        home
      )
      const again = await readMcpConfig(home)
      expect(again.mcpServers.MiniMax?.command).toBe('uvx')
      expect(again.mcpServers.MiniMax?.env?.K).toBe('v')
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })

  it('坏 JSON 视为空而不抛', async () => {
    const home = await mkdtemp(join(tmpdir(), 'shy-mcp-'))
    try {
      await mkdir(join(home, 'config'), { recursive: true })
      await writeFile(join(home, 'config', 'mcp.json'), '{not json', 'utf8')
      expect((await readMcpConfig(home)).mcpServers).toEqual({})
    } finally {
      await rm(home, { recursive: true, force: true })
    }
  })
})
