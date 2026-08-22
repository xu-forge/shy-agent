/**
 * BrowserController — WebContentsView 封装（移植自 MiniMaxCode modules/browser/controller.js，小型化）。
 *
 * - 每 tab 一个 WebContentsView（partition persist:shy-browser，sandbox + contextIsolation）
 * - 附着 = contentView.addChildView；隐藏 = 负坐标 + removeChildView（不销毁）
 * - 以 TabView 最小接口暴露给 manager，便于测试注入 fake
 */
import { WebContentsView } from 'electron'
import type { DebuggerLike } from './cdp-helper'

export const BROWSER_PARTITION = 'persist:shy-browser'
export const OFFSCREEN_BOUNDS = { x: -100_000, y: -100_000, width: 0, height: 0 }

export type ViewBounds = { x: number; y: number; width: number; height: number }

/** manager 依赖的最小视图接口（测试可 fake） */
export type TabView = {
  loadURL(url: string): Promise<void>
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
  getTitle(): string
  setBounds(bounds: ViewBounds): void
  addToParent(): void
  removeFromParent(): void
  destroy(): void
  isDestroyed(): boolean
  debugger: DebuggerLike
  /** 注册主导航回调（did-navigate） */
  onNavigated(cb: (url: string) => void): void
}

export type ElectronWindow = {
  contentView: { addChildView(v: unknown): void; removeChildView(v: unknown): void }
}

/** 生产环境 TabView 工厂 */
export function createTabView(
  getWindow: () => ElectronWindow | null,
  onNavigated: (url: string) => void
): TabView {
  const view = new WebContentsView({
    webPreferences: {
      partition: BROWSER_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  view.webContents.setAudioMuted(true)
  view.webContents.on('did-navigate', (_e, url) => onNavigated(url))
  view.webContents.on('did-navigate-in-page', (_e, url) => onNavigated(url))
  return {
    loadURL: (url) => view.webContents.loadURL(url),
    goBack: () => view.webContents.navigationHistory.goBack(),
    goForward: () => view.webContents.navigationHistory.goForward(),
    reload: () => view.webContents.reload(),
    getURL: () => view.webContents.getURL(),
    getTitle: () => view.webContents.getTitle(),
    setBounds: (b) => view.setBounds(b),
    addToParent: () => getWindow()?.contentView.addChildView(view),
    removeFromParent: () => getWindow()?.contentView.removeChildView(view),
    destroy: () => view.webContents.close(),
    isDestroyed: () => view.webContents.isDestroyed(),
    debugger: view.webContents.debugger,
    onNavigated: () => {}
  }
}
