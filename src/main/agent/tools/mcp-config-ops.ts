/**
 * MCP 配置变更的纯逻辑：读改写 + apply。供 Agent 工具与测试复用。
 */
import { resolveShyHome } from '../../paths'
import {
  readMcpConfig,
  writeMcpConfig,
  entryTransportKind,
  type McpConfigFile,
  type McpServerEntry
} from '../../mcp/config'
import { clearMcpOauthRecord } from '../../mcp/oauth-store'
import { getMcpManager, type McpServerStatus } from '../../mcp/manager'

export type McpUpsertInput = {
  id: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

function home(): string {
  return resolveShyHome()
}

export async function listMcpForAgent(): Promise<{
  config: McpConfigFile
  status: McpServerStatus[]
}> {
  const config = await readMcpConfig(home())
  return { config, status: getMcpManager().getStatus() }
}

export async function upsertMcpServer(input: McpUpsertInput): Promise<{
  config: McpConfigFile
  status: McpServerStatus[]
}> {
  const id = input.id.trim()
  if (!id) throw new Error('id 不能为空')

  const url = input.url?.trim() ?? ''
  const command = input.command?.trim() ?? ''
  if (url && command) {
    throw new Error('command 与 url 互斥：stdio 用 command，HTTP 用 url')
  }
  if (!url && !command) {
    throw new Error('请提供 command（stdio）或 url（Streamable HTTP）')
  }

  const enabled = input.enabled === false ? false : true
  let entry: McpServerEntry
  if (url) {
    entry = {
      url,
      headers: input.headers ?? {},
      enabled
    }
  } else {
    entry = {
      command,
      args: input.args ?? [],
      env: input.env ?? {},
      enabled
    }
  }
  if (entryTransportKind(entry) === 'invalid') {
    throw new Error('配置无效')
  }

  const cfg = await readMcpConfig(home())
  cfg.mcpServers[id] = entry
  await writeMcpConfig(cfg, home())
  await getMcpManager().applyConfig(cfg)
  return { config: cfg, status: getMcpManager().getStatus() }
}

export async function removeMcpServer(id: string): Promise<{
  config: McpConfigFile
  status: McpServerStatus[]
}> {
  const key = id.trim()
  if (!key) throw new Error('id 不能为空')
  const cfg = await readMcpConfig(home())
  if (!(key in cfg.mcpServers)) {
    throw new Error(`MCP 不存在：${key}`)
  }
  delete cfg.mcpServers[key]
  await writeMcpConfig(cfg, home())
  await clearMcpOauthRecord(key, home()).catch(() => undefined)
  await getMcpManager().applyConfig(cfg)
  return { config: cfg, status: getMcpManager().getStatus() }
}

export async function setMcpServerEnabled(
  id: string,
  enabled: boolean
): Promise<{
  config: McpConfigFile
  status: McpServerStatus[]
}> {
  const key = id.trim()
  if (!key) throw new Error('id 不能为空')
  const cfg = await readMcpConfig(home())
  const entry = cfg.mcpServers[key]
  if (!entry) throw new Error(`MCP 不存在：${key}`)
  cfg.mcpServers[key] = { ...entry, enabled }
  await writeMcpConfig(cfg, home())
  await getMcpManager().applyConfig(cfg)
  return { config: cfg, status: getMcpManager().getStatus() }
}

export async function authorizeMcpServer(id: string): Promise<{
  config: McpConfigFile
  status: McpServerStatus[]
}> {
  const key = id.trim()
  if (!key) throw new Error('id 不能为空')
  const cfg = await readMcpConfig(home())
  if (!cfg.mcpServers[key]) throw new Error(`MCP 不存在：${key}`)
  // 确保 manager 已加载该配置
  if (!getMcpManager().getConfig().mcpServers[key]) {
    await getMcpManager().applyConfig(cfg)
  }
  const status = await getMcpManager().authorize(key)
  return { config: cfg, status }
}
