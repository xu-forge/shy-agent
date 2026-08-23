import { Select } from './Select'

type Props = {
  /** "HH:mm" */
  value: string
  onChange: (value: string) => void
  ariaLabel?: string
  disabled?: boolean
}

const HOURS = Array.from({ length: 24 }, (_, h) => pad(h))
const MINUTES = Array.from({ length: 60 }, (_, m) => pad(m))

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** 时:分 双下拉选择器 — 替代原生 input[type=time] */
export function TimePicker({ value, onChange, ariaLabel, disabled }: Props): React.JSX.Element {
  const [h, m] = (value || '09:00').split(':')
  const hour = HOURS.includes(h!) ? h! : '09'
  const minute = MINUTES.includes(m!) ? m! : '00'
  return (
    <span className="ui-time">
      <Select
        className="ui-time-part"
        ariaLabel={ariaLabel ? `${ariaLabel}（时）` : '时'}
        disabled={disabled}
        value={hour}
        options={HOURS.map((v) => ({ value: v, label: v }))}
        onChange={(v) => onChange(`${v}:${minute}`)}
      />
      <span className="ui-time-sep" aria-hidden="true">
        :
      </span>
      <Select
        className="ui-time-part"
        ariaLabel={ariaLabel ? `${ariaLabel}（分）` : '分'}
        disabled={disabled}
        value={minute}
        options={MINUTES.map((v) => ({ value: v, label: v }))}
        onChange={(v) => onChange(`${hour}:${v}`)}
      />
    </span>
  )
}
