import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export type McpServerEntry = {
  enabled: boolean
  /** stdio */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Streamable HTTP */
  url?: string
  headers?: Record<string, string>
}

export type McpConfigFile = {
  mcpServers: Record<string, McpServerEntry>
}

export type McpTransportKind = 'stdio' | 'http' | 'invalid'

export function mcpConfigPath(home: string): string {
  return join(home, 'config', 'mcp.json')
}

export function entryTransportKind(entry: McpServerEntry): McpTransportKind {
  const hasUrl = Boolean(entry.url?.trim())
  const hasCommand = Boolean(entry.command?.trim())
  if (hasUrl && hasCommand) return 'invalid'
  if (hasUrl) return 'http'
  if (hasCommand) return 'stdio'
  return 'invalid'
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
    else if (v == null) continue
    else out[k] = String(v)
  }
  return out
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((x): x is string => typeof x === 'string')
}

function normalizeEntry(raw: Record<string, unknown>): McpServerEntry {
  const enabled = raw.enabled === false ? false : true
  const url = typeof raw.url === 'string' ? raw.url : undefined
  const hasUrl = Boolean(url?.trim())
  const command =
    typeof raw.command === 'string' ? raw.command : hasUrl ? undefined : ''
  const args = asStringArray(raw.args)
  const env = asStringRecord(raw.env)
  const headers = asStringRecord(raw.headers)
  const entry: McpServerEntry = { enabled }
  if (command !== undefined) entry.command = command
  if (url !== undefined) entry.url = url
  if (!hasUrl) {
    entry.args = args
    entry.env = env
  } else {
    entry.headers = headers
  }
  return entry
}

/** 序列化时去掉另一传输的字段，避免歧义 */
export function serializeMcpEntry(entry: McpServerEntry): Record<string, unknown> {
  const kind = entryTransportKind(entry)
  const enabled = entry.enabled !== false
  if (kind === 'http') {
    return {
      url: entry.url!.trim(),
      headers: entry.headers ?? {},
      enabled
    }
  }
  if (kind === 'stdio') {
    return {
      command: entry.command!.trim(),
      args: entry.args ?? [],
      env: entry.env ?? {},
      enabled
    }
  }
  // invalid：原样尽量保留，便于 UI 编辑
  const out: Record<string, unknown> = { enabled }
  if (entry.command !== undefined) out.command = entry.command
  if (entry.url !== undefined) out.url = entry.url
  if (entry.args) out.args = entry.args
  if (entry.env) out.env = entry.env
  if (entry.headers) out.headers = entry.headers
  return out
}

export function parseMcpConfig(raw: unknown): McpConfigFile {
  const mcpServers: Record<string, McpServerEntry> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { mcpServers }
  }
  const servers = (raw as { mcpServers?: unknown }).mcpServers
  if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
    return { mcpServers }
  }
  for (const [id, entry] of Object.entries(servers as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    mcpServers[id] = normalizeEntry(entry as Record<string, unknown>)
  }
  return { mcpServers }
}

export async function readMcpConfig(home: string): Promise<McpConfigFile> {
  try {
    const raw = await readFile(mcpConfigPath(home), 'utf8')
    return parseMcpConfig(JSON.parse(raw) as unknown)
  } catch {
    return { mcpServers: {} }
  }
}

export async function writeMcpConfig(cfg: McpConfigFile, home: string): Promise<void> {
  const path = mcpConfigPath(home)
  await mkdir(dirname(path), { recursive: true })
  const serialized: McpConfigFile = { mcpServers: {} }
  // 写盘用规范化对象；JSON 层去掉互斥字段
  const forJson: Record<string, Record<string, unknown>> = {}
  for (const [id, entry] of Object.entries(cfg.mcpServers)) {
    serialized.mcpServers[id] = entry
    forJson[id] = serializeMcpEntry(entry)
  }
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify({ mcpServers: forJson }, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}
