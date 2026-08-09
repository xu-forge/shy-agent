export type NavKey = 'chat' | 'memory' | 'skills'

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
}

const items: { key: NavKey; label: string; icon: React.JSX.Element }[] = [
  {
    key: 'chat',
    label: '对话',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
      </svg>
    )
  },
  {
    key: 'memory',
    label: '记忆',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="5" y="5" width="14" height="14" rx="3" />
        <path d="M9 9h6M9 12h6M9 15h4" />
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
  }
]

export function Sidebar({ active, onChange }: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand" title="my-agent">
        m
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`nav-btn${active === item.key ? ' active' : ''}`}
          onClick={() => onChange(item.key)}
          aria-current={active === item.key ? 'page' : undefined}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
      <div className="rail-spacer" />
      <div className="rail-foot">my-agent</div>
    </aside>
  )
}
