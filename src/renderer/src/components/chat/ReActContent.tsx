/**
 * ReActContent — 解析 assistant content 的 Thought/Action/Observation 段，分别展示。
 *
 * 设计目标：
 * - Thought 段：浅灰背景 + 💭 图标
 * - Action 段：蓝色背景 + ⚡ 图标
 * - Observation 段：橙色背景 + 👁 图标（通常由工具结果触发，不会出现在 assistant 内容）
 * - 无标签内容：原样显示（兼容 simple Q&A）
 */
import { useMemo } from 'react'
import { parseReActContent } from '../../../../shared/react-parser'
import { MarkdownBody } from '../MarkdownBody'

type Props = { content: string }

export function ReActContent({ content }: Props): React.JSX.Element {
  const parts = useMemo(() => parseReActContent(content), [content])
  const hasStructure = Boolean(parts.thought || parts.action || parts.observation)

  if (!hasStructure) {
    // 无标签内容：原样渲染 Markdown
    return <div className="react-fallback"><MarkdownBody content={content} /></div>
  }

  return (
    <div className="react-content">
      {parts.thought && (
        <div className="react-segment react-thought">
          <span className="react-tag">Thought</span>
          <MarkdownBody content={parts.thought} />
        </div>
      )}
      {parts.action && (
        <div className="react-segment react-action">
          <span className="react-tag">Action</span>
          <MarkdownBody content={parts.action} />
        </div>
      )}
      {parts.observation && (
        <div className="react-segment react-observation">
          <span className="react-tag">Observation</span>
          <MarkdownBody content={parts.observation} />
        </div>
      )}
    </div>
  )
}
