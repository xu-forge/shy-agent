# Spec: session-tasks

## ADDED Requirements

### Requirement: session_tasks 表
Main MUST 在 SQLite 中维护 `session_tasks` 表：
- `id TEXT PRIMARY KEY`（任务 id；checklist 沿用原 id；Agent 动态任务由 Agent 生成）
- `session_id TEXT NOT NULL`（索引）
- `title TEXT NOT NULL`
- `done INTEGER NOT NULL`（0/1）
- `evidence TEXT`（可选）
- `source TEXT NOT NULL`（`'goal'` | `'agent'`）
- `occurred_at INTEGER NOT NULL`
- `updated_at INTEGER NOT NULL`

#### Scenario: 表创建
- **WHEN** 应用首次启动且表不存在
- **THEN** DB migration 创建 `session_tasks` 表与 `session_id` 索引

### Requirement: Agent task 事件
Main MUST 支持 Agent 通过 LangGraph emit `task` 事件，payload 形如：
```
{
  type: 'task',
  sessionId,
  kind: 'add' | 'update' | 'remove',
  id,
  title?,    // add 时必填
  done?,     // update 时可选
  evidence?  // update 时可选
}
```

#### Scenario: task.add
- **WHEN** 收到 `task` 事件且 `kind='add'`
- **THEN** DB 插入新行（id 由 Agent 提供；upsert 语义：同 id 已存在则 update）
- **AND** 推 `task` 事件到 renderer

#### Scenario: task.update
- **WHEN** 收到 `task` 事件且 `kind='update'`
- **THEN** DB 更新对应行的 title/done/evidence/updated_at
- **AND** 推 `task` 事件到 renderer

#### Scenario: task.remove
- **WHEN** 收到 `task` 事件且 `kind='remove'`
- **THEN** DB 删除对应行
- **AND** 推 `task` 事件到 renderer

### Requirement: 任务 IPC 端点
Main MUST 暴露以下 IPC：
- `session:tasks:list(sessionId)` → `SessionTaskRecord[]`
- `session:tasks:update({ sessionId, id, done, title?, evidence? })` → `SessionTaskRecord`（仅用户手动改写时使用）
- `session:tasks:delete({ sessionId, id })` → void

#### Scenario: 列出任务
- **WHEN** renderer 调用 `session:tasks:list(sessionId)`
- **THEN** 返回该 session 全部任务（含 source='goal' 与 source='agent'），按 `updated_at` 倒序

#### Scenario: 用户手动更新勾选
- **WHEN** renderer 调用 `session:tasks:update` 仅传 `done`
- **THEN** DB 更新 done 与 updated_at
- **AND** 记录一条本地最近用户改动时间（renderer 端状态），用于 Agent 覆盖判断

#### Scenario: 删除任务
- **WHEN** renderer 调用 `session:tasks:delete`
- **THEN** DB 删除该行

## MODIFIED Requirements

### Modified Requirement: shared/ipc.ts
- `IPC` 字典新增 `sessionTasksList` / `sessionTasksUpdate` / `sessionTasksDelete`
- `EventPayload` 联合类型新增 `kind: 'task'` 分支
- 新增类型 `SessionTaskRecord = { id: string; sessionId: string; title: string; done: boolean; evidence?: string; source: 'goal' | 'agent'; occurredAt: number; updatedAt: number }`

### Modified Requirement: final-runtime
- LangGraph 节点在目标模式下生成 checklist 时，**不再** emit `goal` 事件中的 `checklist` 字段（仅保留 `goal` 文本）
- 改为逐项 emit `task` 事件（kind=add，source='goal'），由 main 端写入 `session_tasks` 表
- `goal` 事件 payload 变化：`checklist` 字段移除
