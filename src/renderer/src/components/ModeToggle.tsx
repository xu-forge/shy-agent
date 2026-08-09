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
      >
        交互式
      </button>
      <button
        type="button"
        className={mode === 'goal' ? 'active' : ''}
        onClick={() => onChange('goal')}
      >
        目标
      </button>
    </div>
  )
}
