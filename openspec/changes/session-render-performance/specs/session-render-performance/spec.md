## ADDED Requirements

### Requirement: 会话历史分页读取

会话界面 MUST 以游标分页读取历史消息，首次加载最近一页且默认不超过 50 条；分页结果 MUST 按会话时间正序提供给渲染层，并能标识是否还有更早消息。

#### Scenario: 打开长会话

- **WHEN** 用户打开包含超过 50 条消息的会话
- **THEN** 界面只请求最近一页消息，不请求全部历史消息，并显示可继续加载更早消息的状态

#### Scenario: 加载更早消息

- **WHEN** 用户滚动到会话顶部且仍有更早消息
- **THEN** 客户端使用上一页游标请求更早消息，去重后插入列表头部

### Requirement: 动态虚拟渲染

会话界面 MUST 只将视口附近的消息 block 渲染为 DOM，并 MUST 支持消息高度、Markdown 内容和工具详情展开后的动态变化。

#### Scenario: 长列表滚动

- **WHEN** 会话包含数百条消息并滚动到任意位置
- **THEN** DOM 中只保留视口及 overscan 范围内的 block，滚动位置和消息顺序保持正确

#### Scenario: 展开工具详情

- **WHEN** 用户展开一个工具输出详情
- **THEN** 虚拟列表重新测量该 block，高度更新且相邻消息不会发生错误重叠

### Requirement: 流式更新隔离与批处理

流式输出 MUST 与历史消息状态隔离，delta MUST 以不高于约 50ms 的批次更新界面；完成或结果事件到达时 MUST 立即提交最终内容。

#### Scenario: 长历史会话中流式输出

- **WHEN** assistant 在已有大量历史消息的会话中持续输出 delta
- **THEN** 只有当前流式 block 和必要的虚拟列表测量发生更新，历史 block 不因每个 delta 重新解析

#### Scenario: 流式结束

- **WHEN** 收到 `assistant_done` 或最终 `result` 事件
- **THEN** 当前 block 立即显示完整内容、停止流式状态，并使用最终 Markdown 渲染

### Requirement: 历史加载滚动锚点

向上插入历史消息 MUST 保持插入前首个可见消息的视觉位置；用户主动离开底部后，新消息或流式输出 MUST NOT 强制跳到底部。

#### Scenario: 顶部加载历史

- **WHEN** 用户在阅读中间位置并触发更早消息加载
- **THEN** 加载完成后原首个可见 block 仍位于相同的相对视口位置

#### Scenario: 用户阅读旧消息时收到新消息

- **WHEN** 用户已滚离底部且会话收到新消息
- **THEN** 当前滚动位置不被强制改变，并提供回到底部的可用入口或状态

### Requirement: 现有会话兼容

优化 MUST 兼容已有 SQLite 会话消息和无消息的新会话，且 MUST NOT 改变 Agent 发送给模型的消息上下文。

#### Scenario: 打开旧会话

- **WHEN** 用户打开升级前创建的会话
- **THEN** 所有历史消息仍可通过向上分页读取，角色、顺序、工具结果和 Markdown 内容不变

#### Scenario: 空会话

- **WHEN** 用户打开没有消息的会话
- **THEN** 继续显示空会话欢迎态，发送消息流程不受影响
