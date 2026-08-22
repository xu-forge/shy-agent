import { describe, it, expect } from 'vitest'
import {
  CDPHelper,
  keyCodeFor,
  type DebuggerLike
} from './cdp-helper'

function fakeDebugger() {
  const commands: Array<{ method: string; params?: Record<string, unknown> }> = []
  const dbg: DebuggerLike = {
    attach: () => {},
    detach: () => {},
    sendCommand: async (method, params) => {
      commands.push({ method, params })
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } }
      if (method === 'DOM.querySelector') return { nodeId: params?.selector === '#miss' ? null : 42 }
      if (method === 'DOM.getBoxModel')
        return { model: { content: [100, 200, 200, 200, 200, 240, 100, 240] } }
      if (method === 'Runtime.evaluate') return { result: { value: 'ok' } }
      if (method === 'Page.captureScreenshot') return { data: 'aGk=' }
      return {}
    }
  }
  return { dbg, commands }
}

describe('CDPHelper', () => {
  it('click 派发 press+release 且带坐标', async () => {
    const { dbg, commands } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    await cdp.dispatchClickEvent(10, 20, { clickCount: 2 })
    const presses = commands.filter((c) => c.method === 'Input.dispatchMouseEvent')
    expect(presses).toHaveLength(2)
    expect(presses[0].params).toMatchObject({ type: 'mousePressed', x: 10, y: 20, clickCount: 2 })
    expect(presses[1].params).toMatchObject({ type: 'mouseReleased' })
  })

  it('querySelector 经 DOM.getDocument + DOM.querySelector；未命中抛错', async () => {
    const { dbg } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    await expect(cdp.querySelector('#btn')).resolves.toBe(42)
    await expect(cdp.querySelector('#miss')).rejects.toThrow('选择器未命中')
  })

  it('centerOf 返回 box 中心（先 scrollIntoView）', async () => {
    const { dbg, commands } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    const c = await cdp.centerOf(42)
    expect(c).toEqual({ x: 150, y: 220 })
    expect(commands.some((x) => x.method === 'DOM.scrollIntoViewIfNeeded')).toBe(true)
  })

  it('pressKey 发 keyDown/keyUp；Ctrl+A 特判', async () => {
    const { dbg, commands } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    await cdp.pressKey('Enter')
    const keys = commands.filter((c) => c.method === 'Input.dispatchKeyEvent')
    expect(keys).toHaveLength(2)
    expect(keys[0].params).toMatchObject({ type: 'keyDown', key: 'Enter', windowsVirtualKeyCode: 13 })

    await cdp.pressKey('a', ['Control'])
    const last = commands.filter((c) => c.method === 'Input.dispatchKeyEvent').at(-1)!
    expect(last.params).toMatchObject({ modifiers: 2 })
  })

  it('fill 组合：focus → Ctrl+A → insertText', async () => {
    const { dbg, commands } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    await cdp.focus(42)
    await cdp.pressKey('a', ['Control'])
    await cdp.insertText('hello')
    expect(commands.some((c) => c.method === 'Input.insertText' && c.params?.text === 'hello')).toBe(true)
  })

  it('sendCommand 超时拒绝', async () => {
    const dbg: DebuggerLike = {
      attach: () => {},
      detach: () => {},
      sendCommand: () => new Promise(() => {}) // 永不返回
    }
    const cdp = new CDPHelper(dbg, 30)
    await expect(cdp.send('Foo.bar')).rejects.toThrow('超时')
  })

  it('captureScreenshot 返回 base64', async () => {
    const { dbg } = fakeDebugger()
    const cdp = new CDPHelper(dbg)
    await expect(cdp.captureScreenshot()).resolves.toEqual({ data: 'aGk=', format: 'png' })
  })
})

describe('keyCodeFor', () => {
  it('常见键映射', () => {
    expect(keyCodeFor('Enter')).toBe(13)
    expect(keyCodeFor('a')).toBe(65)
    expect(keyCodeFor('5')).toBe(53)
    expect(keyCodeFor('ArrowLeft')).toBe(37)
  })
})
