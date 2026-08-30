/**
 * 主窗口 webContents 是否应拦截这次导航。
 * 用户点击文档里的 <a> 会把整个 renderer 切走；仅允许同一文档（含 hash）。
 */
export function shouldBlockRendererNavigation(currentUrl: string, targetUrl: string): boolean {
  try {
    const cur = new URL(currentUrl)
    const next = new URL(targetUrl)
    if (cur.origin === next.origin && cur.pathname === next.pathname && cur.search === next.search) {
      return false
    }
    return true
  } catch {
    return true
  }
}
