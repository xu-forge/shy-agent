/**
 * 流式拆分 LLM content：把 <think>/<thinking>/<reason>/<reasoning> 从可见正文中抽出。
 * 跨 chunk 持有状态，供 turn-runner emit reasoning_delta / assistant_delta。
 */

export type ThinkingStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'reasoning_done' }

const TAG = 'think|thinking|reason|reasoning'
const OPEN_RE = new RegExp(`<(${TAG})\\b[^>]*>`, 'i')
const CLOSE_RE = new RegExp(`</(${TAG})>`, 'i')

const TAG_PREFIXES = [
  '<',
  '</',
  '<t',
  '<th',
  '<thi',
  '<thin',
  '<think',
  '<thinking',
  '</t',
  '</th',
  '</thi',
  '</thin',
  '</think',
  '</thinking',
  '<r',
  '<re',
  '<rea',
  '<reas',
  '<reaso',
  '<reason',
  '<reasoni',
  '<reasonin',
  '<reasoning',
  '</r',
  '</re',
  '</rea',
  '</reas',
  '</reaso',
  '</reason',
  '</reasoni',
  '</reasonin',
  '</reasoning'
]

/** 缓冲末尾是否可能是未写完的开/闭标签前缀 */
function danglingTagPrefix(s: string): number {
  const lt = s.lastIndexOf('<')
  if (lt < 0) return 0
  const tail = s.slice(lt)
  if (tail.includes('>')) return 0
  return TAG_PREFIXES.includes(tail.toLowerCase()) ? tail.length : 0
}

export class ThinkingStreamParser {
  private mode: 'text' | 'reasoning' = 'text'
  private buf = ''
  private emittedReasoning = false

  push(chunk: string): ThinkingStreamEvent[] {
    if (!chunk) return []
    this.buf += chunk
    return this.drain(false)
  }

  flush(): ThinkingStreamEvent[] {
    return this.drain(true)
  }

  private drain(end: boolean): ThinkingStreamEvent[] {
    const out: ThinkingStreamEvent[] = []
    while (this.buf.length > 0) {
      if (this.mode === 'text') {
        const m = this.buf.match(OPEN_RE)
        if (!m || m.index === undefined) {
          if (!end) {
            const hold = danglingTagPrefix(this.buf)
            if (hold > 0) {
              const emit = this.buf.slice(0, this.buf.length - hold)
              if (emit) out.push({ type: 'text', delta: emit })
              this.buf = this.buf.slice(-hold)
              break
            }
          }
          out.push({ type: 'text', delta: this.buf })
          this.buf = ''
          break
        }
        if (m.index > 0) out.push({ type: 'text', delta: this.buf.slice(0, m.index) })
        this.buf = this.buf.slice(m.index + m[0].length)
        this.mode = 'reasoning'
        this.emittedReasoning = false
      } else {
        const m = this.buf.match(CLOSE_RE)
        if (!m || m.index === undefined) {
          if (!end) {
            const hold = danglingTagPrefix(this.buf)
            if (hold > 0) {
              const emit = this.buf.slice(0, this.buf.length - hold)
              if (emit) {
                out.push({ type: 'reasoning', delta: emit })
                this.emittedReasoning = true
              }
              this.buf = this.buf.slice(-hold)
              break
            }
          }
          if (this.buf) {
            out.push({ type: 'reasoning', delta: this.buf })
            this.emittedReasoning = true
            this.buf = ''
          }
          if (end) {
            if (this.emittedReasoning || this.mode === 'reasoning') {
              out.push({ type: 'reasoning_done' })
            }
            this.mode = 'text'
            this.emittedReasoning = false
          }
          break
        }
        if (m.index > 0) {
          out.push({ type: 'reasoning', delta: this.buf.slice(0, m.index) })
          this.emittedReasoning = true
        }
        this.buf = this.buf.slice(m.index + m[0].length)
        out.push({ type: 'reasoning_done' })
        this.mode = 'text'
        this.emittedReasoning = false
      }
    }
    if (end && this.mode === 'reasoning') {
      out.push({ type: 'reasoning_done' })
      this.mode = 'text'
      this.emittedReasoning = false
    }
    return out
  }
}
