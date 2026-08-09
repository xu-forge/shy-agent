export type SplitAssistant = {
  thinking: string
  body: string
  /** true when a think block is still open (streaming) */
  thinkingOpen: boolean
}

const CLOSED =
  /<(?:think|thinking|reason|reasoning)\b[^>]*>([\s\S]*?)<\/(?:think|thinking|reason|reasoning)>/gi

/**
 * Split model output into thinking vs answer body.
 * Supports <think>/<thinking>/<reason>/<reasoning> tags (common with Minimax etc).
 */
export function splitAssistantContent(raw: string): SplitAssistant {
  if (!raw) return { thinking: '', body: '', thinkingOpen: false }

  const thinkingParts: string[] = []
  let body = raw.replace(CLOSED, (_m, inner: string) => {
    thinkingParts.push(String(inner).trim())
    return ''
  })

  // Incomplete open tag while streaming
  const open = body.match(/<(?:think|thinking|reason|reasoning)\b[^>]*>([\s\S]*)$/i)
  let thinkingOpen = false
  if (open) {
    thinkingOpen = true
    thinkingParts.push(open[1].trim())
    body = body.slice(0, open.index)
  }

  // Fallback: fenced ```thinking / ```think blocks
  body = body.replace(
    /```(?:thinking|think|reasoning)\s*\n([\s\S]*?)```/gi,
    (_m, inner: string) => {
      thinkingParts.push(String(inner).trim())
      return ''
    }
  )

  return {
    thinking: thinkingParts.filter(Boolean).join('\n\n').trim(),
    body: body.trim(),
    thinkingOpen
  }
}
