/**
 * 流式增量缓冲：50ms 合并同角色 delta。
 * 角色切换（reasoning → assistant）时必须先交出旧 pending，
 * 否则思考块末尾会被正文增量覆盖丢掉（界面上像被截断）。
 */

export type StreamDeltaRole = 'assistant' | 'reasoning'

export type PendingDelta = { role: StreamDeltaRole; content: string }

export function enqueueStreamDelta(
  pending: PendingDelta | null,
  role: StreamDeltaRole,
  chunk: string
): { flush: PendingDelta | null; pending: PendingDelta } {
  if (pending && pending.role !== role) {
    return { flush: pending, pending: { role, content: chunk } }
  }
  return {
    flush: null,
    pending: { role, content: pending ? pending.content + chunk : chunk }
  }
}

export type StreamMsgLike = { role: string; content: string }

/** 用完整 assistant 快照补齐被节流丢掉的思考，正文去掉 think 标签避免重复。 */
export function mergeAssistantSnapshot<T extends StreamMsgLike>(
  streaming: readonly T[],
  split: { thinking: string; body: string },
  raw: string,
  makeMsg: (role: 'reasoning' | 'assistant', content: string) => T
): T[] {
  const next = streaming.map((m) => ({ ...m }))
  if (split.thinking) {
    const idx = next.findIndex((m) => m.role === 'reasoning')
    if (idx >= 0) {
      if (split.thinking.length > next[idx]!.content.length) {
        next[idx] = { ...next[idx]!, content: split.thinking }
      }
    } else {
      next.unshift(makeMsg('reasoning', split.thinking))
    }
  }
  const body = split.body || (!split.thinking ? raw : '')
  const aidx = findLastIndex(next, (m) => m.role === 'assistant')
  if (aidx >= 0) {
    next[aidx] = { ...next[aidx]!, content: body }
  } else if (body) {
    next.push(makeMsg('assistant', body))
  }
  return next
}

function findLastIndex<T>(arr: readonly T[], pred: (v: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (pred(arr[i]!)) return i
  }
  return -1
}
