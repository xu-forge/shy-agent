# Brainstorm — memory-foundation

背景：agent-runtime 已跑通，但无跨会话记忆。产品简报要求长期可 UI 管理、Agent 可维护且须告知；短期为保关键压缩，仅本地。

决议链：
- Q1 长期存储？→ SQLite（userData/memory.sqlite），软删除
- Q2 短期形态？→ 每 session 一行 compressed 文本，非独立日记
- Q3 压缩策略？→ keep-key 规则抽取（约束/目标/路径/错误/决定等），去重保留最近 80 行
- Q4 Agent 写入？→ memory_upsert/delete 工具 + notify 事件；用户 UI 同源 CRUD
- Q5 云同步？→ 不做，纯本地
