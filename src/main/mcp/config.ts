import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

export type McpServerEntry = {
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
}

export type McpConfigFile = {
  mcpServers: Record<string, McpServerEntry>
}

export function mcpConfigPath(home: string): string {
  return join(home, 'config', 'mcp.json')
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
    const e = entry as Record<string, unknown>
    const command = typeof e.command === 'string' ? e.command : ''
    mcpServers[id] = {
      command,
      args: asStringArray(e.args),
      env: asStringRecord(e.env),
      enabled: e.enabled === false ? false : true
    }
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
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}
