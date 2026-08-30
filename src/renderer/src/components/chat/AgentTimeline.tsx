import { ReActContent } from './ReActContent'
import { memo } from 'react'
import { ReasoningBlock } from './ReasoningBlock'
import { getToolRenderer, registerToolRenderer } from './toolRenderers'
import { SearchToolRenderer, WebFetchRenderer } from './toolRenderers/SearchFetch'
import {
  EditFileRenderer,
  ExecuteCommandRenderer,
  GlobRenderer,
  GrepRenderer,
  ListDirRenderer,
  ReadFileRenderer,
  WriteFileRenderer
} from './toolRenderers/FsShell'
import {
  ArtifactRenderer,
  AskUserRenderer,
  ReadLintsRenderer,
  ReadMeRenderer,
  TaskToolRenderer,
  WidgetRenderer
} from './toolRenderers/Visual'
import type { TurnSegment } from './turnSegments'
import { hasReasoning } from './turnSegments'

let registered = false
function ensureRenderers(): void {
  if (registered) return
  registered = true
  registerToolRenderer('web_search', SearchToolRenderer)
  registerToolRenderer('web_fetch', WebFetchRenderer)
  registerToolRenderer('browser_fetch', WebFetchRenderer)
  registerToolRenderer('grep', GrepRenderer)
  registerToolRenderer('glob', GlobRenderer)
  registerToolRenderer('fs_list', ListDirRenderer)
  registerToolRenderer('fs_edit', EditFileRenderer)
  registerToolRenderer('fs_read', ReadFileRenderer)
  registerToolRenderer('fs_write', WriteFileRenderer)
  registerToolRenderer('shell_exec', ExecuteCommandRenderer)
  registerToolRenderer('read_me', ReadMeRenderer)
  registerToolRenderer('show_widget', WidgetRenderer)
  registerToolRenderer('present_artifact', ArtifactRenderer)
  registerToolRenderer('ask_user', AskUserRenderer)
  registerToolRenderer('read_lints', ReadLintsRenderer)
  registerToolRenderer('task', TaskToolRenderer)
  registerToolRenderer('task_query', TaskToolRenderer)
  registerToolRenderer('task_output', TaskToolRenderer)
  registerToolRenderer('task_stop', TaskToolRenderer)
}

type Props = {
  segments: TurnSegment[]
  streaming?: boolean
}

export const AgentTimeline = memo(function AgentTimeline({ segments, streaming }: Props): React.JSX.Element {
  ensureRenderers()
  const skipThinking = hasReasoning(segments)
  const lastIdx = segments.length - 1
  return (
    <div className="tool-timeline agent-timeline">
      {segments.map((seg, i) => {
        const isLast = i === lastIdx
        if (seg.kind === 'reasoning') {
          return (
            <ReasoningBlock
              key={seg.id}
              content={seg.content}
              durationMs={seg.durationMs}
              streaming={!seg.done && streaming}
            />
          )
        }
        if (seg.kind === 'tool') {
          const Renderer = getToolRenderer(seg.toolName)
          return (
            <Renderer
              key={seg.id}
              toolName={seg.toolName}
              input={seg.input}
              result={seg.result}
              error={seg.error}
              status={seg.status}
              isLast={isLast}
            />
          )
        }
        return (
          <div key={seg.id} className="timeline-text">
            <ReActContent content={seg.content} skipThinking={skipThinking} streaming={isLast && streaming} />
          </div>
        )
      })}
    </div>
  )
})
