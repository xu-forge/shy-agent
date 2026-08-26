import { useState } from 'react'
import type { ToolRendererProps } from './index'
import { ToolRowShell } from './ToolRowShell'
import { normalizeAskOptions } from '../../../lib/askOptions'

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

const WIDGET_TYPES = new Set(['table', 'cards', 'chart', 'diagram', 'html'])

export function ReadMeRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  return (
    <ToolRowShell {...props}>
      <pre>{String(out?.guide ?? '').slice(0, 600)}</pre>
    </ToolRowShell>
  )
}

export function WidgetRenderer(props: ToolRendererProps): React.JSX.Element {
  const args = asRecord(props.input)
  const out = asRecord(props.result)
  const widgetType = String(out?.widgetType ?? args?.widgetType ?? 'html')
  const html = String(out?.html ?? args?.html ?? '')
  const data = out?.data ?? args?.data

  if (html && !WIDGET_TYPES.has(widgetType)) {
    return (
      <ToolRowShell {...props}>
        <iframe
          className="widget-frame"
          sandbox=""
          title="widget"
          srcDoc={html.slice(0, 50_000)}
        />
      </ToolRowShell>
    )
  }

  if (widgetType === 'table' && Array.isArray(data)) {
    const rows = data as Array<Record<string, unknown>>
    const cols = rows[0] ? Object.keys(rows[0]) : []
    return (
      <ToolRowShell {...props}>
        <table className="widget-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c}>{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ToolRowShell>
    )
  }

  if (widgetType === 'html' && html) {
    return (
      <ToolRowShell {...props}>
        <iframe className="widget-frame" sandbox="" title="widget" srcDoc={html.slice(0, 50_000)} />
      </ToolRowShell>
    )
  }

  return (
    <ToolRowShell {...props}>
      <pre>{JSON.stringify(data ?? args, null, 2).slice(0, 1500)}</pre>
    </ToolRowShell>
  )
}

export function ArtifactRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const paths = Array.isArray(out?.paths) ? (out.paths as string[]) : []
  const url = typeof out?.url === 'string' ? out.url : ''
  return (
    <ToolRowShell {...props}>
      {props.error ? (
        <pre className="tool-error">{props.error}</pre>
      ) : (
        <ul className="artifact-list">
          {paths.map((p) => (
            <li key={p}>{p.split(/[/\\]/).pop()}</li>
          ))}
          {url ? <li>{url}</li> : null}
        </ul>
      )}
    </ToolRowShell>
  )
}

export function AskUserRenderer(props: ToolRendererProps): React.JSX.Element {
  const args = asRecord(props.input)
  const out = asRecord(props.result)
  const options = normalizeAskOptions(args?.options)
  const question = String(args?.question ?? '')
  const requestId = String(args?.requestId ?? '')
  const running = props.status === 'running'
  const chosen = String(out?.answer ?? '')
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState('')

  const answer = sent || chosen
  const waiting = running && !answer
  const canReply = Boolean(requestId) && waiting

  function reply(value: string): void {
    const v = value.trim()
    if (!canReply || !v) return
    setSent(v)
    void window.shy?.askUserReply?.(requestId, v)
  }

  return (
    <ToolRowShell {...props} alwaysShowBody>
      <div className="ask-user-card">
        {question ? <div className="ask-user-q">{question}</div> : null}
        {options.length ? (
          <div className="ask-user-options">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="btn ask-user-opt"
                aria-pressed={answer === o.value || answer === o.label}
                disabled={!canReply}
                onClick={() => reply(o.value)}
              >
                <span>{o.label}</span>
                {o.description ? <span className="ask-user-opt-desc">{o.description}</span> : null}
              </button>
            ))}
          </div>
        ) : waiting ? (
          <form
            className="ask-user-free"
            onSubmit={(e) => {
              e.preventDefault()
              reply(draft)
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={requestId ? '输入回答…' : '连接中…'}
              disabled={!canReply}
            />
            <button type="submit" className="btn" disabled={!canReply || !draft.trim()}>
              发送
            </button>
          </form>
        ) : answer ? (
          <div className="ask-user-answer">已选：{answer}</div>
        ) : null}
        {options.length > 0 && answer ? <div className="ask-user-answer">已选：{answer}</div> : null}
      </div>
    </ToolRowShell>
  )
}

export function TaskToolRenderer(props: ToolRendererProps): React.JSX.Element {
  const args = asRecord(props.input)
  return (
    <ToolRowShell {...props}>
      <pre>{JSON.stringify(args ?? props.result, null, 2).slice(0, 800)}</pre>
    </ToolRowShell>
  )
}

export function ReadLintsRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const diags = Array.isArray(out?.diagnostics)
    ? (out.diagnostics as Array<Record<string, unknown>>)
    : []
  return (
    <ToolRowShell {...props}>
      <pre>
        {diags.length
          ? diags.map((d) => `${d.file}:${d.line} ${d.severity} ${d.message}`).join('\n')
          : '无诊断'}
      </pre>
    </ToolRowShell>
  )
}
