import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { EmbeddedBrowserManager, type TabViewFactory } from './embedded-browser-manager'
import type { TabView } from './controller'
import { existsSync } from 'fs'

let artifactsDir: string

beforeEach(async () => {
  artifactsDir = await mkdtemp(join(tmpdir(), 'shy-browser-'))
})

function fakeViewFactory(): {
  factory: TabViewFactory
  views: TabView[]
  setElementsJson: (json: string) => void
} {
  const views: TabView[] = []
  let elementsJson = '[]'
  const setElementsJson = (json: string) => {
    elementsJson = json
  }
  const factory: TabViewFactory = (onNavigated) => {
    const cmds: Array<{ method: string; params?: Record<string, unknown> }> = []
    let url = 'about:blank'
    const view: TabView = {
      loadURL: async (u) => {
        url = u
        onNavigated(u)
      },
      goBack: () => {},
      goForward: () => {},
      reload: () => {},
      getURL: () => url,
      getTitle: () => '测试页',
      setBounds: () => {},
      addToParent: () => {},
      removeFromParent: () => {},
      destroy: () => {},
      isDestroyed: () => false,
      onNavigated: () => {},
      debugger: {
        attach: () => {},
        detach: () => {},
        sendCommand: async (method, params) => {
          cmds.push({ method, params })
          if (method === 'DOM.getDocument') return { root: { nodeId: 1 } }
          if (method === 'DOM.querySelector')
            return { nodeId: params?.selector === '#miss' ? null : 42 }
          if (method === 'DOM.getBoxModel')
            return { model: { content: [100, 200, 200, 200, 200, 240, 100, 240] } }
          if (method === 'Runtime.evaluate') {
            const expr = String(params?.expression ?? '')
            if (expr.startsWith('(() =>')) return { result: { value: elementsJson } }
            if (expr.includes('innerText')) return { result: { value: '页面正文' } }
            return { result: { value: 'complete' } }
          }
          if (method === 'Page.captureScreenshot') return { data: Buffer.from('png').toString('base64') }
          return {}
        }
      }
    }
    views.push(view)
    return view
  }
  return { factory, views, setElementsJson }
}

function makeManager(factory: TabViewFactory, events = {}) {
  return new EmbeddedBrowserManager(factory, events, artifactsDir)
}

describe('EmbeddedBrowserManager', () => {
  it('未知 action 拒绝', async () => {
    const { factory } = fakeViewFactory()
    const m = makeManager(factory)
    await expect(m.executeAgentTool('s', 'hack' as never, {})).rejects.toThrow('未知 browser action')
  })

  it('navigate 拒绝高危协议（未确认），确认后放行', async () => {
    const { factory } = fakeViewFactory()
    const m = makeManager(factory)
    await expect(m.executeAgentTool('s', 'navigate', { url: 'file:///etc/passwd' })).rejects.toThrow(
      '高危协议'
    )
    const r = JSON.parse(
      await m.executeAgentTool('s', 'navigate', { url: 'file:///tmp/x', unsafeConfirmed: true })
    )
    expect(r.ok).toBe(true)
  })

  it('inspect → ref click 全链路', async () => {
    const { factory, setElementsJson } = fakeViewFactory()
    const m = makeManager(factory)
    setElementsJson(
      JSON.stringify([
        {
          tag: 'button',
          role: '',
          type: '',
          name: '',
          text: '登录',
          cssPath: '#login',
          rect: { x: 1, y: 2, width: 10, height: 5 },
          inViewport: true
        }
      ])
    )

    const insp = JSON.parse(await m.executeAgentTool('s', 'inspect', {}))
    expect(insp.ok).toBe(true)
    expect(insp.page).toContain('登录')
    const ref = insp.page.match(/\[(browser-element:[0-9a-f-]+)\]/)![1]

    const click = JSON.parse(await m.executeAgentTool('s', 'click', { ref }))
    expect(click.ok).toBe(true)

    // 导航后 ref 失效（工具层会捕获并作为 {ok:false} 返回给 LLM）
    await m.executeAgentTool('s', 'navigate', { url: 'https://example.com' })
    await expect(m.executeAgentTool('s', 'click', { ref })).rejects.toThrow('重新调用 inspect')
  })

  it('selector 点击与 query 文本', async () => {
    const { factory } = fakeViewFactory()
    const m = makeManager(factory)
    const click = JSON.parse(await m.executeAgentTool('s', 'click', { selector: '#btn' }))
    expect(click.ok).toBe(true)
    const q = JSON.parse(await m.executeAgentTool('s', 'query', { kind: 'text' }))
    expect(q.text).toBe('页面正文')
    await expect(m.executeAgentTool('s', 'click', { selector: '#miss' })).rejects.toThrow(
      '选择器未命中'
    )
  })

  it('fill/type/press_key/scroll/wait 正常返回', async () => {
    const { factory } = fakeViewFactory()
    const m = makeManager(factory)
    expect(JSON.parse(await m.executeAgentTool('s', 'type', { selector: 'input', text: 'hi' })).ok).toBe(true)
    expect(JSON.parse(await m.executeAgentTool('s', 'fill', { selector: 'input', text: 'hi' })).ok).toBe(true)
    expect(JSON.parse(await m.executeAgentTool('s', 'press_key', { key: 'Enter' })).ok).toBe(true)
    expect(JSON.parse(await m.executeAgentTool('s', 'scroll', { direction: 'down', distance: 300 })).ok).toBe(true)
    expect(JSON.parse(await m.executeAgentTool('s', 'wait', { timeout: 100 })).ok).toBe(true)
  })

  it('screenshot 落盘 artifacts/browser 并回调事件', async () => {
    const { factory } = fakeViewFactory()
    const shots: string[] = []
    const m = makeManager(factory, { onScreenshot: (p) => shots.push(p) })
    const r = JSON.parse(await m.executeAgentTool('s', 'screenshot', {}))
    expect(r.ok).toBe(true)
    expect(existsSync(r.path)).toBe(true)
    expect(r.path).toContain(join(artifactsDir, 'browser'))
    expect(shots).toHaveLength(1)
  })

  it('show/hide/setBounds/getState；open_tab 后单 tab 可见', async () => {
    const { factory } = fakeViewFactory()
    const m = makeManager(factory)
    m.show({ x: 0, y: 0, width: 100, height: 100 })
    const t1 = JSON.parse(await m.executeAgentTool('s', 'open_tab', { url: 'https://a.example' }))
    expect(t1.ok).toBe(true)
    const state = m.getState()
    expect(state.shown).toBe(true)
    expect(state.tabs).toHaveLength(2) // show 时隐式建一个 + open_tab 新建一个
    m.hide()
    expect(m.getState().shown).toBe(false)
  })

})

// 清理临时目录
afterAll(async () => {
  if (artifactsDir) await rm(artifactsDir, { recursive: true, force: true })
})
