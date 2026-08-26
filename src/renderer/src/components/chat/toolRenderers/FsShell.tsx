import type { ToolRendererProps } from './index'
import { ToolRowShell } from './ToolRowShell'

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

export function GrepRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const matches = Array.isArray(out?.matches) ? (out.matches as Array<Record<string, unknown>>) : []
  return (
    <ToolRowShell {...props}>
      {props.error ? (
        <pre className="tool-error">{props.error}</pre>
      ) : (
        <pre>
          {matches.length
            ? matches
                .slice(0, 20)
                .map((m) => `${m.file}:${m.line}: ${m.text}`)
                .join('\n')
            : '无匹配'}
        </pre>
      )}
    </ToolRowShell>
  )
}

export function GlobRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const paths = Array.isArray(out?.paths) ? (out.paths as string[]) : []
  return (
    <ToolRowShell {...props}>
      <pre>{paths.length ? paths.slice(0, 40).join('\n') : '无匹配'}</pre>
    </ToolRowShell>
  )
}

export function ListDirRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const entries = Array.isArray(out?.entries) ? (out.entries as Array<Record<string, unknown>>) : []
  return (
    <ToolRowShell {...props}>
      <pre>
        {entries
          .slice(0, 50)
          .map((e) => `${e.type === 'dir' ? 'd' : 'f'}  ${e.name}`)
          .join('\n')}
      </pre>
    </ToolRowShell>
  )
}

export function EditFileRenderer(props: ToolRendererProps): React.JSX.Element {
  return (
    <ToolRowShell {...props}>
      {props.error ? <pre className="tool-error">{props.error}</pre> : <pre>已写入</pre>}
    </ToolRowShell>
  )
}

export function ExecuteCommandRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const stdout = String(out?.stdout ?? props.result ?? '')
  return (
    <ToolRowShell {...props}>
      {props.error ? (
        <pre className="tool-error">{props.error}</pre>
      ) : (
        <pre>{stdout.slice(0, 2000)}</pre>
      )}
    </ToolRowShell>
  )
}

export function ReadFileRenderer(props: ToolRendererProps): React.JSX.Element {
  const out = asRecord(props.result)
  const content = String(out?.content ?? '')
  return (
    <ToolRowShell {...props}>
      <pre>{content.slice(0, 800)}</pre>
    </ToolRowShell>
  )
}

export function WriteFileRenderer(props: ToolRendererProps): React.JSX.Element {
  return (
    <ToolRowShell {...props}>{props.error ? <pre className="tool-error">{props.error}</pre> : <pre>已写入</pre>}</ToolRowShell>
  )
}
