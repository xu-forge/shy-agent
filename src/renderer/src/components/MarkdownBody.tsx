import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { httpUrlFromMarkdownHref } from '../lib/markdownLink'
import { useOpenInBrowser } from '../lib/openInBrowser'

type Props = {
  content: string
}

export function MarkdownBody({ content }: Props): React.JSX.Element {
  const openInBrowser = useOpenInBrowser()
  if (!content.trim()) return <></>
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, node: _node, ...rest }) {
            return (
              <a
                {...rest}
                href={href}
                onClick={(e) => {
                  e.preventDefault()
                  const url = httpUrlFromMarkdownHref(href)
                  if (url) openInBrowser(url)
                }}
              >
                {children}
              </a>
            )
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
