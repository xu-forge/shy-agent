/**
 * useAgentEvent 单测 — 不用 testing-library,直接 mock React.useEffect
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// mock react,只保留 useEffect
let lastEffectCleanup: (() => void) | null = null

vi.mock('react', () => ({
  useEffect: (fn: () => void | (() => void)) => {
    lastEffectCleanup = null
    const cleanup = fn()
    if (typeof cleanup === 'function') {
      lastEffectCleanup = cleanup
    }
    return cleanup
  }
}))

// 必须在 mock 之后 import
const { useAgentEvent } = await import('./useAgentEvent')

// 用一个"组件"模式调 hook（useEffect 已 mock，非真实 React 树）
function runHook<T extends string>(
  type: T,
  handler: (e: { type: T } & Record<string, unknown>) => void
): void {
  // 模拟一次 render:useEffect 会被立刻调一次
  // eslint-disable-next-line react-hooks/rules-of-hooks -- test helper with mocked useEffect
  useAgentEvent(type, handler)
}

describe('useAgentEvent', () => {
  let subscribed: Array<{ type: string; handler: (e: unknown) => void; off: () => void }> = []

  beforeEach(() => {
    subscribed = []
    lastEffectCleanup = null
    ;(global as unknown as { window: unknown }).window = {
      shy: {
        onEventByType: (type: string, handler: (e: unknown) => void) => {
          const entry = { type, handler, off: vi.fn() }
          subscribed.push(entry)
          // 模拟返回 unsub 函数
          return () => {
            entry.off()
            const idx = subscribed.indexOf(entry)
            if (idx >= 0) subscribed.splice(idx, 1)
          }
        }
      }
    }
  })

  afterEach(() => {
    delete (global as unknown as { window?: unknown }).window
  })

  it('挂载时通过 window.shy.onEventByType 订阅', () => {
    runHook('tool', () => undefined)
    expect(subscribed.length).toBe(1)
    expect(subscribed[0]!.type).toBe('tool')
  })

  it('effect cleanup 时自动取消订阅', () => {
    runHook('tool', () => undefined)
    expect(subscribed.length).toBe(1)
    // 模拟组件 unmount:cleanup 被调
    if (lastEffectCleanup) lastEffectCleanup()
    expect(subscribed.length).toBe(0)
  })

  it('preload 缺 onEventByType 不崩(不订阅)', () => {
    ;(global as unknown as { window: unknown }).window = { shy: {} }
    expect(() => runHook('tool', () => undefined)).not.toThrow()
    expect(subscribed.length).toBe(0) // 没订阅
  })

  it('handler 收到事件时拿原始 payload', () => {
    const handler = vi.fn()
    runHook('tool', handler as never)
    const event = { type: 'tool', name: 'shell_exec', input: { cmd: 'ls' } }
    subscribed[0]!.handler(event)
    expect(handler).toHaveBeenCalledWith(event)
  })
})
