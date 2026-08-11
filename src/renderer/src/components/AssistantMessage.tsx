import { useState } from 'react'
import { splitAssistantContent } from '../lib/splitAssistantContent'
import { MarkdownBody } from './MarkdownBody'

type Props = {
  content: string
}

export function AssistantMessage({ content }: Props): React.JSX.Element {
  const { thinking, body, thinkingOpen } = splitAssistantContent(content)
  const [userOpen, setUserOpen] = useState(false)
  const shownOpen = thinkingOpen || userOpen
  const bodyText = body || (!thinking ? content : '')

  return (
    <div className="assistant-block">
      {thinking ? (
        <div className={`thinking${thinkingOpen ? ' thinking-live' : ''}`}>
          <button
            type="button"
            className="thinking-toggle"
            onClick={() => setUserOpen((v) => !v)}
            aria-expanded={shownOpen}
          >
            <span className="thinking-dot" aria-hidden="true" />
            <span>{thinkingOpen ? '思考中…' : '思考过程'}</span>
            <span className={`thinking-chevron${shownOpen ? ' open' : ''}`} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </span>
          </button>
          {shownOpen ? <pre className="thinking-body">{thinking}</pre> : null}
        </div>
      ) : null}
      {bodyText ? <MarkdownBody content={bodyText} /> : null}
    </div>
  )
}
