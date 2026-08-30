import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CHAT_ASIDE_DEFAULT_WIDTH,
  CHAT_ASIDE_MIN_WIDTH,
  CHAT_ASIDE_WIDTH_KEY,
  chatAsideMaxWidth,
  clampChatAsideWidth,
  parseChatAsideWidth,
  type ChatHostClass
} from '../lib/shellLayout'

type Props = {
  hostClass: ChatHostClass
  /** 侧栏收起时，会话主列顶栏需要避开 mac 红绿灯与导航开关 */
  chromePad?: boolean
  children: React.ReactNode
}

function loadChatAsideWidth(): number {
  try {
    const maxWidth = chatAsideMaxWidth(window.innerWidth)
    const w = parseChatAsideWidth(localStorage.getItem(CHAT_ASIDE_WIDTH_KEY), maxWidth)
    // 旧版可能存了超出当前上限的宽度；恢复默认
    if (w > maxWidth) {
      persistChatAsideWidth(CHAT_ASIDE_DEFAULT_WIDTH)
      return Math.min(CHAT_ASIDE_DEFAULT_WIDTH, maxWidth)
    }
    return w
  } catch {
    return CHAT_ASIDE_DEFAULT_WIDTH
  }
}

function persistChatAsideWidth(w: number): void {
  try {
    localStorage.setItem(CHAT_ASIDE_WIDTH_KEY, String(w))
  } catch {
    /* ignore */
  }
}

/** 会话宿主：未绑定主区 / 代码·素材右侧会话栏（可拖拽调宽）。 */
export function ChatWorkspaceHost({
  hostClass,
  chromePad = false,
  children
}: Props): React.JSX.Element {
  const isSessionAside = hostClass === 'chat-aside'
  const [asideWidth, setAsideWidth] = useState<number>(() =>
    typeof window === 'undefined' ? CHAT_ASIDE_DEFAULT_WIDTH : loadChatAsideWidth()
  )
  const dragState = useRef<{ startX: number; startW: number } | null>(null)

  useEffect(() => {
    if (!isSessionAside) return
    const onResize = (): void =>
      setAsideWidth((w) => clampChatAsideWidth(w, chatAsideMaxWidth(window.innerWidth)))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [isSessionAside])

  const finishDrag = useCallback((): void => {
    dragState.current = null
    setAsideWidth((w) => {
      const next = clampChatAsideWidth(w, chatAsideMaxWidth(window.innerWidth))
      persistChatAsideWidth(next)
      return next
    })
  }, [])

  const onResizerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>): void => {
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragState.current = { startX: e.clientX, startW: asideWidth }
    },
    [asideWidth]
  )

  const onResizerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragState.current
    if (!d) return
    setAsideWidth(
      clampChatAsideWidth(d.startW + (d.startX - e.clientX), chatAsideMaxWidth(window.innerWidth))
    )
  }, [])

  const onResizerDoubleClick = useCallback((): void => {
    const next = Math.min(CHAT_ASIDE_DEFAULT_WIDTH, chatAsideMaxWidth(window.innerWidth))
    setAsideWidth(next)
    persistChatAsideWidth(next)
  }, [])

  if (hostClass === 'chat-hidden') {
    return <div className="chat-hidden">{children}</div>
  }

  if (isSessionAside) {
    const shellStyle: React.CSSProperties = {
      width: asideWidth,
      flex: `0 0 ${asideWidth}px`,
      minWidth: CHAT_ASIDE_MIN_WIDTH,
      maxWidth: chatAsideMaxWidth(window.innerWidth)
    }

    return (
      <div className="session-aside-shell" style={shellStyle} data-panel="session">
        <div
          className="session-aside-resizer chat-aside-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={asideWidth}
          aria-valuemin={CHAT_ASIDE_MIN_WIDTH}
          aria-valuemax={chatAsideMaxWidth(window.innerWidth)}
          aria-label="拖拽调整会话区宽度"
          title="拖拽调整会话区宽度（双击恢复默认）"
          onPointerDown={onResizerPointerDown}
          onPointerMove={onResizerPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onDoubleClick={onResizerDoubleClick}
        />
        <div className="chat-aside session-aside-panel">{children}</div>
      </div>
    )
  }

  return (
    <div
      className={`${hostClass}${hostClass === 'chat-main' && chromePad ? ' chrome-pad' : ''}`}
      data-panel="session-main"
    >
      {children}
    </div>
  )
}
