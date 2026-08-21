import { describe, expect, it, vi } from 'vitest'
import { EventBus } from './bus'

describe('EventBus', () => {
  it('订阅 + emit:订阅者收到事件', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.on('tool', handler)
    await bus.emit({ type: 'tool', name: 'shell_exec', sessionId: 'ses-1' })
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tool', name: 'shell_exec' })
    )
  })

  it('1-to-N 订阅:一个事件多个订阅者都收到', async () => {
    const bus = new EventBus()
    const a = vi.fn()
    const b = vi.fn()
    const c = vi.fn()
    bus.on('assistant_delta', a)
    bus.on('assistant_delta', b)
    bus.on('done', c) // 不同 type
    await bus.emit({ type: 'assistant_delta', content: 'hi', sessionId: 's' })
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(c).not.toHaveBeenCalled()
  })

  it('filter:不满足 predicate 的事件不传给订阅者', async () => {
    const bus = new EventBus()
    const onlyShell = vi.fn()
    bus.on('tool', onlyShell, (e) => e.type === 'tool' && (e as { name?: string }).name === 'shell_exec')
    await bus.emit({ type: 'tool', name: 'shell_exec', sessionId: 's' })
    await bus.emit({ type: 'tool', name: 'fs_read', sessionId: 's' })
    expect(onlyShell).toHaveBeenCalledTimes(1)
    expect(onlyShell.mock.calls[0]?.[0]?.name).toBe('shell_exec')
  })

  it('unsubscribe:取消后不再收到', async () => {
    const bus = new EventBus()
    const handler = vi.fn()
    const off = bus.on('done', handler)
    await bus.emit({ type: 'done', reason: 'completed', sessionId: 's' })
    expect(handler).toHaveBeenCalledTimes(1)
    off()
    await bus.emit({ type: 'done', reason: 'completed', sessionId: 's' })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('fail-open:单个订阅者 throw 不影响其他', async () => {
    const bus = new EventBus()
    const ok = vi.fn()
    bus.on('status', () => {
      throw new Error('boom')
    })
    bus.on('status', ok)
    await bus.emit({ type: 'status', message: 'test' })
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('stats 报告各 type 订阅者数量', () => {
    const bus = new EventBus()
    bus.on('tool', () => undefined)
    bus.on('tool', () => undefined)
    bus.on('done', () => undefined)
    const s = bus.stats()
    expect(s.tool).toBe(2)
    expect(s.done).toBe(1)
  })

  it('async 订阅者 await 完成', async () => {
    const bus = new EventBus()
    const order: string[] = []
    bus.on('status', async () => {
      await new Promise((r) => setTimeout(r, 10))
      order.push('sub1')
    })
    bus.on('status', () => {
      order.push('sub2')
    })
    await bus.emit({ type: 'status', message: 'x' })
    expect(order).toContain('sub1')
    expect(order).toContain('sub2')
  })
})
