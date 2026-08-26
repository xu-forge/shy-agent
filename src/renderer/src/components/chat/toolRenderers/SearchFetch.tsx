import { ToolRowShell } from './ToolRowShell'
import type { ToolRendererProps } from './index'

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v)
      return p && typeof p === 'object' ? (p as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  return null
}

/** 搜索结果卡：query + snippet 列表 */
export function SearchToolRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const results = Array.isArray(out?.results) ? (out.results as Array<Record<string, unknown>>) : []
  const resultError = String(out?.error ?? props.error ?? '')
  return (
    <ToolRowShell {...props} error={resultError || props.error} failed={Boolean(resultError) || props.status === 'failed'}>
      {results.length ? (
        <div className="search-hits">
          {results.slice(0, 8).map((r, i) => (
            <div key={i} className="search-hit">
              <div className="search-hit-title">{String(r.title ?? r.url ?? '')}</div>
              {r.snippet ? <div className="search-hit-snip">{String(r.snippet)}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="search-empty">未找到结果</div>
      )}
    </ToolRowShell>
  )
}

export function WebFetchRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const snippet = String(out?.snippet ?? out?.content ?? out?.text ?? '').slice(0, 400)
  const title = String(out?.title ?? '')
  return (
    <ToolRowShell {...props}>
      {title || snippet ? (
        <>
          {title ? <div className="search-hit-title">{title}</div> : null}
          {snippet ? <pre>{snippet}</pre> : null}
        </>
      ) : null}
    </ToolRowShell>
  )
}
