/**
 * ToolCallCard — 工具调用卡片：工具名 + input 参数 + 可折叠 output。
 *
 * 设计：
 * - 头部：工具名 + chip
 * - input：默认展开（让用户理解 LLM 在做什么）
 * - output：默认折叠（长 JSON 不占视觉空间）
 */
import { useState } from 'react'

type Props = {
  toolName: string
  input?: unknown
  content: string
}

export function ToolCallCard({ toolName, input, content }: Props): React.JSX.Element {
  const [outputOpen, setOutputOpen] = useState(false)
  const hasInput = input !== undefined && input !== null
  const formattedOutput = typeof content === 'string' ? content : JSON.stringify(content, null, 2)

  return (
    <div className="tool-card">
      <div className="msg-head">
        <span className="msg-avatar" aria-hidden="true" style={{ background: 'var(--tool)' }}>
          ⚙
        </span>
        <span className="msg-name">{toolName}</span>
        <span className="chip chip-tool">工具调用</span>
      </div>
      {hasInput && (
        <div className="tool-input">
          <span className="tool-section-label">输入参数</span>
          <pre>{typeof input === 'string' ? input : JSON.stringify(input, null, 2)}</pre>
        </div>
      )}
      <div className="tool-output">
        <button
          type="button"
          className="btn-toggle"
          onClick={() => setOutputOpen((v) => !v)}
          aria-expanded={outputOpen}
        >
          {outputOpen ? '收起结果' : '查看结果'}
        </button>
        {outputOpen && <pre>{formattedOutput}</pre>}
      </div>
    </div>
  )
}
