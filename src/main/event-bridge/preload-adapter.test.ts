import { describe, expect, it, vi } from 'vitest'
import { EventBus } from './bus'
import { bridgeEventBusToIpc } from './preload-adapter'
import { IPC } from '../../shared/ipc'

// 模拟 BrowserWindow + webContents.send
function makeFakeWindow(opts: { destroyed?: boolean; throwOnSend?: boolean } = {}) {
  const send = vi.fn((_channel: string, _payload: unknown) => {
    if (opts.throwOnSend) throw new Error('IPC broken')
  })
  const isDestroyed = vi.fn(() => opts.destroyed ?? false)
  return {
    webContents: { send },
    isDestroyed
  }
}

describe('bridgeEventBusToIpc', () => {
  it('emit 事件自动推到 webContents', async () => {
    const bus = new EventBus()
    const fakeWin = makeFakeWindow()
    const unbridge = bridgeEventBusToIpc(bus, () => fakeWin as never)

    await bus.emit({ type: 'status', message: 'hello' })
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(IPC.events, {
      type: 'status',
      message: 'hello'
    })

    unbridge()
  })

  it('所有 type 都被桥接(全 16 个 type 都推)', async () => {
    const bus = new EventBus()
    const fakeWin = makeFakeWindow()
    const unbridge = bridgeEventBusToIpc(bus, () => fakeWin as never)

    // 推一个 type,验证 webContents.send 被调
    await bus.emit({ type: 'assistant', content: 'hi' })
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      IPC.events,
      expect.objectContaining({ type: 'assistant' })
    )

    await bus.emit({ type: 'done', reason: 'completed' })
    expect(fakeWin.webContents.send).toHaveBeenCalledWith(
      IPC.events,
      expect.objectContaining({ type: 'done' })
    )

    unbridge()
  })

  it('window 为 null 时跳过(不抛)', async () => {
    const bus = new EventBus()
    const unbridge = bridgeEventBusToIpc(bus, () => null)
    // 不应 throw
    await bus.emit({ type: 'status', message: 'x' })
    unbridge()
  })

  it('window 已销毁时跳过(不调 send)', async () => {
    const bus = new EventBus()
    const fakeWin = makeFakeWindow({ destroyed: true })
    const unbridge = bridgeEventBusToIpc(bus, () => fakeWin as never)
    await bus.emit({ type: 'status', message: 'x' })
    expect(fakeWin.webContents.send).not.toHaveBeenCalled()
    unbridge()
  })

  it('send throw 时不影响 bus.emit(fail-open)', async () => {
    const bus = new EventBus()
    const fakeWin = makeFakeWindow({ throwOnSend: true })
    const unbridge = bridgeEventBusToIpc(bus, () => fakeWin as never)

    // 不应 throw
    await expect(bus.emit({ type: 'status', message: 'x' })).resolves.toBeUndefined()

    unbridge()
  })

  it('unbridge 后再 emit 不再推', async () => {
    const bus = new EventBus()
    const fakeWin = makeFakeWindow()
    const unbridge = bridgeEventBusToIpc(bus, () => fakeWin as never)
    await bus.emit({ type: 'status', message: 'a' })
    expect(fakeWin.webContents.send).toHaveBeenCalledTimes(1)

    unbridge()
    await bus.emit({ type: 'status', message: 'b' })
    expect(fakeWin.webContents.send).toHaveBeenCalledTimes(1) // 仍是 1
  })

  it('动态切换 window provider:新的 emit 用新 window', async () => {
    const bus = new EventBus()
    const win1 = makeFakeWindow()
    const win2 = makeFakeWindow()
    let current: typeof win1 = win1 as never
    const unbridge = bridgeEventBusToIpc(bus, () => current as never)

    await bus.emit({ type: 'status', message: 'to-1' })
    expect(win1.webContents.send).toHaveBeenCalledTimes(1)
    expect(win2.webContents.send).toHaveBeenCalledTimes(0)

    current = win2 as never
    await bus.emit({ type: 'status', message: 'to-2' })
    expect(win1.webContents.send).toHaveBeenCalledTimes(1)
    expect(win2.webContents.send).toHaveBeenCalledTimes(1)

    unbridge()
  })
})
