import type { NavKey } from '../lib/shellLayout'

export type { NavKey }

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
  onOpenSettings: () => void
  ipcOk: boolean | null
}

const RAIL_ITEMS: { key: NavKey; label: string; icon: React.JSX.Element }[] = [
  {
    key: 'projects',
    label: '项目',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5h6l1.5 2H20v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7.5Z" />
        <path d="M4 7.5V6.5A1.5 1.5 0 0 1 5.5 5h4.2L11 7.5" />
      </svg>
    )
  },
  {
    key: 'skills',
    label: '技能',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 7h11M8 12h11M8 17h11" />
        <path d="M5 7h.01M5 12h.01M5 17h.01" />
      </svg>
    )
  },
  {
    key: 'calendar',
    label: '日历',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5.5" width="16" height="15" rx="2.5" />
        <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
        <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01" />
      </svg>
    )
  }
]

function ipcLabel(ipcOk: boolean | null): string {
  if (ipcOk === null) return '连接中…'
  return ipcOk ? '已连接' : '连接异常'
}

export function IconRail({ active, onChange, onOpenSettings, ipcOk }: Props): React.JSX.Element {
  return (
    <nav className="icon-rail" aria-label="主导航">
      <div className="icon-rail-top">
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`icon-rail-btn${active === item.key ? ' active' : ''}`}
            aria-label={item.label}
            aria-current={active === item.key ? 'page' : undefined}
            title={item.label}
            onClick={() => onChange(item.key)}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div className="icon-rail-bottom">
        <span
          className={`icon-rail-status${ipcOk === null ? '' : ipcOk ? ' ok' : ' err'}`}
          title={ipcLabel(ipcOk)}
          aria-label={ipcLabel(ipcOk)}
        >
          <span className="status-dot" aria-hidden="true" />
        </span>
        <button
          type="button"
          className="icon-rail-btn"
          aria-label="设置"
          title="设置"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3.5v2.2M12 18.3V20.5M4.9 6.5l1.6 1.6M17.5 16.9l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.9 17.5l1.6-1.6M17.5 7.1l1.6-1.6" />
          </svg>
        </button>
      </div>
    </nav>
  )
}
