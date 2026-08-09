export type ModeKey = 'interactive' | 'goal'

type Props = {
  mode: ModeKey
  onChange: (mode: ModeKey) => void
}

export function ModeToggle({ mode, onChange }: Props): React.JSX.Element {
  return (
    <div className="mode-toggle" title="壳阶段仅占位，尚未接通执行引擎">
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
