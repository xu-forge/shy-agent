/**
 * Preload Adapter — 桥接 EventBus → IPC → renderer
 *
 * 设计目标:
 * - main 进程的 EventBus.emit 之后,所有事件被自动推给 BrowserWindow 的 webContents
 * - renderer 端可以按 type 订阅,不需要全收再过滤
 * - 与现有 emitToRenderer(payload) 单点调用兼容(可同时存在,前者走 bus 走 IPC,后者直接 IPC)
 *
 * 关键不变量:
 * - bus.emit 是 fire-and-forget,不会因 IPC 慢而阻塞
 * - 单个 webContents.send 失败不抛(只 console.error)
 * - 支持动态切换 mainWindow(在 setMainWindow 后不需要重新桥)
 *
 * 用法:
 *   import { bridgeEventBusToIpc, getDefaultBus } from './event-bridge'
 *   const unbridge = bridgeEventBusToIpc(getDefaultBus(), () => mainWindow)
 *   // 任意地方 bus.emit({...}),自动推到 mainWindow
 *   // unbridge() 取消
 *
 * 对齐 minimax mavis-13 §"renderer-bound event adapter" 设计。
 */
import type { BrowserWindow } from 'electron'
import type { AgentEvent } from '../../shared/ipc'
import type { EventBus } from './bus'
import { IPC } from '../../shared/ipc'

/** window provider — 通常是 () => mainWindow,允许动态切换 */
export type WindowProvider = () => BrowserWindow | null

/**
 * 把 EventBus 上的所有事件桥到 BrowserWindow.webContents。
 *
 * 工作原理:
 * - 对每个 AgentEvent.type 注册一个 bus 订阅者
 * - 订阅者把 event 通过 webContents.send(IPC.events, event) 推给 renderer
 * - 推失败 console.error,不抛(不影响 bus.emit 的其他订阅者)
 *
 * 返回 unsub 函数,调一下解除全部订阅。
 */
export function bridgeEventBusToIpc(bus: EventBus, getWindow: WindowProvider): () => void {
  // 枚举所有 AgentEvent type(从 AgentEvent union 提取)
  // 简化:用 Set 列出已知 type,而不是类型 hack
  const allTypes: AgentEvent['type'][] = [
    'status',
    'assistant',
    'assistant_delta',
    'assistant_done',
    'tool',
    'memory',
    'goal',
    'task',
    'error',
    'result',
    'done',
    'confirm_required',
    'notify',
    'session',
    'blocked',
    'goal_complete'
  ]

  const unsubs: Array<() => void> = []
  for (const type of allTypes) {
    const off = bus.on(type, (event) => {
      const win = getWindow()
      if (!win || win.isDestroyed()) {
        // window 不存在或销毁,跳过
        return
      }
      try {
        win.webContents.send(IPC.events, event)
      } catch (err) {
        // 推失败(网络中断、contextBridge 等)只记录,不影响其他订阅者
        console.error(`[shy:event-bridge] webContents.send(${type}) failed:`, err)
      }
    })
    unsubs.push(off)
  }

  return () => {
    for (const off of unsubs) off()
    unsubs.length = 0
  }
}
