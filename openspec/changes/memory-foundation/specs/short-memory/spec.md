## ADDED Requirements

### Requirement: 会话短期记忆压缩
系统 MUST 为每个 `sessionId` 在 `short_memory` 表保存压缩文本；压缩 MUST 使用 keep-key 策略，优先保留约束、目标、路径、错误、决定等关键行，去重后保留最近 80 行。

#### Scenario: 助手回复后更新压缩态
- **WHEN** agentChat 收到 `assistant` 事件
- **THEN** 系统 MUST 对 prior、用户消息与助手内容执行 compressContext 并写入该 session

#### Scenario: 下轮注入压缩上下文
- **WHEN** 同 session 再次 agentChat 且存在短期记忆
- **THEN** 系统 MUST 将压缩文本前缀为「短期记忆/压缩上下文」注入用户消息之前
