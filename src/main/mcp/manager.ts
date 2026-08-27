import { homedir } from 'os'
import { delimiter, join } from 'path'
import type { McpConfigFile, McpServerEntry } from './config'

export const MCP_CONNECT_TIMEOUT_MS = 15_000

export type McpToolInfo = {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
}

export type McpSession = {
  listTools: () => Promise<McpToolInfo[]>
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>
  close: () => Promise<void>
}

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
  timeoutMs?: number
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
  const envKeys = Object.keys(entry.env).sort()
  const env: Record<string, string> = {}
  for (const k of envKeys) env[k] = entry.env[k] ?? ''
  return JSON.stringify({
    command: entry.command,
    args: entry.args,
    env,
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

export function stringifyMcpResult(result: unknown): string {
  if (result && typeof result === 'object' && 'content' in result) {
    const content = (result as { content: unknown }).content
    if (Array.isArray(content)) {
      const texts = content
        .map((c) => {
          if (c && typeof c === 'object' && (c as { type?: unknown }).type === 'text') {
            const text = (c as { text?: unknown }).text
            return typeof text === 'string' ? text : ''
          }
          return ''
        })
        .filter(Boolean)
      if (texts.length > 0) return texts.join('\n')
    }
    return JSON.stringify(content)
  }
  return typeof result === 'string' ? result : JSON.stringify(result)
}

export async function createStdioSession(id: string, entry: McpServerEntry): Promise<McpSession> {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')
  const transport = new StdioClientTransport({
    command: entry.command,
    args: entry.args,
    env: mergeSpawnEnv(entry.env),
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

export class McpManager {
  private readonly connector: McpConnector
  private timeoutMs: number
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
    this.connector = opts.connector ?? createStdioSession
    this.timeoutMs = opts.timeoutMs ?? MCP_CONNECT_TIMEOUT_MS
    this.getOccupiedNames = opts.getOccupiedNames ?? (() => [])
  }

  setOccupiedNames(fn: () => string[]): void {
    this.getOccupiedNames = fn
    this.rebuildExposed(fn())
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
      if (
        live &&
        (entryFingerprint(nextEntry) !== live.fingerprint ||
          !nextEntry.enabled ||
          !nextEntry.command.trim())
      ) {
        await this.closeServer(id)
      }
    }

    this.config = next
    await Promise.all(
      [...nextIds].map((id) => this.ensureServer(id, next.mcpServers[id]!))
    )
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
    if (!entry.command.trim()) {
      this.statuses.set(id, { id, state: 'invalid', error: '配置无效：缺少 command' })
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
