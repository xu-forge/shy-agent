/**
 * BrowserPanel — 内嵌浏览器面板（minimax-feature-port）。
 *
 * - 原生 WebContentsView 显示在 .browser-view-slot 矩形上（bounds 持续同步主进程）
 * - 顶条：URL 状态 + 后退/前进/刷新/关闭
 * - 底部：browser 工具截图缩略图（shy-asset:// 协议）
 */
import { useCallback, useEffect, useRef, useState } from 'react'

function assetUrl(path: string): string {
  // path 形如 /Users/…/.shy/artifacts/browser/x.png → shy-asset://artifacts/browser/x.png
  const marker = '.shy/'
  const idx = path.lastIndexOf(marker)
  const rel = idx >= 0 ? path.slice(idx + marker.length) : path
  return `shy-asset://${rel}`
}

export function BrowserPanel({
  onClose,
  embedded = false
}: {
  onClose?: () => void
  /** 嵌入右侧功能面板：隐藏关闭按钮（切 tab 即关闭），紧凑布局 */
  embedded?: boolean
}): React.JSX.Element {
  const slotRef = useRef<HTMLDivElement>(null)
  const [url, setUrl] = useState('about:blank')
  const [shots, setShots] = useState<string[]>([])
  const [addr, setAddr] = useState('')

  const applyBounds = useCallback((show = false) => {
    const el = slotRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const bounds = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(1, Math.round(r.width)),
      height: Math.max(1, Math.round(r.height))
    }
    if (show) void window.shy.browserShow(bounds)
    else void window.shy.browserSetBounds(bounds)
  }, [])

  useEffect(() => {
    applyBounds(true)
    void window.shy.browserGetState().then((s) => {
      const state = s as { tabs?: Array<{ url: string; visible: boolean }> }
      const cur = state.tabs?.find((t) => t.visible) ?? state.tabs?.[state.tabs.length - 1]
      if (cur?.url) {
        setUrl(cur.url)
        setAddr(cur.url)
      }
    })
    const el = slotRef.current
    const ro = el ? new ResizeObserver(() => applyBounds()) : null
    if (el && ro) ro.observe(el)
    const onResize = () => applyBounds()
    window.addEventListener('resize', onResize)
    const off = window.shy.onEvent((payload) => {
      const e = payload as { type?: string; url?: string; path?: string }
      if (e.type === 'browser_navigated' && e.url) {
        setUrl(e.url)
        setAddr(e.url)
      } else if (e.type === 'browser_screenshot' && e.path) {
        setShots((prev) => [e.path!, ...prev].slice(0, 8))
      }
    })
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
      off()
      void window.shy.browserHide()
    }
  }, [applyBounds])

  return (
    <div className="browser-panel">
      <div className="browser-panel-bar">
        <div className="browser-panel-url" title={url}>
          {url}
        </div>
        <div className="browser-panel-actions">
          <button type="button" title="后退" onClick={() => void window.shy.browserBack()}>
            ←
          </button>
          <button type="button" title="前进" onClick={() => void window.shy.browserForward()}>
            →
          </button>
          <button type="button" title="刷新" onClick={() => void window.shy.browserReload()}>
            ⟳
          </button>
          <button
            type="button"
            title="关闭面板"
            onClick={() => onClose?.()}
            style={embedded ? { display: 'none' } : undefined}
          >
            ✕
          </button>
        </div>
      </div>
      <form
        className="browser-panel-addr"
        onSubmit={(e) => {
          e.preventDefault()
          const target = addr.trim()
          if (!target) return
          const full = /^https?:\/\//i.test(target) ? target : `https://${target}`
          void window.shy.browserNavigate(full)
        }}
      >
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="输入网址回车打开" />
      </form>
      {/* 原生 WebContentsView 覆盖在这个空槽位上（React 不能在其上绘制） */}
      <div className="browser-view-slot" ref={slotRef} />
      {shots.length > 0 ? (
        <div className="browser-panel-shots">
          {shots.map((p) => (
            <img key={p} src={assetUrl(p)} alt="浏览器截图" />
          ))}
        </div>
      ) : null}
    </div>
  )
}
