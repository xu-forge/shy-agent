/**
 * ToolCallCard — 未知工具 fallback：默认折叠，点开看「输入 / 结果」。
 */
import { ToolRowShell } from './toolRenderers/ToolRowShell'

export type ToolStatus = 'running' | 'done' | 'failed'

/** browser 工具结果中的截图路径 → shy-asset URL */
function assetUrl(path: string): string {
  const idx = path.lastIndexOf('.shy/')
  const rel = idx >= 0 ? path.slice(idx + 5) : path
  return `shy-asset://${rel}`
}

function parseMaybeJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'string') {
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  }
  try {
    const parsed = JSON.parse(v)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export function ToolCallCard({
  toolName,
  input,
  result,
  error,
  status = 'done',
  isLast = false
}: {
  toolName: string
  input?: unknown
  result?: unknown
  error?: string
  status?: ToolStatus
  isLast?: boolean
}): React.JSX.Element {
  const resultObj = parseMaybeJson(result)
  const browserShotPath =
    toolName === 'browser' && resultObj && typeof resultObj.path === 'string' ? resultObj.path : ''

  return (
    <ToolRowShell
      toolName={toolName}
      input={input}
      result={result}
      error={error}
      status={status}
      isLast={isLast}
      extra={
        browserShotPath ? (
          <img className="tool-shot-thumb" src={assetUrl(browserShotPath)} alt="browser 截图" />
        ) : null
      }
    />
  )
}
