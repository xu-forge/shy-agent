# Design: session-render-performance

## Context

`ChatWorkspace` 在会话切换时通过 `getSession` 获取全部消息，并把消息按 user/system/timeline 分块后全部渲染。每个 assistant delta 都会复制 `messages` 数组；timeline 随后重新转换为 segments，Markdown 也会随着流式内容反复解析。消息高度不固定，且工具详情、推理块和代码块会造成较大高度差异。

## Goals / Non-Goals

**Goals:**

- 首屏只加载最近一页历史消息，默认页大小 50。
- 向上滚动按页加载更早消息，保持用户当前视觉锚点不跳动。
- 仅渲染视口附近的消息，支持动态高度。
- 流式输出不触发全部历史消息的重新渲染。
- 流式期间 Markdown 更新节流，完成后渲染最终内容。
- 不改变 Agent 使用的上下文和数据库已有消息。

**Non-Goals:**

- 不做模型上下文压缩、摘要或 token 截断。
- 不修改消息持久化 schema 的语义。
- 不把工具输出永久截断；折叠工具仍可按需显示完整内容。
- 不实现服务端/远端消息同步。

## Decisions

### D1：分页方向与返回顺序

- **选择**：IPC 按 `created_at DESC, id DESC` 查询最近一页，返回给 renderer 时恢复为正序；加载更多使用游标 `{ beforeCreatedAt, beforeId }`，不使用 offset。
- **理由**：游标分页在消息追加和长列表下更稳定，复合排序避免同一毫秒消息丢失或重复。

### D2：运行时读取与 UI 读取分离

- **选择**：新增 `getSessionMessagesPage` 给 renderer；Agent 运行时继续使用内部完整读取或独立的消息查询。
- **理由**：UI 分页不应改变 Agent 的完整上下文，也避免把分页细节泄漏到运行时。

### D3：动态高度虚拟列表

- **选择**：引入成熟动态测量虚拟列表；以每个渲染 block 为 item，保留前后 overscan；正在流式输出的 block 必须在窗口内。
- **理由**：消息、Markdown、工具时间轴高度不可预知，固定高度方案会导致跳位。

### D4：流式消息独立状态

- **选择**：历史 `messages` 与 `streamingTurn` 分离。delta 只更新当前 turn；使用约 50ms 的批处理窗口提交到 React，`assistant_done`/`result` 立即 flush。
- **理由**：避免每个 delta 让所有历史 block 重新参与计算，同时保留输出的实时感。

### D5：Markdown 渲染策略

- **选择**：历史消息使用稳定内容作为 memo 输入；流式内容按批次解析，必要时流式中只渲染纯文本，完成后切换为 Markdown。推理详情默认折叠或仅在打开后解析。
- **理由**：Markdown AST 解析是流式阶段的主要 CPU 热点之一。

### D6：分页后的滚动锚点

- **选择**：向上加载前记录首个可见 item 的 id 和其相对容器顶部位置；插入历史后用虚拟列表测量结果恢复该 item 的相对位置。首次进入会话仍定位到底部；用户不在底部时不自动跟随新消息。
- **理由**：长消息高度变化时直接增加 `scrollTop` 不可靠。

### D7：低成本 CSS 兜底

- **选择**：为消息块添加 `content-visibility: auto` 与合理的 `contain-intrinsic-size`，作为虚拟列表之外的绘制优化。
- **理由**：即使虚拟列表有测量缓存或暂时扩大窗口，不可见内容仍可减少布局绘制成本。

## Risks / Trade-offs

- [Risk] 动态高度测量导致首轮滚动位置轻微修正 → Mitigation: 使用 item key、测量缓存和锚点恢复测试。
- [Risk] 分页期间收到新事件 → Mitigation: 追加消息只进入当前 turn；历史页以游标去重。
- [Risk] 流式 Markdown 不完整导致代码围栏显示异常 → Mitigation: 流式阶段允许纯文本，完成事件后强制最终渲染。
- [Risk] 第三方虚拟列表 API 与 React 版本不兼容 → Mitigation: 在引入前用最小原型验证动态测量、反向分页和 resize。
- [Trade-off] 首屏不再立即拥有全部 DOM → 接受，向上滚动按需加载且数据仍完整保留在 SQLite。

## Migration Plan

1. 增加分页 IPC 与游标类型，保留现有 `getSession` 行为供内部调用。
2. 抽出可 memo 的消息 block，并接入虚拟列表，先保证不分页时行为一致。
3. renderer 初始加载最近一页，向上滚动加载历史并恢复锚点。
4. 分离 streaming turn，增加批处理和完成时 flush。
5. 加入 Markdown 流式策略、CSS 兜底和性能测试。
6. 出现问题时可关闭虚拟化开关回退到分页列表；分页 API 不影响旧数据。

## Open Questions

- 虚拟列表具体库在实现阶段用最小原型确认；必须支持动态高度、prepend 和 resize observer。
