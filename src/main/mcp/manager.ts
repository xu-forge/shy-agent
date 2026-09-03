import { homedir } from 'os'
import { delimiter, join } from 'path'
import type { McpConfigFile, McpServerEntry } from './config'
import { entryTransportKind } from './config'
import {
  stringifyMcpResult,
  type McpSession,
  type McpToolInfo
} from './session-types'
import { MCP_OAUTH_TIMEOUT_MS } from './oauth-loopback'

export type { McpSession, McpToolInfo }
export { stringifyMcpResult }

export const MCP_CONNECT_TIMEOUT_MS = 15_000

export type McpConnector = (id: string, entry: McpServerEntry) => Promise<McpSession>

export type McpServerState = 'connected' | 'disabled' | 'error' | 'connecting' | 'invalid'

export type McpServerStatus = {
  id: string
  state: McpServerState
  error?: string
  tools: string[]
}

export type ExposedMcpTool = {
  exposedName: string
  originalName: string
  serverId: string
  description: string
  inputSchema?: Record<string, unknown>
}

export type McpManagerOptions = {
  connector?: McpConnector
  /** 交互式 OAuth 连接器；默认 createHttpSession({ interactive: true }) */
  authorizeConnector?: McpConnector
  timeoutMs?: number
  oauthTimeoutMs?: number
  getOccupiedNames?: () => string[]
}

type LiveServer = {
  id: string
  entry: McpServerEntry
  fingerprint: string
  session: McpSession
  tools: McpToolInfo[]
}

const PATH_EXTRAS = ['/opt/homebrew/bin', '/usr/local/bin'] as const

export function mergePath(existing: string, home = homedir()): string {
  const extras = [...PATH_EXTRAS, join(home, '.local', 'bin')]
  const parts = existing.split(delimiter).filter(Boolean)
  for (const p of extras) {
    if (!parts.includes(p)) parts.push(p)
  }
  return parts.join(delimiter)
}

export function mergeSpawnEnv(
  extra: Record<string, string>,
  base: NodeJS.ProcessEnv = process.env,
  home = homedir()
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (typeof v === 'string') out[k] = v
  }
  Object.assign(out, extra)
  out.PATH = mergePath(out.PATH ?? '', home)
  return out
}

export function formatConnectError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const code =
    err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : ''
  if (code === 'ENOENT' || /ENOENT/i.test(msg) || /spawn\s+\S+\s+ENOENT/i.test(msg)) {
    return `${msg}。找不到可执行文件：请把 command 改成绝对路径（例如 \`which uvx\` 的结果）。`
  }
  return msg
}

export function entryFingerprint(entry: McpServerEntry): string {
  const env = entry.env ?? {}
  const headers = entry.headers ?? {}
  const envKeys = Object.keys(env).sort()
  const headerKeys = Object.keys(headers).sort()
  const envSorted: Record<string, string> = {}
  const headerSorted: Record<string, string> = {}
  for (const k of envKeys) envSorted[k] = env[k] ?? ''
  for (const k of headerKeys) headerSorted[k] = headers[k] ?? ''
  return JSON.stringify({
    command: entry.command ?? '',
    args: entry.args ?? [],
    env: envSorted,
    url: entry.url ?? '',
    headers: headerSorted,
    enabled: entry.enabled
  })
}

export function sanitizeServerId(id: string): string {
  const s = id.replace(/[^A-Za-z0-9_]/g, '_')
  return s.length > 0 ? s : 'server'
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

export async function createStdioSession(id: string, entry: McpServerEntry): Promise<McpSession> {
  const command = entry.command?.trim()
  if (!command) throw new Error('stdio MCP 缺少 command')
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const transport = new StdioClientTransport({
    command,
    args: entry.args ?? [],
    env: mergeSpawnEnv(entry.env ?? {}),
    stderr: 'pipe'
  })
  const client = new Client({ name: 'shy', version: '1.0.0' })
  await client.connect(transport)
  void id
  return {
    listTools: async () => {
      const listed = await client.listTools()
      return listed.tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema:
          t.inputSchema && typeof t.inputSchema === 'object'
            ? (t.inputSchema as Record<string, unknown>)
            : undefined
      }))
    },
    callTool: async (name, args) => {
      const result = await client.callTool({ name, arguments: args })
      return stringifyMcpResult(result)
    },
    close: async () => {
      await client.close()
    }
  }
}

export async function createMcpSession(
  id: string,
  entry: McpServerEntry,
  opts?: { interactive?: boolean }
): Promise<McpSession> {
  const kind = entryTransportKind(entry)
  if (kind === 'stdio') return createStdioSession(id, entry)
  if (kind === 'http') {
    const { createHttpSession } = await import('./http-session')
    return createHttpSession(id, entry, { interactive: opts?.interactive === true })
  }
  throw new Error('配置无效：请提供 command（stdio）或 url（HTTP），且二者互斥')
}

export class McpManager {
  private readonly connector: McpConnector
  private readonly authorizeConnector: McpConnector
  private timeoutMs: number
  private oauthTimeoutMs: number
  private getOccupiedNames: () => string[]
  private config: McpConfigFile = { mcpServers: {} }
  private readonly live = new Map<string, LiveServer>()
  private readonly statuses = new Map<string, Omit<McpServerStatus, 'tools'>>()
  private exposed: ExposedMcpTool[] = []
  private callMap = new Map<string, { serverId: string; originalName: string }>()
  private op: Promise<void> = Promise.resolve()

  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.op.then(fn, fn)
    this.op = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  constructor(opts: McpManagerOptions = {}) {
    this.connector = opts.connector ?? ((id, entry) => createMcpSession(id, entry, { interactive: false }))
    this.authorizeConnector =
      opts.authorizeConnector ??
      ((id, entry) => createMcpSession(id, entry, { interactive: true }))
    this.timeoutMs = opts.timeoutMs ?? MCP_CONNECT_TIMEOUT_MS
    this.oauthTimeoutMs = opts.oauthTimeoutMs ?? MCP_OAUTH_TIMEOUT_MS
    this.getOccupiedNames = opts.getOccupiedNames ?? (() => [])
  }

  setOccupiedNames(fn: () => string[]): void {
    this.getOccupiedNames = fn
    this.rebuildExposed(fn())
  }

  getConfig(): McpConfigFile {
    return this.config
  }

  getStatus(): McpServerStatus[] {
    const ids = Object.keys(this.config.mcpServers)
    const extra = [...this.statuses.keys()].filter((id) => !ids.includes(id))
    return [...ids, ...extra].map((id) => {
      const row = this.statuses.get(id)
      const live = this.live.get(id)
      const tools =
        row?.state === 'connected'
          ? this.exposed.filter((t) => t.serverId === id).map((t) => t.exposedName)
          : (live?.tools.map((t) => t.name) ?? [])
      return {
        id,
        state: row?.state ?? 'disabled',
        error: row?.error,
        tools
      }
    })
  }

  listExposedTools(occupied?: string[]): ExposedMcpTool[] {
    this.rebuildExposed(occupied ?? this.getOccupiedNames())
    return this.exposed
  }

  async callTool(exposedName: string, args: Record<string, unknown>): Promise<string> {
    const hit = this.callMap.get(exposedName)
    if (!hit) {
      throw new Error(`Unknown MCP tool: ${exposedName}`)
    }
    const live = this.live.get(hit.serverId)
    if (!live) {
      throw new Error(`MCP server ${hit.serverId} is not connected`)
    }
    return live.session.callTool(hit.originalName, args)
  }

  async connectAll(cfg: McpConfigFile): Promise<void> {
    return this.serialized(() => this.connectAllUnlocked(cfg))
  }

  async applyConfig(next: McpConfigFile): Promise<void> {
    return this.serialized(() => this.applyConfigUnlocked(next))
  }

  async authorize(id: string): Promise<McpServerStatus[]> {
    return this.serialized(async () => {
      const entry = this.config.mcpServers[id]
      if (!entry) throw new Error(`MCP 不存在：${id}`)
      if (entryTransportKind(entry) !== 'http') {
        throw new Error('仅 Streamable HTTP（url）服务器支持 OAuth 登录')
      }
      if (entry.enabled === false) {
        throw new Error('服务器已禁用，请先启用')
      }
      await this.closeServer(id)
      this.statuses.set(id, { id, state: 'connecting' })
      try {
        const session = await withTimeout(
          this.authorizeConnector(id, entry),
          this.oauthTimeoutMs,
          `MCP ${id} OAuth`
        )
        let tools: McpToolInfo[]
        try {
          tools = await withTimeout(session.listTools(), this.timeoutMs, `MCP ${id} listTools`)
        } catch (err) {
          await session.close().catch(() => undefined)
          throw err
        }
        this.live.set(id, {
          id,
          entry,
          fingerprint: entryFingerprint(entry),
          session,
          tools
        })
        this.statuses.set(id, { id, state: 'connected' })
      } catch (err) {
        this.statuses.set(id, { id, state: 'error', error: formatConnectError(err) })
      }
      this.rebuildExposed(this.getOccupiedNames())
      return this.getStatus()
    })
  }

  async shutdown(): Promise<void> {
    return this.serialized(() => this.shutdownUnlocked())
  }

  private async connectAllUnlocked(cfg: McpConfigFile): Promise<void> {
    await this.shutdownUnlocked()
    this.config = cfg
    await Promise.all(
      Object.keys(cfg.mcpServers).map((id) => this.ensureServer(id, cfg.mcpServers[id]!))
    )
    this.rebuildExposed(this.getOccupiedNames())
  }

  private async applyConfigUnlocked(next: McpConfigFile): Promise<void> {
    const prevIds = new Set(Object.keys(this.config.mcpServers))
    const nextIds = new Set(Object.keys(next.mcpServers))

    for (const id of prevIds) {
      const nextEntry = next.mcpServers[id]
      const live = this.live.get(id)
      if (!nextEntry) {
        await this.closeServer(id)
        this.statuses.delete(id)
        continue
      }
      const kind = entryTransportKind(nextEntry)
      if (
        live &&
        (entryFingerprint(nextEntry) !== live.fingerprint ||
          !nextEntry.enabled ||
          kind === 'invalid')
      ) {
        await this.closeServer(id)
      }
    }

    this.config = next
    await Promise.all([...nextIds].map((id) => this.ensureServer(id, next.mcpServers[id]!)))
    this.rebuildExposed(this.getOccupiedNames())
  }

  private async shutdownUnlocked(): Promise<void> {
    const ids = [...this.live.keys()]
    await Promise.all(ids.map((id) => this.closeServer(id)))
    this.live.clear()
    this.statuses.clear()
    this.exposed = []
    this.callMap.clear()
    this.config = { mcpServers: {} }
  }

  private async ensureServer(id: string, entry: McpServerEntry): Promise<void> {
    if (this.live.has(id)) {
      this.statuses.set(id, { id, state: 'connected' })
      return
    }
    if (entry.enabled === false) {
      this.statuses.set(id, { id, state: 'disabled' })
      return
    }
    const kind = entryTransportKind(entry)
    if (kind === 'invalid') {
      this.statuses.set(id, {
        id,
        state: 'invalid',
        error: '配置无效：请提供 command（stdio）或 url（HTTP），且二者互斥'
      })
      return
    }
    this.statuses.set(id, { id, state: 'connecting' })
    try {
      const session = await withTimeout(
        this.connector(id, entry),
        this.timeoutMs,
        `MCP ${id} connect`
      )
      let tools: McpToolInfo[]
      try {
        tools = await withTimeout(session.listTools(), this.timeoutMs, `MCP ${id} listTools`)
      } catch (err) {
        await session.close().catch(() => undefined)
        throw err
      }
      this.live.set(id, {
        id,
        entry,
        fingerprint: entryFingerprint(entry),
        session,
        tools
      })
      this.statuses.set(id, { id, state: 'connected' })
    } catch (err) {
      this.statuses.set(id, { id, state: 'error', error: formatConnectError(err) })
    }
  }

  private async closeServer(id: string): Promise<void> {
    const live = this.live.get(id)
    if (!live) return
    this.live.delete(id)
    try {
      await live.session.close()
    } catch {
      /* ignore */
    }
  }

  private rebuildExposed(occupied: string[]): void {
    const taken = new Set(occupied)
    const exposed: ExposedMcpTool[] = []
    const callMap = new Map<string, { serverId: string; originalName: string }>()
    for (const id of Object.keys(this.config.mcpServers)) {
      const live = this.live.get(id)
      if (!live) continue
      for (const tool of live.tools) {
        let name = tool.name
        if (taken.has(name)) {
          name = `mcp_${sanitizeServerId(id)}_${tool.name}`
        }
        if (taken.has(name)) {
          name = `mcp_${sanitizeServerId(id)}_${tool.name}_${exposed.length}`
        }
        taken.add(name)
        exposed.push({
          exposedName: name,
          originalName: tool.name,
          serverId: id,
          description: tool.description,
          inputSchema: tool.inputSchema
        })
        callMap.set(name, { serverId: id, originalName: tool.name })
      }
    }
    this.exposed = exposed
    this.callMap = callMap
  }
}

let singleton: McpManager | null = null

export function getMcpManager(): McpManager {
  if (!singleton) singleton = new McpManager()
  return singleton
}

export function setMcpManagerForTests(mgr: McpManager | null): void {
  singleton = mgr
}
