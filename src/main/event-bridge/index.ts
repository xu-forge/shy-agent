/**
 * Event-bridge 索引 — 统一导出。
 *
 * Stage 3 事件流最简版:
 * - bus.ts: 1-to-N EventBus(纯函数模块,无 IO)
 * - preload-adapter.ts: 跨 IPC 桥(把 main emit 通过 IPC 推到 renderer)
 * - types.ts: 跨进程事件 schema
 *
 * 设计原则:
 * - 不动 service.ts / turn-runner 现有 emit 代码(向后兼容)
 * - 集成方式:service.ts 可以可选地把 emit 接入 bus
 * - 跨进程:preload-adapter 桥接 main process 的 bus → IPC → renderer
 */
export { EventBus, getDefaultBus, setDefaultBus } from './bus'
export { bridgeEventBusToIpc, type WindowProvider } from './preload-adapter'
