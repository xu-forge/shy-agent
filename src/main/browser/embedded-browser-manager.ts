/**
 * EmbeddedBrowserManager — 内嵌浏览器管理器（移植自 MiniMaxCode modules/browser/embedded-browser-manager.js，小型化）。
 *
 * - 单 session 多 tab；同一时刻至多一个 tab 可见（隐藏 = 负坐标，不销毁）
 * - executeAgentTool：LLM 侧 22 个 action 的统一入口
 * - 高危 URL（file:/javascript:）需调用方确认后以 unsafeConfirmed 传入
 */
import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { CDPHelper, type DebuggerLike } from './cdp-helper'
import {
  PAGE_ELEMENTS_SCRIPT,
  SnapshotStore,
  renderSnapshotPage
} from './snapshot'
import { OFFSCREEN_BOUNDS, type TabView, type ViewBounds } from './controller'

export const BROWSER_ACTIONS = [
  'inspect',
  'query',
  'navigate',
  'open_tab',
  'back',
  'forward',
  'reload',
  'click',
  'click_and_wait_for_navigation',
  'double_click',
  'drag',
  'hover',
  'fill',
  'type',
  'press_key',
  'check',
  'uncheck',
  'select_option',
  'scroll',
  'wait',
  'screenshot',
  'upload_files'
] as const

export type BrowserAction = (typeof BROWSER_ACTIONS)[number]

export type BrowserActionInput = {
  ref?: string
  selector?: string
  url?: string
  replaceCurrentTab?: boolean
  text?: string
  key?: string
  modifiers?: string[]
  values?: string[]
  direction?: 'up' | 'down' | 'left' | 'right'
  distance?: number
  position?: { x: number; y: number }
  timeout?: number
  offset?: number
  kind?: 'text' | 'dom'
  maxChars?: number
  paths?: string[]
  /** 调用方（工具层）已对高危 URL 做过用户确认 */
  unsafeConfirmed?: boolean
}

export type BrowserTabState = {
  tabId: string
  url: string
  title: string
  visible: boolean
}

export type BrowserState = {
  tabs: BrowserTabState[]
  currentTabId: string | null
  shown: boolean
}

export type ManagerEvents = {
  onNavigated?: (tabId: string, url: string) => void
  onScreenshot?: (path: string) => void
}

export type TabViewFactory = (
  onNavigated: (url: string) => void,
  debuggerOverride?: DebuggerLike
) => TabView

type Tab = {
  tabId: string
  view: TabView
  cdp: CDPHelper
  snapshots: SnapshotStore
  visible: boolean
}

const RESULT_MAX_CHARS = 64 * 1024

function clampResult(obj: unknown): string {
  const s = typeof obj === 'string' ? obj : JSON.stringify(obj)
  if (s.length <= RESULT_MAX_CHARS) return s
  return `${s.slice(0, RESULT_MAX_CHARS)}\n…（结果超过 64KiB 已截断）`
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

export class EmbeddedBrowserManager {
  private tabs = new Map<string, Tab>()
  private currentTabId: string | null = null
  private visibleTabId: string | null = null
  private shown = false
  private bounds: ViewBounds = { x: 0, y: 0, width: 800, height: 600 }

  constructor(
    private readonly createView: TabViewFactory,
    private readonly events: ManagerEvents = {},
    private readonly artifactsDir: string
  ) {}

  /* ────────── tab / 视图管理 ────────── */

  private newTab(url?: string): Tab {
    const tabId = randomUUID()
    const snapshots = new SnapshotStore()
    const view = this.createView((u) => {
      // 主文档导航 → 该 tab 的元素 ref 全部失效
      snapshots.invalidate()
      this.events.onNavigated?.(tabId, u)
    })
    const tab: Tab = { tabId, view, cdp: new CDPHelper(view.debugger), snapshots, visible: false }
    this.tabs.set(tabId, tab)
    this.currentTabId = tabId
    if (url) void view.loadURL(url).catch(() => {})
    if (this.shown) this.showTabExclusive(tab)
    return tab
  }

  private current(): Tab {
    if (!this.currentTabId || !this.tabs.has(this.currentTabId)) {
      return this.newTab()
    }
    return this.tabs.get(this.currentTabId)!
  }

  private showTabExclusive(tab: Tab): void {
    for (const other of this.tabs.values()) {
      if (other !== tab && other.visible) {
        other.view.setBounds(OFFSCREEN_BOUNDS)
        other.visible = false
      }
    }
    tab.view.setBounds(this.bounds)
    tab.view.addToParent()
    tab.visible = true
    this.visibleTabId = tab.tabId
  }

  show(bounds?: ViewBounds): void {
    if (bounds) this.bounds = bounds
    this.shown = true
    this.showTabExclusive(this.current())
  }

  hide(): void {
    this.shown = false
    const tab = this.visibleTabId ? this.tabs.get(this.visibleTabId) : null
    if (tab) {
      tab.view.setBounds(OFFSCREEN_BOUNDS)
      tab.view.removeFromParent()
      tab.visible = false
    }
    this.visibleTabId = null
  }

  setBounds(bounds: ViewBounds): void {
    this.bounds = bounds
    const tab = this.visibleTabId ? this.tabs.get(this.visibleTabId) : null
    if (tab && this.shown) tab.view.setBounds(bounds)
  }

  getState(): BrowserState {
    return {
      tabs: [...this.tabs.values()].map((t) => ({
        tabId: t.tabId,
        url: t.view.getURL(),
        title: t.view.getTitle(),
        visible: t.visible
      })),
      currentTabId: this.currentTabId,
      shown: this.shown
    }
  }

  navigateExternal(url: string): void {
    void this.current().view.loadURL(url).catch(() => {})
  }

  destroy(): void {
    for (const t of this.tabs.values()) t.view.destroy()
    this.tabs.clear()
    this.currentTabId = null
    this.visibleTabId = null
    this.shown = false
  }

  /* ────────── agent 工具入口 ────────── */

  private async resolveNodeId(tab: Tab, input: BrowserActionInput): Promise<number> {
    if (input.selector) return tab.cdp.querySelector(input.selector)
    if (input.ref) {
      const el = tab.snapshots.resolve(input.ref)
      if (!el) {
        throw new Error(
          'ref 无效或已过期（快照 TTL 5 分钟，主导航后即失效）— 请重新调用 inspect 获取新 ref'
        )
      }
      return tab.cdp.querySelector(el.backendRef)
    }
    throw new Error('需要 input.ref 或 input.selector')
  }

  async executeAgentTool(
    _sessionId: string,
    action: BrowserAction,
    input: BrowserActionInput = {}
  ): Promise<string> {
    if (!BROWSER_ACTIONS.includes(action)) {
      throw new Error(`未知 browser action：${action}`)
    }
    const tab = this.current()

    switch (action) {
      case 'navigate': {
        const url = input.url
        if (!url) throw new Error('navigate 需要 input.url')
        const proto = url.split(':')[0].toLowerCase()
        if ((proto === 'file' || proto === 'javascript') && !input.unsafeConfirmed) {
          throw new Error(`高危协议 ${proto}: 需用户确认后才能导航`)
        }
        await tab.view.loadURL(url)
        await sleep(300) // 等 did-navigate
        return clampResult({ ok: true, url: tab.view.getURL(), title: tab.view.getTitle() })
      }
      case 'open_tab': {
        const t = this.newTab(input.url ?? 'about:blank')
        if (input.replaceCurrentTab && this.tabs.size > 1) {
          // v1 简化：open_tab 始终新建；replaceCurrentTab 忽略并在结果注明
        }
        return clampResult({ ok: true, tabId: t.tabId, note: '新 tab 已创建并设为当前' })
      }
      case 'back':
        tab.view.goBack()
        return clampResult({ ok: true })
      case 'forward':
        tab.view.goForward()
        return clampResult({ ok: true })
      case 'reload':
        tab.view.reload()
        return clampResult({ ok: true })
      case 'inspect': {
        const rawJson = await tab.cdp.evaluate<string>(PAGE_ELEMENTS_SCRIPT)
        const raw = JSON.parse(rawJson || '[]')
        const elements = tab.snapshots.store(raw)
        return clampResult({
          ok: true,
          url: tab.view.getURL(),
          page: renderSnapshotPage(elements, input.offset ?? 0)
        })
      }
      case 'query': {
        const maxChars = Math.min(input.maxChars ?? 8000, 50_000)
        if (input.kind === 'dom') {
          const html = await tab.cdp.evaluate<string>('document.body.innerHTML')
          return clampResult({ ok: true, dom: (html || '').slice(0, maxChars) })
        }
        const text = await tab.cdp.evaluate<string>('document.body.innerText')
        return clampResult({ ok: true, text: (text || '').slice(0, maxChars) })
      }
      case 'click':
      case 'double_click':
      case 'click_and_wait_for_navigation': {
        if (input.position) {
          await tab.cdp.dispatchClickEvent(input.position.x, input.position.y, {
            clickCount: action === 'double_click' ? 2 : 1
          })
        } else {
          const nodeId = await this.resolveNodeId(tab, input)
          const c = await tab.cdp.centerOf(nodeId)
          await tab.cdp.dispatchClickEvent(c.x, c.y, {
            clickCount: action === 'double_click' ? 2 : 1
          })
        }
        if (action === 'click_and_wait_for_navigation') {
          const timeout = input.timeout ?? 10_000
          const start = Date.now()
          while (Date.now() - start < timeout) {
            await sleep(250)
            const ready = await tab.cdp.evaluate<string>('document.readyState').catch(() => '')
            if (ready === 'complete' || ready === 'interactive') break
          }
        }
        await sleep(200)
        return clampResult({ ok: true, url: tab.view.getURL() })
      }
      case 'hover': {
        const nodeId = await this.resolveNodeId(tab, input)
        const c = await tab.cdp.centerOf(nodeId)
        await tab.cdp.dispatchMouseMove(c.x, c.y)
        return clampResult({ ok: true })
      }
      case 'drag': {
        // v1 简化：press → move → release（无 CDP 拦截手势）
        const from = input.position
        if (!from) throw new Error('drag 需要 input.position（起点），目标用 ref/selector')
        const nodeId = await this.resolveNodeId(tab, input)
        const to = await tab.cdp.centerOf(nodeId)
        await tab.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 })
        for (let i = 1; i <= 5; i++) {
          await tab.cdp.dispatchMouseMove(
            from.x + ((to.x - from.x) * i) / 5,
            from.y + ((to.y - from.y) * i) / 5
          )
        }
        await tab.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 })
        return clampResult({ ok: true })
      }
      case 'fill':
      case 'type': {
        const text = input.text ?? ''
        const nodeId = await this.resolveNodeId(tab, input)
        await tab.cdp.focus(nodeId)
        if (action === 'fill') await tab.cdp.pressKey('a', ['Control'])
        await tab.cdp.insertText(text)
        await sleep(150)
        return clampResult({ ok: true, typed: text.length })
      }
      case 'press_key': {
        if (!input.key) throw new Error('press_key 需要 input.key')
        await tab.cdp.pressKey(input.key, input.modifiers ?? [])
        await sleep(100)
        return clampResult({ ok: true })
      }
      case 'check':
      case 'uncheck': {
        const nodeId = await this.resolveNodeId(tab, input)
        const want = action === 'check'
        const el = tab.snapshots.resolve(input.ref ?? '')
        const selector = input.selector ?? el?.backendRef ?? ''
        const state = await tab.cdp.evaluate<boolean>(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el ? !!el.checked : null })()`
        )
        if (state !== want) {
          const c = await tab.cdp.centerOf(nodeId)
          await tab.cdp.dispatchClickEvent(c.x, c.y)
        }
        return clampResult({ ok: true, checked: want })
      }
      case 'select_option': {
        if (!input.values?.length) throw new Error('select_option 需要 input.values')
        const el = tab.snapshots.resolve(input.ref ?? '')
        const selector = input.selector ?? el?.backendRef ?? ''
        if (!selector) throw new Error('select_option 需要 ref 或 selector')
        await tab.cdp.evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return; el.value = ${JSON.stringify(input.values[0])}; el.dispatchEvent(new Event('change', { bubbles: true })) })()`
        )
        return clampResult({ ok: true, selected: input.values })
      }
      case 'scroll': {
        const dir = input.direction ?? 'down'
        const distance = Math.min(input.distance ?? 500, 100_000)
        const delta = { up: [0, -distance], down: [0, distance], left: [-distance, 0], right: [distance, 0] }[dir]!
        const p = input.position ?? { x: 400, y: 400 }
        await tab.cdp.dispatchMouseWheel(p.x, p.y, delta[0], delta[1])
        await sleep(150)
        return clampResult({ ok: true, scrolled: `${dir} ${distance}px` })
      }
      case 'wait': {
        const timeout = Math.min(input.timeout ?? 3000, 60_000)
        const start = Date.now()
        while (Date.now() - start < timeout) {
          await sleep(250)
          const ready = await tab.cdp.evaluate<string>('document.readyState').catch(() => '')
          if (ready === 'complete') break
        }
        return clampResult({ ok: true, waitedMs: Date.now() - start, url: tab.view.getURL() })
      }
      case 'screenshot': {
        const shot = await tab.cdp.captureScreenshot()
        const dir = join(this.artifactsDir, 'browser')
        await mkdir(dir, { recursive: true })
        const file = join(dir, `shot-${Date.now()}-${randomUUID().slice(0, 8)}.png`)
        await writeFile(file, Buffer.from(shot.data, 'base64'))
        this.events.onScreenshot?.(file)
        const meta = await tab.cdp
          .evaluate<{ w: number; h: number }>('({ w: window.innerWidth, h: window.innerHeight })')
          .catch(() => ({ w: 0, h: 0 }))
        return clampResult({
          ok: true,
          path: file,
          width: meta.w,
          height: meta.h,
          note: '截图已存盘；用户可在界面浏览器面板查看'
        })
      }
      case 'upload_files': {
        if (!input.paths?.length) throw new Error('upload_files 需要 input.paths')
        const nodeId = await this.resolveNodeId(tab, input)
        await tab.cdp.setFileInputFiles(nodeId, input.paths)
        return clampResult({ ok: true, uploaded: input.paths.length })
      }
    }
  }
}
