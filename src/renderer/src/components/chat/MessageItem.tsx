import { useState } from 'react'

export type ChatMsg = {
  id?: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt?: string
  kind?: 'result'
  /** tool 消息专用 */
  toolName?: string
  input?: unknown
  output?: unknown
}

type Props = { msg: ChatMsg }

export function MessageItem({ msg }: Props): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  if (msg.role === 'tool') {
    return (
      <div className="msg msg-tool">
        <div className="msg-tool-head">
          <span className="msg-tool-name">{msg.toolName ?? 'tool'}</span>
          {msg.content && <span className="msg-tool-summary">{summarize(msg.content)}</span>}
          <button type="button" className="btn-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? '收起' : '展开'}
          </button>
        </div>
        {expanded && (
          <pre className="msg-tool-detail">{JSON.stringify(msg.output ?? msg.content, null, 2)}</pre>
        )}
      </div>
    )
  }
  if (msg.role === 'system') {
    return (
      <div className="msg msg-system">
        <span>{msg.content}</span>
      </div>
    )
  }
  if (msg.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-content">{msg.content}</div>
      </div>
    )
  }
  // assistant
  return (
    <div className="msg msg-assistant">
      <div className="msg-content">{msg.kind === 'result' ? <strong>{msg.content}</strong> : msg.content}</div>
    </div>
  )
}

function summarize(content: string): string {
  const firstLine = content.split('\n')[0]?.slice(0, 60) ?? ''
  return firstLine.length > 0 ? firstLine : '(无内容)'
}
