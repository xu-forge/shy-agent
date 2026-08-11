import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getShyPaths } from '../paths'

export type RunLogKind =
  | 'run_start'
  | 'run_end'
  | 'llm_turn'
  | 'tool_call'
  | 'status'
  | 'error'

export type RunLogLine = {
  ts: string
  runId: string
  sessionId: string
  kind: RunLogKind
  payload: Record<string, unknown>
}

const MAX_FIELD_CHARS = 16 * 1024

export function truncateField(value: unknown, max = MAX_FIELD_CHARS): unknown {
  if (typeof value !== 'string') {
    if (value == null) return value
    try {
      const s = JSON.stringify(value)
      if (s.length <= max) return value
      return s.slice(0, max) + `…[truncated ${s.length - max} chars]`
    } catch {
      return String(value).slice(0, max)
    }
  }
  if (value.length <= max) return value
  return value.slice(0, max) + `…[truncated ${value.length - max} chars]`
}

export class AgentRunLogWriter {
  readonly runId: string
  readonly sessionId: string
  readonly filePath: string
  private queue: Promise<void> = Promise.resolve()

  constructor(
    sessionId: string,
    runId: string = randomUUID(),
    logsAgentDir: string = getShyPaths().logsAgentDir
  ) {
    this.sessionId = sessionId
    this.runId = runId
    this.filePath = join(logsAgentDir, `${runId}.jsonl`)
  }

  start(extra: Record<string, unknown> = {}): void {
    this.append('run_start', extra)
  }

  end(reason?: string, extra: Record<string, unknown> = {}): void {
    this.append('run_end', { reason, ...extra })
  }

  append(kind: RunLogKind, payload: Record<string, unknown> = {}): void {
    const line: RunLogLine = {
      ts: new Date().toISOString(),
      runId: this.runId,
      sessionId: this.sessionId,
      kind,
      payload: Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, truncateField(v)])
      )
    }
    const text = JSON.stringify(line) + '\n'
    this.queue = this.queue
      .then(async () => {
        await mkdir(getShyPaths().logsAgentDir, { recursive: true })
        await appendFile(this.filePath, text, 'utf8')
      })
      .catch((err) => {
        console.error('[shy] agent run log append failed:', err)
      })
  }

  /** 测试用：等待队列排空 */
  async flush(): Promise<void> {
    await this.queue
  }
}

/** 将 agent/graph 事件映射为 L2 日志行 */
export function mapAgentEventToLog(
  writer: AgentRunLogWriter,
  event: { type: string; [k: string]: unknown }
): void {
  switch (event.type) {
    case 'assistant':
      writer.append('llm_turn', { content: event.content })
      break
    case 'tool':
      writer.append('tool_call', { name: event.name, detail: event.detail })
      break
    case 'status':
      writer.append('status', { message: event.message })
      break
    case 'error':
      writer.append('error', { message: event.message })
      break
    case 'done':
      writer.end(typeof event.reason === 'string' ? event.reason : undefined)
      break
    default:
      break
  }
}
