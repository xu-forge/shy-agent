# Spec: session-file-tracking

## ADDED Requirements

### Requirement: session_files 表
Main MUST 在 SQLite 中维护 `session_files` 表：
- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `session_id TEXT NOT NULL`（索引）
- `op TEXT NOT NULL`（枚举：`read` | `write` | `delete`；`edit` / `copy` / `move` 预留）
- `path TEXT NOT NULL`
- `occurred_at INTEGER NOT NULL`（ms 时间戳）

#### Scenario: 表创建
- **WHEN** 应用首次启动且表不存在
- **THEN** DB migration 创建 `session_files` 表与 `session_id` 索引

### Requirement: builtin.ts 工具埋点
`src/main/agent/tools/builtin.ts` 中所有读/写/删除类工具 MUST 在成功返回前调用 `recordFileOp(sessionId, op, path)`。**本期覆盖**：`fs_read` / `fs_write` / `fs_delete`。`fs_edit` / `fs_copy` / `fs_move` 等新工具落地后扩展。

#### Scenario: fs_read 成功
- **WHEN** `fs_read` 工具成功读取文件
- **THEN** `recordFileOp(sessionId, 'read', path)` 被调用
- **AND** DB 新增一行 `session_files` 记录

#### Scenario: fs_write 成功
- **WHEN** `fs_write` 工具成功写入文件
- **THEN** `recordFileOp(sessionId, 'write', path)` 被调用

#### Scenario: fs_delete 成功
- **WHEN** `fs_delete` 工具成功删除文件
- **THEN** `recordFileOp(sessionId, 'delete', path)` 被调用

#### Scenario: 工具失败不记录
- **WHEN** 工具执行抛出错误
- **THEN** MUST NOT 调用 `recordFileOp`

### Requirement: 文件 IPC 端点
Main MUST 暴露以下 IPC：
- `session:files:list(sessionId)` → `SessionFileRecord[]`（按 `occurred_at` 倒序）
- `session:files:reveal(sessionId, path)` → void（在系统资源管理器打开）
- `session:files:ui-hide(sessionId, path)` → void（仅 UI 状态；不删 DB；本期不实现持久化）

#### Scenario: 列出会话文件
- **WHEN** renderer 调用 `session:files:list(sessionId)`
- **THEN** 返回该 session 全部 `session_files` 行

#### Scenario: 跨平台 reveal
- **WHEN** `session:files:reveal` 被调用且 `process.platform === 'win32'`
- **THEN** main 执行 `explorer /select,<path>`
- **WHEN** `process.platform === 'darwin'`
- **THEN** main 执行 `open -R <path>`

## MODIFIED Requirements

### Modified Requirement: shared/ipc.ts
- `IPC` 字典新增 `sessionFilesList` / `sessionFilesReveal`
- 新增类型 `SessionFileRecord = { id: number; sessionId: string; op: FileOp; path: string; occurredAt: number }`
- `FileOp = 'read' | 'write' | 'delete'`（**本期**；未来添加 fs_edit / fs_copy / fs_move 时扩展 union）
