## Why

Agent 需要跨会话记住偏好与工作流，且用户必须能查看与管理。产品要求长期记忆可 CRUD、Agent 更新须通知；短期记忆为保关键压缩，全部仅存本机 userData，不上云。

## What Changes

- 新增 SQLite 长期记忆表（title/content/tags/source/时间戳，软删除）
- IPC + MemoryView：列表、新增、编辑、删除
- Agent 工具 memory_upsert/list/delete；upsert/delete 发 memory/notify 事件
- 短期记忆表 + compressContext keep-key；agentChat 回合末写入 session 压缩态

## Capabilities

### New Capabilities

- `long-memory`: SQLite 长期记忆 CRUD 与 Agent 维护通知
- `short-memory`: 会话级保关键上下文压缩

### Modified Capabilities

（无）

## Impact

- 依赖 better-sqlite3；数据文件 `userData/memory.sqlite`
- ipc.ts、MemoryView、builtin 记忆工具、agentChat 压缩钩子
