import { resolveShyHome } from '../paths'
import type { McpServerEntry } from './config'
import { entryTransportKind } from './config'
import { stringifyMcpResult, type McpSession } from './session-types'
import { startOAuthLoopback, MCP_OAUTH_TIMEOUT_MS } from './oauth-loopback'
import { FileOAuthClientProvider } from './oauth-provider'

export const MCP_AUTH_NEEDED =
  '需要 OAuth 授权：请在设置中点击「登录」或调用 mcp_authorize'

export type CreateHttpSessionOptions = {
  interactive?: boolean
  home?: string
  openExternal?: (url: string) => Promise<void>
  oauthTimeoutMs?: number
}

function isUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: string }).name
  const msg = err instanceof Error ? err.message : String(err)
  return name === 'UnauthorizedError' || /unauthorized|authorization/i.test(msg)
}

async function wrapClient(client: {
  listTools: () => Promise<{
    tools: Array<{ name: string; description?: string; inputSchema?: unknown }>
  }>
  callTool: (args: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>
  close: () => Promise<void>
}): Promise<McpSession> {
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

/**
 * Streamable HTTP MCP session。
 * interactive=false：仅用已存 token；需授权则抛 MCP_AUTH_NEEDED。
 * interactive=true：loopback + 浏览器授权。
 */
export async function createHttpSession(
  id: string,
  entry: McpServerEntry,
  opts: CreateHttpSessionOptions = {}
): Promise<McpSession> {
  if (entryTransportKind(entry) !== 'http') {
    throw new Error('createHttpSession 需要 url 条目')
  }
  const urlText = entry.url!.trim()
  let serverUrl: URL
  try {
    serverUrl = new URL(urlText)
  } catch {
    throw new Error(`无效的 MCP url：${urlText}`)
  }

  const home = opts.home ?? resolveShyHome()
  const interactive = opts.interactive === true
  const openExternal =
    opts.openExternal ??
    (async (url: string) => {
      const { shell } = await import('electron')
      await shell.openExternal(url)
    })
  const headers = entry.headers ?? {}

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/sdk/client/streamableHttp.js'
  )

  if (!interactive) {
    const provider = new FileOAuthClientProvider({
      serverId: id,
      home,
      redirectUrl: 'http://127.0.0.1/oauth-placeholder',
      onRedirect: async () => {
        throw new Error(MCP_AUTH_NEEDED)
      }
    })
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider: provider,
      requestInit: { headers: { ...headers } }
    })
    const client = new Client({ name: 'shy', version: '1.0.0' })
    try {
      await client.connect(transport)
      return wrapClient(client)
    } catch (err) {
      if (isUnauthorized(err) || (err instanceof Error && err.message === MCP_AUTH_NEEDED)) {
        throw new Error(MCP_AUTH_NEEDED)
      }
      throw err
    }
  }

  const loopback = await startOAuthLoopback({
    timeoutMs: opts.oauthTimeoutMs ?? MCP_OAUTH_TIMEOUT_MS
  })
  try {
    const provider = new FileOAuthClientProvider({
      serverId: id,
      home,
      redirectUrl: loopback.redirectUrl,
      onRedirect: async (authUrl) => {
        await openExternal(authUrl.toString())
      }
    })
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider: provider,
      requestInit: { headers: { ...headers } }
    })
    const client = new Client({ name: 'shy', version: '1.0.0' })
    const codePromise = loopback.waitForCode
    try {
      await client.connect(transport)
      return wrapClient(client)
    } catch (err) {
      if (!isUnauthorized(err)) throw err
      const code = await codePromise
      await transport.finishAuth(code)
      const client2 = new Client({ name: 'shy', version: '1.0.0' })
      await client2.connect(transport)
      return wrapClient(client2)
    }
  } finally {
    await loopback.close().catch(() => undefined)
  }
}
