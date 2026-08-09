## ADDED Requirements

### Requirement: 长期记忆本地持久化
系统 MUST 在 `userData/memory.sqlite` 的 `long_memory` 表中持久化长期记忆条目（id、title、content、tags、source、时间戳）；删除 MUST 使用软删除（`deleted_at`）。

#### Scenario: 用户新增条目
- **WHEN** 用户通过 UI 或 IPC 提交 title 与 content
- **THEN** 系统 MUST 写入 SQLite 并在列表中返回该条目，`source` 为 `user` 或 `agent`

#### Scenario: 软删除
- **WHEN** 用户或 Agent 删除某 id
- **THEN** 系统 MUST 设置 `deleted_at`，且默认列表 MUST 不返回已删条目

### Requirement: 长期记忆 UI 管理
系统 MUST 提供 MemoryView，支持列出、新增、编辑、删除长期记忆（简体中文）。

#### Scenario: 编辑已有条目
- **WHEN** 用户在 MemoryView 选择编辑并保存
- **THEN** 系统 MUST 调用 upsert 更新 `updated_at` 并刷新列表

### Requirement: Agent 长期记忆工具与通知
Agent MUST 可通过 `memory_upsert`、`memory_list`、`memory_delete` 维护长期记忆；`memory_upsert` MUST 发出 `memory` 事件；`memory_delete` MUST 经高危确认后发 `memory` 事件；main MUST 向 renderer 推送 notify 说明变更。

#### Scenario: Agent 写入记忆
- **WHEN** Agent 调用 memory_upsert
- **THEN** 系统 MUST 以 `source=agent` 落库并推送用户可见通知
