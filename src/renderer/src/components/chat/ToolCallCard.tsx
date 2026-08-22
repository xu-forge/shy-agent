/**
 * ToolCallCard — 单条工具调用（时间轴一行），默认折叠，点开看「输入 / 结果」。
 *
 * 对齐 MiniMax：
 * - 左侧时间轴节点（圆点 + 连接线，最后一条无线）
 * - 收起：小图标 + 友好工具名 + 状态徽标，一行搞定
 * - 展开：一张卡，含 输入 / 结果（或 错误）两段
 * - call 与 result 在 ChatWorkspace 里已按 toolId 合并成同一条，这里只负责展示
 */
import { useState } from 'react'

export type ToolStatus = 'running' | 'done' | 'failed'

type Props = {
  toolName: string
  input?: unknown
  result?: unknown
  error?: string
  status?: ToolStatus
  isLast?: boolean
}

/** browser 工具结果中的截图路径 → shy-asset URL */
function assetUrl(path: string): string {
  const idx = path.lastIndexOf('.shy/')
  const rel = idx >= 0 ? path.slice(idx + 5) : path
  return `shy-asset://${rel}`
}

function parseMaybeJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'string') return (v as Record<string, unknown>) ?? null
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
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const running = status === 'running'
  const failed = status === 'failed'
  const hasInput = input !== undefined && input !== null
  const hasResult = result !== undefined && result !== null && result !== ''
  const inputText = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
  const resultText = typeof result === 'string' ? result : JSON.stringify(result, null, 2)

  // minimax-feature-port：browser / dispatch_subagent 卡片增强
  const inputObj = parseMaybeJson(input)
  const resultObj = parseMaybeJson(result)
  const browserAction =
    toolName === 'browser' && inputObj ? String(inputObj.action ?? '') : ''
  const browserShotPath =
    toolName === 'browser' && resultObj && typeof resultObj.path === 'string'
      ? (resultObj.path as string)
      : ''
  const subagentType =
    toolName === 'dispatch_subagent' && inputObj ? String(inputObj.type ?? '') : ''
  const label =
    toolName === 'browser'
      ? `browser · ${browserAction || '?'}`
      : toolName === 'dispatch_subagent'
        ? `dispatch_subagent · ${subagentType || '?'}`
        : toolName

  return (
    <div className={`tool-item${failed ? ' failed' : ''}${running ? ' running' : ''}`}>
      <div className="tool-node" aria-hidden="true">
        <span className="tool-dot" />
        {!isLast ? <span className="tool-line" /> : null}
      </div>
      <button
        type="button"
        className="tool-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? '收起' : '展开'}
      >
        <span className="tool-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 0 0 18M3.5 9h17M3.5 15h17" />
          </svg>
        </span>
        <span className="tool-label">{label}</span>
        <span className={`tool-status ${failed ? 'failed' : running ? 'running' : 'done'}`}>
          <span className="tool-status-dot" aria-hidden="true" />
          {failed ? '失败' : running ? '执行中' : '已完成'}
        </span>
      </button>
      {open ? (
        <div className="tool-card">
          {hasInput ? (
            <div className="tool-section">
              <span className="tool-section-label">输入</span>
              <pre>{inputText}</pre>
            </div>
          ) : null}
          {failed && error ? (
            <div className="tool-section">
              <span className="tool-section-label">错误</span>
              <pre className="tool-error">{error}</pre>
            </div>
          ) : hasResult ? (
            <div className="tool-section">
              <span className="tool-section-label">结果</span>
              <pre>{resultText}</pre>
              {browserShotPath ? (
                <img
                  className="tool-shot-thumb"
                  src={assetUrl(browserShotPath)}
                  alt="browser 截图"
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
