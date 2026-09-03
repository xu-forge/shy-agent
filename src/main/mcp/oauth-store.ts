import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { OAuthClientInformationMixed, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js'

export type McpOauthServerRecord = {
  tokens?: OAuthTokens
  clientInformation?: OAuthClientInformationMixed
}

export type McpOauthStoreFile = {
  servers: Record<string, McpOauthServerRecord>
}

export function mcpOauthPath(home: string): string {
  return join(home, 'config', 'mcp-oauth.json')
}

export async function readMcpOauthStore(home: string): Promise<McpOauthStoreFile> {
  try {
    const raw = await readFile(mcpOauthPath(home), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { servers: {} }
    }
    const servers = (parsed as { servers?: unknown }).servers
    if (!servers || typeof servers !== 'object' || Array.isArray(servers)) {
      return { servers: {} }
    }
    return { servers: servers as Record<string, McpOauthServerRecord> }
  } catch {
    return { servers: {} }
  }
}

export async function writeMcpOauthStore(store: McpOauthStoreFile, home: string): Promise<void> {
  const path = mcpOauthPath(home)
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  await rename(tmp, path)
}

export async function getMcpOauthRecord(
  serverId: string,
  home: string
): Promise<McpOauthServerRecord | undefined> {
  const store = await readMcpOauthStore(home)
  return store.servers[serverId]
}

export async function setMcpOauthRecord(
  serverId: string,
  record: McpOauthServerRecord,
  home: string
): Promise<void> {
  const store = await readMcpOauthStore(home)
  store.servers[serverId] = record
  await writeMcpOauthStore(store, home)
}

export async function clearMcpOauthRecord(serverId: string, home: string): Promise<void> {
  const store = await readMcpOauthStore(home)
  if (!(serverId in store.servers)) return
  delete store.servers[serverId]
  await writeMcpOauthStore(store, home)
}
