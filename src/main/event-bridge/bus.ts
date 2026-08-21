/**
 * EventBus — 1-to-N 事件总线（参考 minimax mavis-13）。
 *
 * 设计目标：
 * - 1-to-N 订阅：一个事件可以有多个订阅者(Logger / UI / Audit / Replay)
 * - 类型安全：TypeScript generic 限定 event type
 * - 过滤：subscribe 时可传 predicate,只接收感兴趣的事件
 * - 取消订阅：unsubscribe() 返回的函数
 * - 错误隔离：单个订阅者 throw 不影响其他订阅者
 *
 * 用法：
 *   const off = bus.subscribe('tool', (e) => console.log(e.name))
 *   bus.emit({ type: 'tool', name: 'shell_exec', sessionId: 'ses-1' })
 *   off() // 取消
 *
 * 这一版是纯函数模块,无 IO；service.ts / turn-runner 可选择性接入(暂不强制)。
 */
import type { AgentEvent } from '../../shared/ipc'

type Unsub = () => void

type Subscriber<E extends AgentEvent> = (e: E) => void | Promise<void>

type Filter<E extends AgentEvent> = (e: E) => boolean

export class EventBus {
  private subs = new Map<AgentEvent['type'], Set<Subscriber<AgentEvent>>>()
  private filters = new Map<Subscriber<AgentEvent>, Filter<AgentEvent>>()

  /** 订阅指定类型事件 */
  on<E extends AgentEvent['type']>(
    type: E,
    handler: Subscriber<Extract<AgentEvent, { type: E }>>,
    filter?: Filter<Extract<AgentEvent, { type: E }>>
  ): Unsub {
    const wrapped = handler as Subscriber<AgentEvent>
    let set = this.subs.get(type)
    if (!set) {
      set = new Set()
      this.subs.set(type, set)
    }
    set.add(wrapped)
    if (filter) this.filters.set(wrapped, filter as Filter<AgentEvent>)
    return () => {
      set!.delete(wrapped)
      this.filters.delete(wrapped)
    }
  }

  /** emit 一个事件给所有订阅者(fail-open) */
  async emit(event: AgentEvent): Promise<void> {
    const set = this.subs.get(event.type)
    if (!set || set.size === 0) return
    for (const sub of set) {
      const filter = this.filters.get(sub)
      if (filter && !filter(event)) continue
      try {
        await sub(event)
      } catch (err) {
        // fail-open：单个订阅者出错不影响其他订阅者
        console.error(`[shy:event-bus] subscriber for ${event.type} threw:`, err)
      }
    }
  }

  /** 同步 emit(不 await) — 适合不关心订阅者完成的场景 */
  emitSync(event: AgentEvent): void {
    void this.emit(event)
  }

  /** 统计信息(诊断用) */
  stats(): Record<AgentEvent['type'], number> {
    const out = {} as Record<AgentEvent['type'], number>
    for (const [type, set] of this.subs) out[type] = set.size
    return out
  }
}

/** 全局单例(可选;大多数场景直接 new EventBus()) */
let _default: EventBus | null = null
export function getDefaultBus(): EventBus {
  if (!_default) _default = new EventBus()
  return _default
}
export function setDefaultBus(b: EventBus): void {
  _default = b
}
