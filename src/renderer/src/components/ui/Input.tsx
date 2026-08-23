import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** 前缀图标/文字（如搜索放大镜） */
  prefix?: ReactNode
  /** 后缀内容（如单位、显隐切换按钮） */
  suffix?: ReactNode
  invalid?: boolean
}

/** 统一文本输入框 */
export function Input({ prefix, suffix, invalid, className, ...rest }: InputProps): React.JSX.Element {
  if (!prefix && !suffix) {
    return (
      <input
        className={`ui-input${invalid ? ' invalid' : ''}${className ? ` ${className}` : ''}`}
        {...rest}
      />
    )
  }
  return (
    <span className={`ui-input-wrap${invalid ? ' invalid' : ''}${className ? ` ${className}` : ''}`}>
      {prefix ? <span className="ui-input-affix">{prefix}</span> : null}
      <input {...rest} />
      {suffix ? <span className="ui-input-affix">{suffix}</span> : null}
    </span>
  )
}

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }

/** 统一多行输入 */
export function TextArea({ invalid, className, ...rest }: TextAreaProps): React.JSX.Element {
  return (
    <textarea
      className={`ui-textarea${invalid ? ' invalid' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    />
  )
}
