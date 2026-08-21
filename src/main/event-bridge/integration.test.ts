/**
 * Stage 3.2 端到端集成测试:EventBus → preload-adapter → webContents.send
 *
 * 验证:emit 一个事件,preload-adapter 通过 webContents.send(IPC.events, event) 推给 renderer
 * 模拟整个 main 进程通路,不依赖 Electron(用 fake window)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { EventBus, bridgeEventBusToIpc } from './index'
import { IPC } from '../../shared/ipc'

describe('EventBus → preload-adapter 端到端', () => {
  let bus: EventBus
  let send: ReturnType<typeof vi.fn>
  let isDestroyed: ReturnType<typeof vi.fn>
  let getWindow: () => { webContents: { send: typeof send }; isDestroyed: typeof isDestroyed } | null

  beforeEach(() => {
    bus = new EventBus()
    send = vi.fn()
    isDestroyed = vi.fn(() => false)
    getWindow = () => ({
      webContents: { send },
      isDestroyed
    })
  })

  it('emit status → webContents.send(IPC.events, ...)', async () => {
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    await bus.emit({ type: 'status', message: 'starting' })
    expect(send).toHaveBeenCalledWith(IPC.events, {
      type: 'status',
      message: 'starting'
    })
    unbridge()
  })

  it('emit tool → send 被调,携带 name + detail', async () => {
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    await bus.emit({ type: 'tool', name: 'shell_exec', detail: { cmd: 'ls' } })
    expect(send).toHaveBeenCalledWith(
      IPC.events,
      expect.objectContaining({ type: 'tool', name: 'shell_exec' })
    )
    unbridge()
  })

  it('emit done + emit error 都被推', async () => {
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    await bus.emit({ type: 'done', reason: 'completed' })
    await bus.emit({ type: 'error', message: 'oops' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(1, IPC.events, expect.objectContaining({ type: 'done' }))
    expect(send).toHaveBeenNthCalledWith(
      2,
      IPC.events,
      expect.objectContaining({ type: 'error' })
    )
    unbridge()
  })

  it('1-to-N 订阅:多个订阅者(Logger + Audit)都收到', async () => {
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    const logger = vi.fn()
    const audit = vi.fn()
    const off1 = bus.on('status', logger)
    const off2 = bus.on('status', audit)
    await bus.emit({ type: 'status', message: 'x' })
    expect(logger).toHaveBeenCalledTimes(1)
    expect(audit).toHaveBeenCalledTimes(1)
    off1()
    off2()
    unbridge()
  })

  it('bridge 取消后 emit 不再 send', async () => {
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    await bus.emit({ type: 'status', message: 'a' })
    expect(send).toHaveBeenCalledTimes(1)
    unbridge()
    await bus.emit({ type: 'status', message: 'b' })
    expect(send).toHaveBeenCalledTimes(1) // 仍 1 次
  })

  it('window 销毁时跳过 send,不影响其他订阅者', async () => {
    isDestroyed.mockReturnValue(true)
    const unbridge = bridgeEventBusToIpc(bus, getWindow as never)
    const other = vi.fn()
    const off = bus.on('status', other)
    await bus.emit({ type: 'status', message: 'x' })
    expect(send).not.toHaveBeenCalled()
    expect(other).toHaveBeenCalledTimes(1) // 其他订阅者仍收到
    off()
    unbridge()
  })
})
