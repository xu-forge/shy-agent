import type { ReactNode } from 'react'

type Props = { label: string; children: ReactNode }

export function Tooltip({ label, children }: Props): React.JSX.Element {
  return (
    <span className="tooltip-anchor">
      {children}
      <span className="tooltip-content" role="tooltip">
        {label}
      </span>
    </span>
  )
}
