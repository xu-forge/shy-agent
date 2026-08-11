export type ModeKey = 'interactive' | 'goal'

type Props = {
  mode: ModeKey
  onChange: (mode: ModeKey) => void
}

export function ModeToggle({ mode, onChange }: Props): React.JSX.Element {
  return (
    <div className="mode-toggle" title="交互式逐步协作；目标模式自动续跑">
      <button
        type="button"
        className={mode === 'interactive' ? 'active' : ''}
        onClick={() => onChange('interactive')}
        aria-pressed={mode === 'interactive'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
        </svg>
        交互式
      </button>
      <button
        type="button"
        className={mode === 'goal' ? 'active' : ''}
        onClick={() => onChange('goal')}
        aria-pressed={mode === 'goal'}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3.5" />
          <circle cx="12" cy="12" r="0.6" fill="currentColor" />
        </svg>
        目标
      </button>
    </div>
  )
}
