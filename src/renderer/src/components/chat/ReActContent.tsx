/**
 * ReActContent — 把 assistant content 以「普通展示」渲染（对齐 MiniMax）。
 *
 * 设计（对齐参考图）：
 * - 推理（<think>...</think> / <thinking>...</thinking>）收进一个可折叠的「思考 N 次」
 * - 其余正文用**纯 Markdown** 渲染，无背景卡片 —— 只有用户消息才有背景色
 */
import { useMemo } from 'react'
import { MarkdownBody } from '../MarkdownBody'

type Props = { content: string; skipThinking?: boolean; streaming?: boolean }

/** 提取推理块并去掉 think 标签，剩余作为正文 */
function splitReasoning(content: string): { reasoning: string; reply: string } {
  const blocks: string[] = []
  const stripped = content
    .replace(/<think\b[^>]*>([\s\S]*?)<\/think>/gi, (_m, inner: string) => {
      const t = inner.trim()
      if (t) blocks.push(t)
      return ''
    })
    .replace(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/gi, (_m, inner: string) => {
      const t = inner.trim()
      if (t) blocks.push(t)
      return ''
    })
  return { reasoning: blocks.join('\n\n'), reply: stripped.trim() }
}

function countThinkBlocks(content: string): number {
  const m = content.match(/<think\b[^>]*>[\s\S]*?<\/think>|<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi)
  return m ? m.length : 0
}

export function ReActContent({ content, skipThinking = false, streaming = false }: Props): React.JSX.Element {
  const { reasoning, reply } = useMemo(() => splitReasoning(content), [content])
  const thinkCount = useMemo(() => countThinkBlocks(content), [content])
  const showThinking = Boolean(reasoning) && !skipThinking

  return (
    <div className="react-plain">
      {showThinking ? (
        <details className="react-thinking">
          <summary className="react-thinking-head">
            <span className="think-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
            思考 {thinkCount || 1} 次
          </summary>
          <div className="react-thinking-body">
            <MarkdownBody content={reasoning} />
          </div>
        </details>
      ) : null}
      {streaming ? <div className="react-streaming-text">{reply}</div> : <MarkdownBody content={reply} />}
    </div>
  )
}
