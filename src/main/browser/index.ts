/** 浏览器模块入口：单例 manager + IPC 注册 */
import { realpath } from 'fs/promises'
import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'
import { getShyPaths } from '../paths'
import { EmbeddedBrowserManager, BROWSER_ACTIONS } from './embedded-browser-manager'
import { createTabView, type ViewBounds, type ElectronWindow } from './controller'
import { getDefaultBus } from '../event-bridge'

let _manager: EmbeddedBrowserManager | null = null

/** 主窗口 provider（main/index.ts 启动时注入） */
let _getWindow: () => ElectronWindow | null = () => null

export function setBrowserWindowProvider(getWindow: () => ElectronWindow | null): void {
  _getWindow = getWindow
}

export function getEmbeddedBrowserManager(): EmbeddedBrowserManager {
  if (!_manager) {
    const artifactsDir = getShyPaths().artifactsDir
    _manager = new EmbeddedBrowserManager(
      (onNavigated) => createTabView(_getWindow, onNavigated),
      {
        onNavigated: (tabId, url) => {
          getDefaultBus().emitSync({ type: 'browser_navigated', tabId, url })
        },
        onScreenshot: (path) => {
          getDefaultBus().emitSync({ type: 'browser_screenshot', path })
        }
      },
      artifactsDir
    )
  }
  return _manager
}

export function registerBrowserIpc(): void {
  const m = () => getEmbeddedBrowserManager()

  // 渲染层发的是 CSS 像素；页面 zoom ≠ 1 时需换算为 DIP 才能与 React 布局对齐
  const toDip = (bounds: ViewBounds): ViewBounds => {
    const win = _getWindow()
    let zoom = 1
    try {
      const bw = win as unknown as BrowserWindow | null
      zoom = bw && !bw.isDestroyed() ? bw.webContents.getZoomFactor() : 1
    } catch {
      zoom = 1
    }
    if (zoom === 1) return bounds
    return {
      x: Math.round(bounds.x / zoom),
      y: Math.round(bounds.y / zoom),
      width: Math.max(1, Math.round(bounds.width / zoom)),
      height: Math.max(1, Math.round(bounds.height / zoom))
    }
  }

  ipcMain.handle(IPC.browserShow, (_e, bounds: ViewBounds) => {
    m().show(toDip(bounds))
    return { ok: true }
  })
  ipcMain.handle(IPC.browserHide, () => {
    m().hide()
    return { ok: true }
  })
  ipcMain.handle(IPC.browserSetBounds, (_e, bounds: ViewBounds) => {
    m().setBounds(toDip(bounds))
    return { ok: true }
  })
  ipcMain.handle(IPC.browserGetState, () => m().getState())
  ipcMain.handle(IPC.browserNavigate, (_e, url: string) => {
    m().navigateExternal(url)
    return { ok: true }
  })
  ipcMain.handle(IPC.browserScreenshot, () =>
    m().executeAgentTool('ui', 'screenshot', {})
  )
  ipcMain.handle(IPC.browserBack, () => {
    void m().executeAgentTool('ui', 'back', {})
    return { ok: true }
  })
  ipcMain.handle(IPC.browserForward, () => {
    void m().executeAgentTool('ui', 'forward', {})
    return { ok: true }
  })
  ipcMain.handle(IPC.browserReload, () => {
    void m().executeAgentTool('ui', 'reload', {})
    return { ok: true }
  })
}

/** upload_files 的路径授权：必须真实存在且为常规文件 */
export async function assertUploadablePaths(paths: string[]): Promise<void> {
  for (const p of paths.slice(0, 20)) {
    const real = await realpath(p).catch(() => null)
    if (!real) throw new Error(`上传路径不存在：${p}`)
  }
}

export { BROWSER_ACTIONS }
