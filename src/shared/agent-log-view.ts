const TOOL_INPUT_MAX = 400

type LogLine = {
  ts?: string
  kind?: string
  payload?: Record<string, unknown>
}

function splitThink(raw: string): { thinking: string; body: string } {
  const thinking: string[] = []
  const body = raw
    .replace(
      /<(?:think|thinking|reason|reasoning)\b[^>]*>([\s\S]*?)<\/(?:think|thinking|reason|reasoning)>/gi,
      (_m, inner: string) => {
        const t = String(inner).trim()
        if (t) thinking.push(t)
        return ''
      }
    )
    .trim()
  return { thinking: thinking.join('\n\n'), body }
}

function previewValue(value: unknown, max = TOOL_INPUT_MAX): string {
  if (value == null) return ''
  let s: string
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    s = String(value)
  }
  if (s.length <= max) return s
  return `${s.slice(0, max)}…[truncated ${s.length - max} chars]`
}

function formatTs(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

function formatPayload(kind: string, payload: Record<string, unknown>): string {
  if (kind === 'llm_turn') {
    const content = typeof payload.content === 'string' ? payload.content : ''
    const { thinking, body } = splitThink(content)
    const parts: string[] = []
    if (thinking) parts.push(`【思考】\n${thinking}`)
    parts.push(body ? `【正文】\n${body}` : '【正文】（无）')
    return parts.join('\n\n')
  }
  if (kind === 'tool_call') {
    const name = typeof payload.name === 'string' ? payload.name : ''
    const id = typeof payload.id === 'string' ? payload.id : ''
    const head = [name, id].filter(Boolean).join(' ')
    const bits: string[] = []
    if (head) bits.push(head)
    if (payload.input !== undefined) bits.push(`input ${previewValue(payload.input)}`)
    if (payload.output !== undefined) bits.push(`output ${previewValue(payload.output)}`)
    if (payload.error) bits.push(`error ${previewValue(payload.error)}`)
    if (payload.detail !== undefined) bits.push(`detail ${previewValue(payload.detail)}`)
    return bits.join('\n')
  }
  if (kind === 'status' || kind === 'error') {
    return typeof payload.message === 'string' ? payload.message : previewValue(payload)
  }
  if (kind === 'run_end') {
    return typeof payload.reason === 'string' ? payload.reason : previewValue(payload)
  }
  return previewValue(payload, 800)
}

/** 把 jsonl 运行日志格式化成可读纸带：正文单独标出，超长工具入参截断。 */
export function formatAgentLogView(raw: string): string {
  if (!raw.trim()) return ''
  const blocks: string[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: LogLine
    try {
      parsed = JSON.parse(trimmed) as LogLine
    } catch {
      blocks.push(trimmed)
      continue
    }
    const kind = parsed.kind ?? 'unknown'
    const ts = formatTs(parsed.ts)
    const body = formatPayload(kind, parsed.payload ?? {})
    blocks.push(`── ${kind}${ts ? `  ${ts}` : ''} ──\n${body}`)
  }
  return blocks.join('\n\n')
}
