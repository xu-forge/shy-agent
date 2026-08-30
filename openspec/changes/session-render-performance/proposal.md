# Proposal: session-render-performance

## Why

会话区当前一次性加载并渲染全部历史消息。长上下文下，历史 DOM、Markdown 解析和流式 delta 更新会共同占用渲染线程，导致滚动、输入和输出出现卡顿。

## What Changes

- From: `getSession` 返回全部消息，`ChatWorkspace` 全量渲染；流式 delta 直接更新完整 `messages` 状态。
- To: 会话历史按页加载，消息列表采用动态高度虚拟化；流式消息与历史消息分离并节流提交；历史消息和 Markdown 结果可复用。
- Reason: 降低长会话的 DOM 数量、React 更新范围和 Markdown 解析频率。
- Impact: renderer、preload/main IPC、SQLite 查询与会话滚动行为；不改变发送给模型的上下文。

## Capabilities

### New Capabilities

- `session-render-performance`：长会话分页、动态虚拟列表、流式渲染优化和滚动位置保持。

## Impact

- **renderer**：`ChatWorkspace`、消息/时间轴组件、Markdown 渲染和滚动容器。
- **main/preload/shared**：会话消息分页查询及类型定义。
- **依赖**：引入支持动态高度的虚拟列表实现，优先采用成熟库而非自研测量。
- **不改**：Agent 编排、模型上下文内容、消息持久化格式、工具协议。
- **测试**：分页边界、历史加载后的滚动锚点、流式批处理、虚拟渲染窗口和现有会话回归。
