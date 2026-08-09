export type NavKey = 'chat' | 'memory' | 'skills'

type Props = {
  active: NavKey
  onChange: (key: NavKey) => void
}

const items: { key: NavKey; label: string }[] = [
  { key: 'chat', label: '聊天' },
  { key: 'memory', label: '记忆' },
  { key: 'skills', label: '技能' }
]

export function Sidebar({ active, onChange }: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">my-agent</div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`nav-btn${active === item.key ? ' active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </aside>
  )
}
