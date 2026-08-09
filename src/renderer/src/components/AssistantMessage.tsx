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
            <span className="thinking-chevron" data-open={shownOpen ? '1' : '0'}>
              ▸
            </span>
            {thinkingOpen ? '思考中…' : '思考过程'}
          </button>
          {shownOpen ? <pre className="thinking-body">{thinking}</pre> : null}
        </div>
      ) : null}
      {bodyText ? <MarkdownBody content={bodyText} /> : null}
    </div>
  )
}
