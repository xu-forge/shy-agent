import { httpGet } from '../../net/http-get'

export type SearchHit = { title: string; url: string; snippet: string }

export type WebSearchResult = {
  query: string
  results: SearchHit[]
  error?: string
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&ensp;|&emsp;/gi, ' ')
    .replace(/&#0*183;|&middot;/gi, '·')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 解析 Bing SERP（`li.b_algo`）。 */
export function parseBingHtml(html: string): SearchHit[] {
  const hits: SearchHit[] = []
  const parts = html.split(/<li class="b_algo"/i)
  for (const block of parts.slice(1)) {
    const link = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const url = link[1] ?? ''
    if (!/^https?:\/\//i.test(url)) continue
    if (/bing\.com\/(ck|aclick|videos)/i.test(url)) continue
    const p = block.match(/<p class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>|<p[^>]*>([\s\S]*?)<\/p>/i)
    const snippet = stripHtml(p?.[1] || p?.[2] || '')
    hits.push({
      title: stripHtml(link[2] ?? '').slice(0, 120),
      url,
      snippet: snippet.slice(0, 280)
    })
  }
  return hits
}

export function parseDdgInstant(json: {
  Heading?: string
  AbstractText?: string
  AbstractURL?: string
  RelatedTopics?: Array<{
    Text?: string
    FirstURL?: string
    Topics?: Array<{ Text?: string; FirstURL?: string }>
  }>
}): SearchHit[] {
  const results: SearchHit[] = []
  if (json.AbstractText) {
    results.push({
      title: json.Heading || '',
      url: json.AbstractURL || '',
      snippet: json.AbstractText
    })
  }
  for (const t of json.RelatedTopics ?? []) {
    if (t.Text && t.FirstURL) {
      results.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text })
    }
    for (const nested of t.Topics ?? []) {
      if (nested.Text && nested.FirstURL) {
        results.push({
          title: nested.Text.slice(0, 80),
          url: nested.FirstURL,
          snippet: nested.Text
        })
      }
    }
  }
  return results
}

export async function runWebSearch(
  query: string,
  limit = 8,
  get: (url: string) => Promise<string> = httpGet
): Promise<WebSearchResult> {
  const cap = Math.min(Math.max(limit, 1), 12)
  const errors: string[] = []

  try {
    const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`
    const html = await get(bingUrl)
    const hits = parseBingHtml(html).slice(0, cap)
    if (hits.length) return { query, results: hits }
    errors.push('bing 无结构化命中')
  } catch (err) {
    errors.push(`bing: ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const raw = await get(ddgUrl)
    const json = JSON.parse(raw) as Parameters<typeof parseDdgInstant>[0]
    const hits = parseDdgInstant(json).slice(0, cap)
    if (hits.length) return { query, results: hits }
    errors.push('ddg 无命中')
  } catch (err) {
    errors.push(`ddg: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { query, results: [], error: errors.join('；') || '无命中' }
}
