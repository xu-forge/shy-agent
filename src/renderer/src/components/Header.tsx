type Props = {
  title: string
  right?: React.ReactNode
}

/**
 * 自绘窗口标题栏（macOS hiddenInset：左侧留给原生红绿灯）
 * - 整条可拖拽（-webkit-app-region: drag）
 * - 内部交互元素需 no-drag
 */
export function Header({ title, right }: Props): React.JSX.Element {
  return (
    <header className="app-header">
      <div className="app-header-title">
        <span className="app-header-dot" aria-hidden="true" />
        {title}
      </div>
      {right ? <div className="app-header-right no-drag">{right}</div> : null}
    </header>
  )
}
