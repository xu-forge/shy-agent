import { Component, type ReactNode } from 'react'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info.componentStack)
    // 通知 main 进程（如可用）
    const notify = (window.shy as unknown as { notify?: (m: string) => void })?.notify
    try {
      notify?.(`界面异常：${error.message}`)
    } catch {
      /* ignore */
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <div className="error-fallback">
            <h2>出错了</h2>
            <p>{this.state.error.message}</p>
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
