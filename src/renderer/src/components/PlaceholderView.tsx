type Props = {
  title: string
}

export function PlaceholderView({ title }: Props): React.JSX.Element {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>后续版本提供完整能力。当前为壳阶段占位，不会伪造业务功能。</p>
    </div>
  )
}
