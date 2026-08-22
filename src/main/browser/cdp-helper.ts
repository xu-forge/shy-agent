/**
 * CDPHelper — 原生 CDP over webContents.debugger（移植自 MiniMaxCode dist/main/modules/browser/cdp-helper.js，小型化）。
 *
 * - attach('1.3')，失败视为已附着
 * - sendCommand 带 Promise.race 超时（默认 15s）
 * - 鼠标/键盘/截图/节点解析原语
 *
 * 依赖以最小接口注入（DebuggerLike），便于单测用 fake 断言命令序列。
 */

export type DebuggerLike = {
  attach: (protocolVersion: string) => void
  detach: () => void
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>
}

export const DEFAULT_CDP_TIMEOUT_MS = 15_000

/** 常用键 → windowsVirtualKeyCode（CDP_SYMBOL_KEYS 的常用子集） */
export const CDP_KEY_CODES: Record<string, number> = {
  enter: 13,
  tab: 9,
  escape: 27,
  esc: 27,
  backspace: 8,
  delete: 46,
  insert: 45,
  home: 36,
  end: 35,
  pageup: 33,
  pagedown: 34,
  arrowup: 38,
  arrowdown: 40,
  arrowleft: 37,
  arrowright: 39,
  space: 32
}

export function keyCodeFor(key: string): number {
  const lower = key.toLowerCase()
  if (CDP_KEY_CODES[lower] !== undefined) return CDP_KEY_CODES[lower]
  if (/^[a-z]$/i.test(key)) return key.toUpperCase().charCodeAt(0)
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0)
  return 0
}

export type ClickOptions = {
  button?: 'left' | 'right' | 'middle'
  clickCount?: number
  modifiers?: number
}

export type BoxModel = { x: number; y: number; width: number; height: number }

export class CDPHelper {
  private attached = false

  constructor(
    private readonly dbg: DebuggerLike,
    private readonly timeoutMs = DEFAULT_CDP_TIMEOUT_MS
  ) {}

  ensureAttached(): void {
    if (this.attached) return
    try {
      this.dbg.attach('1.3')
    } catch {
      // 已被附着（比如另一个 helper）— 视为成功
    }
    this.attached = true
  }

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.ensureAttached()
    return Promise.race([
      this.dbg.sendCommand(method, params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`CDP ${method} 超时（${this.timeoutMs}ms）`)), this.timeoutMs)
      )
    ])
  }

  /** DOM.querySelector（自动取当前 document root） */
  async querySelector(cssSelector: string): Promise<number> {
    const doc = (await this.send('DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } }
    const res = (await this.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: cssSelector
    })) as { nodeId: number | null }
    if (!res.nodeId) throw new Error(`选择器未命中：${cssSelector}`)
    return res.nodeId
  }

  async boxModel(nodeId: number): Promise<BoxModel> {
    const res = (await this.send('DOM.getBoxModel', { nodeId })) as {
      model: { content: number[] }
    }
    const c = res.model.content // [x1,y1,x2,y2,x3,y3,x4,y4]
    const xs = [c[0], c[2], c[4], c[6]]
    const ys = [c[1], c[3], c[5], c[7]]
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
  }

  async scrollIntoView(nodeId: number): Promise<void> {
    await this.send('DOM.scrollIntoViewIfNeeded', { nodeId })
  }

  async focus(nodeId: number): Promise<void> {
    await this.send('DOM.focus', { nodeId })
  }

  /** 节点中心坐标（先 scrollIntoView） */
  async centerOf(nodeId: number): Promise<{ x: number; y: number }> {
    await this.scrollIntoView(nodeId)
    const b = await this.boxModel(nodeId)
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
  }

  async dispatchClickEvent(
    x: number,
    y: number,
    opts: ClickOptions = {}
  ): Promise<void> {
    const base = {
      x,
      y,
      button: opts.button ?? 'left',
      clickCount: opts.clickCount ?? 1,
      modifiers: opts.modifiers ?? 0
    }
    await this.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
    await this.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' })
  }

  async dispatchMouseMove(x: number, y: number): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
  }

  async dispatchMouseWheel(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x,
      y,
      deltaX,
      deltaY,
      button: 'none'
    })
  }

  async keyEvent(
    type: 'keyDown' | 'keyUp',
    key: string,
    modifiers: string[] = []
  ): Promise<void> {
    await this.send('Input.dispatchKeyEvent', {
      type,
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      windowsVirtualKeyCode: keyCodeFor(key),
      modifiers: modifiers.length
    })
  }

  async pressKey(key: string, modifiers: string[] = []): Promise<void> {
    if (modifiers.includes('Control') && key.toLowerCase() === 'a') {
      // 全选组合键：keyDown Ctrl+A
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        windowsVirtualKeyCode: 65,
        modifiers: 2
      })
      return
    }
    await this.keyEvent('keyDown', key, modifiers)
    await this.keyEvent('keyUp', key, modifiers)
  }

  async insertText(text: string): Promise<void> {
    await this.send('Input.insertText', { text })
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true
    })) as { result?: { value?: T }; exceptionDetails?: { text: string } }
    if (res.exceptionDetails) {
      throw new Error(`页面脚本执行失败：${res.exceptionDetails.text}`)
    }
    return res.result?.value as T
  }

  async captureScreenshot(): Promise<{ data: string; format: string }> {
    const res = (await this.send('Page.captureScreenshot', { format: 'png' })) as {
      data: string
    }
    return { data: res.data, format: 'png' }
  }

  async setFileInputFiles(nodeId: number, paths: string[]): Promise<void> {
    await this.send('DOM.setFileInputFiles', { files: paths, nodeId })
  }
}
