import { useEffect, useState } from 'react'
import type { Theme } from '../lib/theme'
import { MemoryView } from './MemoryView'
import { SettingsPanel } from './SettingsPanel'
import { McpSettingsPanel } from './McpSettingsPanel'
import { LogsView } from './LogsView'

export type SettingsTab = 'memory' | 'general' | 'mcp' | 'logs'

const TABS: { key: SettingsTab; label: string; hint: string; icon: React.JSX.Element }[] = [
  {
    key: 'memory',
    label: '记忆',
    hint: '偏好、规范与可复用工作流',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
    )
  },
  {
    key: 'general',
    label: '常规设置',
    hint: '模型接入、运行参数与外观',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
        <circle cx="15" cy="7" r="2" />
        <circle cx="9" cy="17" r="2" />
      </svg>
    )
  },
  {
    key: 'mcp',
    label: 'MCP',
    hint: 'stdio 服务器、连接状态与 env',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 8h3v8H8zM13 8h3v8h-3z" />
        <path d="M4 12h4M16 12h4" />
      </svg>
    )
  },
  {
    key: 'logs',
    label: '运行日志',
    hint: '每次 turn 与工具调用的 L2 记录',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h14M5 12h14M5 18h9" />
      </svg>
    )
  }
]

type Props = {
  open: boolean
  initialTab?: SettingsTab
  onClose: () => void
  theme: Theme
  onToggleTheme: () => void
}

export function SettingsDialog({
  open,
  initialTab = 'general',
  onClose,
  theme,
  onToggleTheme
}: Props): React.JSX.Element | null {
  const [tab, setTab] = useState<SettingsTab>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`settings-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="settings-content" key={tab}>
          <div className="settings-content-head">
            <h2>{TABS.find((t) => t.key === tab)?.label}</h2>
            <p className="muted">{TABS.find((t) => t.key === tab)?.hint}</p>
          </div>
          {tab === 'memory' ? <MemoryView /> : null}
          {tab === 'general' ? <SettingsPanel theme={theme} onToggleTheme={onToggleTheme} /> : null}
          {tab === 'mcp' ? <McpSettingsPanel /> : null}
          {tab === 'logs' ? <LogsView /> : null}
        </div>
        <button type="button" className="settings-close" aria-label="关闭" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
