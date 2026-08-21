/**
 * useAgentEvent — 细颗粒按 type 订阅 main → renderer 事件
 *
 * 设计要点:
 * - 替代 useAgentEvents 巨型 switch 模式,组件只需要订阅自己关心的 type
 * - 底层调 window.shy.onEventByType,过滤由 preload 做,renderer 端不做重复过滤
 * - 自动 cleanup(useEffect return)
 *
 * 用法:
 *   useAgentEvent('tool', (e) => {
 *     if (e.name === 'shell_exec') addToInspector(e)
 *   })
 *   useAgentEvent('assistant_delta', (e) => append(e.content))
 *
 * 对齐 minimax mavis-13 §"细颗粒订阅"
 */
import { useEffect } from 'react'

/** AgentEvent 子集:有 type 字段的对象 */
export type TypedAgentEvent<T extends string> = { type: T } & Record<string, unknown>

/**
 * 订阅一个特定 type 的 AgentEvent。
 * 组件 unmount 时自动取消订阅。
 */
export function useAgentEvent<T extends string>(
  type: T,
  handler: (event: TypedAgentEvent<T>) => void
): void {
  useEffect(() => {
    if (!window.shy?.onEventByType) {
      // 兼容老版本 preload(没有 onEventByType)
      return
    }
    return window.shy.onEventByType(type, (event) => {
      handler(event as TypedAgentEvent<T>)
    })
    // handler 引用每次 render 都可能变,故意省略依赖让用户自己用 useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])
}
