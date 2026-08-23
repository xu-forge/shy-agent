import type { ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  hint?: ReactNode
  /** label 与控件同行右对齐（用于紧凑表单） */
  inline?: boolean
  htmlFor?: string
}

/** 表单字段壳：label / 控件 / hint 三段式 */
export function Field({ label, children, hint, inline, htmlFor }: Props): React.JSX.Element {
  if (inline) {
    return (
      <div className="ui-field ui-field-inline">
        <span className="ui-field-label">{label}</span>
        <div className="ui-field-control">{children}</div>
      </div>
    )
  }
  return (
    <label className="ui-field" htmlFor={htmlFor}>
      <span className="ui-field-label">{label}</span>
      <div className="ui-field-control">{children}</div>
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  )
}
