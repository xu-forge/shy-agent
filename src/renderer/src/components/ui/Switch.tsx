type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  ariaLabel?: string
  size?: 's' | 'm'
}

/** 自绘开关 — 替代原生 checkbox 的启用/禁用场景 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  ariaLabel,
  size = 'm'
}: Props): React.JSX.Element {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? label}
      className={`ui-switch${size === 's' ? ' ui-switch-s' : ''}${checked ? ' on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-knob" aria-hidden="true" />
    </button>
  )
  if (!label) return toggle
  return (
    <label className={`ui-switch-row${disabled ? ' disabled' : ''}`}>
      {toggle}
      <span className="ui-switch-label">{label}</span>
    </label>
  )
}
