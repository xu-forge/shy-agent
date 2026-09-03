import { createServer, type Server } from 'node:http'

export const MCP_OAUTH_TIMEOUT_MS = 5 * 60_000

export type LoopbackOAuthServer = {
  redirectUrl: string
  waitForCode: Promise<string>
  close: () => Promise<void>
}

/**
 * 在 127.0.0.1 临时端口监听 OAuth callback。
 * 须在发起授权前启动，避免回调早于 listen。
 */
export async function startOAuthLoopback(opts?: {
  host?: string
  path?: string
  timeoutMs?: number
}): Promise<LoopbackOAuthServer> {
  const host = opts?.host ?? '127.0.0.1'
  const callbackPath = opts?.path ?? '/callback'
  const timeoutMs = opts?.timeoutMs ?? MCP_OAUTH_TIMEOUT_MS

  let server: Server
  let settleCode: (code: string) => void
  let rejectCode: (err: Error) => void
  const waitForCode = new Promise<string>((resolve, reject) => {
    settleCode = resolve
    rejectCode = reject
  })

  const timer = setTimeout(() => {
    rejectCode(new Error(`OAuth 授权超时（${Math.round(timeoutMs / 1000)}s）`))
    void close()
  }, timeoutMs)

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      clearTimeout(timer)
      server.close(() => resolve())
    })

  server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400)
      res.end('Bad request')
      return
    }
    if (req.url.startsWith('/favicon')) {
      res.writeHead(404)
      res.end()
      return
    }
    try {
      const parsed = new URL(req.url, `http://${host}`)
      if (parsed.pathname !== callbackPath) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      const err = parsed.searchParams.get('error')
      const code = parsed.searchParams.get('code')
      if (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<html><body><h1>授权失败</h1><p>${err}</p></body></html>`)
        rejectCode(new Error(`OAuth 授权失败：${err}`))
        void close()
        return
      }
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h1>缺少 authorization code</h1></body></html>')
        rejectCode(new Error('OAuth 回调缺少 code'))
        void close()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        '<html><body><h1>授权成功</h1><p>可以关闭此窗口，返回 shy。</p></body></html>'
      )
      settleCode(code)
      void close()
    } catch (e) {
      res.writeHead(500)
      res.end('Error')
      rejectCode(e instanceof Error ? e : new Error(String(e)))
      void close()
    }
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('无法绑定 OAuth loopback 端口'))
        return
      }
      resolve(addr.port)
    })
  })

  const redirectUrl = `http://${host}:${port}${callbackPath}`
  return {
    redirectUrl,
    waitForCode: waitForCode.finally(() => clearTimeout(timer)),
    close
  }
}
