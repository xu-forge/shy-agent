/**
 * Markdown 链接是否应在内置浏览器打开。
 * 相对路径 / 锚点不得当成网页，否则会把 Electron 主窗口整页导航走。
 */
export function httpUrlFromMarkdownHref(href: string | undefined | null): string | null {
  if (!href) return null
  const t = href.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('vbscript:')
  ) {
    return null
  }
  if (t.startsWith('#')) return null
  try {
    if (t.startsWith('//')) {
      const u = new URL(`https:${t}`)
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null
    }
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t)
      return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
    }
    return null
  } catch {
    return null
  }
}
