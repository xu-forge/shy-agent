# memory-foundation Implementation Plan

**Goal:** 本地 SQLite 分层记忆（长期 CRUD + 短期 keep-key 压缩）并接通 UI 与 Agent 工具。

**Architecture:** main/memory/db.ts + IPC；MemoryView；builtin 记忆工具；agentChat 压缩钩子。

**Tech Stack:** better-sqlite3, Electron userData

---

按 `tasks.md` 实现；数据仅存本机，无云同步。
