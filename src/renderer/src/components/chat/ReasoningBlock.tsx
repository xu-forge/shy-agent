import { MarkdownBody } from '../MarkdownBody'

type Props = {
  content: string
  durationMs?: number
  streaming?: boolean
}

function formatDuration(ms?: number): string {
  if (ms === undefined || Number.isNaN(ms)) return ''
  const sec = Math.max(1, Math.round(ms / 1000))
  return `${sec} 秒`
}

/** 思考区：默认展开，展示耗时。 */
export function ReasoningBlock({ content, durationMs, streaming }: Props): React.JSX.Element {
  const time = formatDuration(durationMs)
  return (
    <details className="react-thinking reasoning-block" open>
      <summary className="react-thinking-head">
        <span className="think-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        思考{time ? ` · ${time}` : streaming ? '中…' : ''}
      </summary>
      <div className="react-thinking-body">
        <MarkdownBody content={content || '…'} />
      </div>
    </details>
  )
}
