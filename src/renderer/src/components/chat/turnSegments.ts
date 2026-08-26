/**
 * Turn 内时间轴片段：按 emit 顺序 interleave reasoning / tool / text。
 */
export type ToolStatus = 'running' | 'done' | 'failed'

export type TurnSegment =
  | {
      id: string
      kind: 'reasoning'
      content: string
      durationMs?: number
      startedAt: number
      done: boolean
    }
  | {
      id: string
      kind: 'tool'
      toolId: string
      toolName: string
      input?: unknown
      result?: unknown
      error?: string
      status: ToolStatus
    }
  | { id: string; kind: 'text'; content: string }

export type TurnEventLike = {
  type: string
  content?: string
  id?: string
  name?: string
  input?: unknown
  output?: unknown
  error?: string
}

export function applyTurnEvent(
  segments: readonly TurnSegment[],
  ev: TurnEventLike,
  now = Date.now()
): TurnSegment[] {
  switch (ev.type) {
    case 'reasoning_delta': {
      const last = segments[segments.length - 1]
      if (last?.kind === 'reasoning' && !last.done) {
        return [...segments.slice(0, -1), { ...last, content: last.content + (ev.content ?? '') }]
      }
      return [
        ...segments,
        {
          id: `r-${now}-${segments.length}`,
          kind: 'reasoning',
          content: ev.content ?? '',
          startedAt: now,
          done: false
        }
      ]
    }
    case 'reasoning_done': {
      const open = [...segments].reverse().find((s) => s.kind === 'reasoning' && !s.done)
      if (!open || open.kind !== 'reasoning') return [...segments]
      return segments.map((s) =>
        s.id === open.id && s.kind === 'reasoning'
          ? { ...s, done: true, durationMs: Math.max(0, now - s.startedAt) }
          : s
      )
    }
    case 'tool_call': {
      if (!ev.id) return [...segments]
      const idx = segments.findIndex((s) => s.kind === 'tool' && s.toolId === ev.id)
      if (idx >= 0) {
        const t = segments[idx]
        if (t.kind !== 'tool') return [...segments]
        const next = [...segments]
        next[idx] = {
          ...t,
          toolName: ev.name ?? t.toolName,
          input: ev.input ?? t.input,
          status: 'running'
        }
        return next
      }
      return [
        ...segments,
        {
          id: ev.id,
          kind: 'tool',
          toolId: ev.id,
          toolName: ev.name ?? 'tool',
          input: ev.input,
          status: 'running'
        }
      ]
    }
    case 'tool_result': {
      if (!ev.id) return [...segments]
      const idx = segments.findIndex((s) => s.kind === 'tool' && s.toolId === ev.id)
      const status: ToolStatus = ev.error ? 'failed' : 'done'
      if (idx >= 0) {
        const t = segments[idx]
        if (t.kind !== 'tool') return [...segments]
        const next = [...segments]
        next[idx] = { ...t, result: ev.output, error: ev.error, status }
        return next
      }
      return [
        ...segments,
        {
          id: ev.id,
          kind: 'tool',
          toolId: ev.id,
          toolName: String(ev.id),
          result: ev.output,
          error: ev.error,
          status
        }
      ]
    }
    case 'assistant_delta': {
      if (!ev.content) return [...segments]
      const last = segments[segments.length - 1]
      if (last?.kind === 'text') {
        return [...segments.slice(0, -1), { ...last, content: last.content + ev.content }]
      }
      return [...segments, { id: `txt-${now}-${segments.length}`, kind: 'text', content: ev.content }]
    }
    default:
      return [...segments]
  }
}

export function messagesToSegments(
  items: Array<{
    role: string
    content: string
    toolId?: string
    toolName?: string
    toolInput?: unknown
    toolResult?: unknown
    toolError?: string
    toolStatus?: ToolStatus
    durationMs?: number
  }>
): TurnSegment[] {
  return items.map((m, i) => {
    if (m.role === 'reasoning') {
      return {
        id: `hist-r-${i}`,
        kind: 'reasoning' as const,
        content: m.content,
        durationMs: m.durationMs,
        startedAt: 0,
        done: true
      }
    }
    if (m.role === 'tool') {
      return {
        id: m.toolId ?? `hist-t-${i}`,
        kind: 'tool' as const,
        toolId: m.toolId ?? `hist-t-${i}`,
        toolName: m.toolName ?? 'tool',
        input: m.toolInput,
        result: m.toolResult ?? m.content,
        error: m.toolError,
        status: m.toolStatus ?? 'done'
      }
    }
    return { id: `hist-txt-${i}`, kind: 'text' as const, content: m.content }
  })
}

export function hasReasoning(segments: readonly TurnSegment[]): boolean {
  return segments.some((s) => s.kind === 'reasoning' && s.content.trim())
}
