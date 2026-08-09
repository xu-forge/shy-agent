## Context

agent-runtime-langgraph 提供 chat 与工具循环。本 change 落地分层记忆本地存储，不含云同步。

## Goals / Non-Goals

**Goals:** SQLite 长期记忆 CRUD（UI + IPC + Agent）；软删除与 source 标记；Agent upsert 通知；短期 keep-key 压缩按 session 持久化。  
**Non-Goals:** 向量检索、多用户、远程同步、自动升长期记忆。

## Decisions

### D1：better-sqlite3 + userData/memory.sqlite
- **选择**：主进程单文件 SQLite
- **理由**：零运维、与 Electron userData 一致
- **已考虑 alternative**：JSON 文件 → 并发与查询弱

### D2：长期软删除
- **选择**：`deleted_at` 标记
- **理由**：可审计、可恢复扩展

### D3：compressContext keep-key
- **选择**：正则匹配关键行，去重 slice(-80)
- **理由**：MVP 低 token、可预测；不调用模型摘要

## Risks / Trade-offs

- [Risk] 压缩丢上下文 → Mitigation: 保留路径/错误/约束关键词
- [Trade-off] 无全文检索 → 接受；后续可加 FTS

## Migration Plan

N/A — 首次启动自动建表。

## Open Questions

无。
