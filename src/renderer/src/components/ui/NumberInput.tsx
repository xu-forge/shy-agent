import { useEffect, useState } from 'react'

type Props = {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  ariaLabel?: string
  disabled?: boolean
  /** 宽度档位 */
  width?: 's' | 'm'
}

/**
 * 自绘数字输入 — 带减/加步进按钮，替换原生 number input。
 * 本地维护文本态，允许临时输入非完整数字，失焦/步进时钳制到 [min,max]。
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  ariaLabel,
  disabled,
  width
}: Props): React.JSX.Element {
  const [text, setText] = useState(String(value))

  // 外部值变化（如重置表单）时同步
  useEffect(() => {
    setText(String(value))
  }, [value])

  const clamp = (n: number): number => {
    if (Number.isFinite(min) && n < min!) n = min!
    if (Number.isFinite(max) && n > max!) n = max!
    return n
  }

  const commit = (raw: string): void => {
    const n = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(n)) {
      setText(String(value))
      return
    }
    const c = clamp(Math.round(n))
    setText(String(c))
    onChange(c)
  }

  const nudge = (dir: 1 | -1): void => {
    const c = clamp((Number.isFinite(Number(text)) ? Number(text) : value) + dir * step)
    setText(String(c))
    onChange(c)
  }

  return (
    <span className={`ui-num${width === 's' ? ' ui-num-s' : ''}`}>
      <button
        type="button"
        className="ui-num-btn"
        aria-label="减少"
        disabled={disabled}
        onClick={() => nudge(-1)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            nudge(1)
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            nudge(-1)
          } else if (e.key === 'Enter') {
            commit((e.target as HTMLInputElement).value)
          }
        }}
      />
      <button
        type="button"
        className="ui-num-btn"
        aria-label="增加"
        disabled={disabled}
        onClick={() => nudge(1)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 4v8M4 8h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  )
}
