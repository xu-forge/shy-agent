const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
}

function electronFetch(): typeof fetch | null {
  try {
    // 主进程用 Chromium 网络栈，才能走系统代理；Node fetch 在国内常连不上 DDG
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('electron') as { net?: { fetch?: typeof fetch } }
    if (typeof mod.net?.fetch === 'function') return mod.net.fetch.bind(mod.net)
  } catch {
    // vitest / 非 Electron
  }
  return null
}

export function resolveElectronFetch(): typeof fetch {
  return electronFetch() ?? fetch
}

/** GET 文本。优先 Electron net.fetch（系统代理），否则 Node fetch。 */
export async function httpGet(url: string, timeoutMs = 12_000): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  timer.unref?.()
  try {
    const res = await resolveElectronFetch()(url, { signal: ctrl.signal, headers: DEFAULT_HEADERS })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('请求超时')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** GET JSON。支持额外请求头（如 Authorization）。 */
export async function httpFetchJson(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 12_000
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  timer.unref?.()
  try {
    const res = await resolveElectronFetch()(url, {
      signal: ctrl.signal,
      headers: { ...DEFAULT_HEADERS, Accept: 'application/json', ...options.headers }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error('请求超时')
    throw err
  } finally {
    clearTimeout(timer)
  }
}
