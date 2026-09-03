import type { ReactNode } from 'react'

type Props = {
  label: string
  children: ReactNode
  hint?: ReactNode
  /** label 与控件同行右对齐（用于紧凑表单） */
  inline?: boolean
  /**
   * 仅当 children 为原生可关联控件（input/textarea）时使用。
   * 自绘 Select / 多控件组合 MUST NOT 包在 <label> 里，否则会出现：
   * - 点 label 空白区误触发第一个控件（命中面积虚大）
   * - 点按钮被 label 再派发一次 click（开关瞬间开合，像点了没反应）
   */
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

  // 有 htmlFor 时才用原生 label 关联；否则用 div，避免嵌套 button/combobox 的双击问题
  if (htmlFor) {
    return (
      <label className="ui-field" htmlFor={htmlFor}>
        <span className="ui-field-label">{label}</span>
        <div className="ui-field-control">{children}</div>
        {hint ? <span className="ui-field-hint">{hint}</span> : null}
      </label>
    )
  }

  return (
    <div className="ui-field">
      <span className="ui-field-label">{label}</span>
      <div className="ui-field-control">{children}</div>
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
    </div>
  )
}
