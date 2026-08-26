/**
 * 时间轴工具行：收起只显示标签，点击展开「输入 / 结果」。
 * 专用 Renderer 把摘要放 children；无 children 时结果区走 JSON。
 */
import { useState } from 'react'
import { getToolLabel } from '../../../lib/toolLabels'
import type { ToolRendererProps } from './index'
import { formatToolIo } from './formatToolIo'

type Props = ToolRendererProps & {
  children?: React.ReactNode
  extra?: React.ReactNode
  /** 询问用户等：交互区始终可见，点标题仍展开输入/原始结果 */
  alwaysShowBody?: boolean
  failed?: boolean
}

export function ToolRowShell({
  toolName,
  input,
  result,
  error,
  status = 'done',
  isLast = false,
  children,
  extra,
  alwaysShowBody = false,
  failed: failedProp
}: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const running = status === 'running'
  const failed = failedProp ?? status === 'failed'
  const hasInput = input !== undefined && input !== null
  const hasResult = result !== undefined && result !== null && result !== ''
  const inputText = formatToolIo(input)
  const resultText = formatToolIo(result)

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
        title={open ? '收起参数和结果' : '展开参数和结果'}
      >
        <span className={`tool-row-chevron${open ? ' open' : ''}`} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
        <span className="tool-label">{getToolLabel(toolName, input)}</span>
        <span className={`tool-status ${failed ? 'failed' : running ? 'running' : 'done'}`}>
          <span className="tool-status-dot" aria-hidden="true" />
          {failed ? '失败' : running ? '进行中…' : '已完成'}
        </span>
      </button>
      {alwaysShowBody && children ? <div className="tool-card tool-card-live">{children}</div> : null}
      {open ? (
        <div className="tool-card">
          <div className="tool-section">
            <span className="tool-section-label">输入</span>
            {hasInput ? <pre>{inputText}</pre> : <div className="search-empty">无参数</div>}
          </div>
          {running && !error && !alwaysShowBody ? (
            <div className="tool-section">
              <span className="tool-section-label">结果</span>
              <div className="search-empty">执行中…</div>
            </div>
          ) : error ? (
            <div className="tool-section">
              <span className="tool-section-label">错误</span>
              <pre className="tool-error">{error}</pre>
            </div>
          ) : (
            <div className="tool-section">
              <span className="tool-section-label">结果</span>
              {!alwaysShowBody && children ? children : null}
              {hasResult ? <pre>{resultText}</pre> : !children ? <div className="search-empty">无结果</div> : null}
              {extra}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
