## ADDED Requirements

### Requirement: 任务执行策略字段
定时任务 MUST 支持可选执行策略字段：`agentMode`（`goal` | `normal`，默认 `goal`）、`allowAutoConfirm`（boolean，默认 `false`）、`projectId`（string | null，默认 null）。UI MUST 将 `normal` 展示为「普通模式」、`goal` 展示为「目标模式」；MUST NOT 使用「交互模式」作为用户可见文案。创建与更新表单 MUST 允许选择所属项目或「未选择项目」。

#### Scenario: 默认策略
- **WHEN** 用户新建定时任务且未改执行策略
- **THEN** 持久化结果 MUST 为 `agentMode=goal`、`allowAutoConfirm=false`、`projectId=null`

#### Scenario: 普通模式文案
- **WHEN** 用户打开模式选择
- **THEN** 选项文案 MUST 包含「普通模式」且 MUST NOT 展示「交互模式」

---

### Requirement: 运行记录持久化
系统 MUST 将每次到点触发持久化为 `schedule_runs` 记录，至少包含：`id`、`taskId`、`scheduledAt`（与展开实例 `at` 可对齐的 ISO 分钟精度）、`action`、`status`（`running` | `succeeded` | `failed` | `waiting_confirm`）、`startedAt`、可选 `endedAt` / `sessionId` / `errorMessage`。同一任务同一 `scheduledAt` 在同一分钟窗口内 MUST NOT 重复成功触发两次（沿用现有防重）。

#### Scenario: 提醒成功落库
- **WHEN** 启用中的提醒任务在某分钟命中 cron 且本分钟未触发过
- **THEN** 系统 MUST 写入一条 `action=remind` 且最终 `status=succeeded` 的 run（`sessionId` 可空）

#### Scenario: 防重
- **WHEN** 同一任务在同一分钟内调度循环再次检查
- **THEN** 系统 MUST NOT 再创建第二条成功执行的 run

---

### Requirement: 跑技能建会话并执行
当 `action=run_skill` 到点时，系统 MUST：创建新会话（模式按任务 `agentMode`，其中 `normal` 映射现有 interactive）；若 `projectId` 非空且项目仍存在则在写入首条用户消息前绑定该项目，否则保持未绑定（侧栏「未选择项目」）；项目已删除时 MUST 按未绑定继续且 MUST NOT 仅因项目缺失而拒绝执行；随后启动 Agent 运行指定技能。缺 apiKey、技能不存在或执行抛错时，对应 run MUST 为 `failed` 并带可读 `errorMessage`。

#### Scenario: 绑定项目
- **WHEN** 任务配置了有效 `projectId` 且到点跑技能
- **THEN** 新建会话 MUST 在首条用户消息写入前完成 `projectId` 绑定

#### Scenario: 未选项目
- **WHEN** 任务 `projectId` 为空且到点跑技能
- **THEN** 新建会话 MUST 保持无项目绑定

#### Scenario: 缺凭证失败
- **WHEN** 到点跑技能但未配置 apiKey
- **THEN** 该次 run MUST 标记 `failed` 且错误信息可读

---

### Requirement: 高危自动确认开关
当 Agent 请求高危确认时：若任务 `allowAutoConfirm=true`，系统 MUST 自动确认以继续执行；若为 `false`，系统 MUST 走现有用户确认闸门，并将该次 run 标为 `waiting_confirm`（直至确认继续、拒绝或超时失败——超时上限由实现选定并在 tasks 写明）。

#### Scenario: 默认不自动确认
- **WHEN** `allowAutoConfirm=false` 且执行中触发高危确认
- **THEN** 系统 MUST 向用户请求确认，且 run 可处于 `waiting_confirm`

#### Scenario: 允许自动确认
- **WHEN** `allowAutoConfirm=true` 且执行中触发高危确认
- **THEN** 系统 MUST 自动确认且 MUST NOT 因该确认阻塞过夜执行

---

### Requirement: 按实例查询运行记录
系统 MUST 提供按 `taskId` + `scheduledAt`（及可选批量按时间范围）查询 run 的能力，供日历与详情使用。若同一键有多条，MUST 返回最新一条（按 `startedAt` 或等价序）。

#### Scenario: 查到成功 run
- **WHEN** 客户端以某实例的 `taskId` 与 `at` 查询
- **THEN** 若存在对应成功 run，MUST 返回该记录（含 `sessionId` 若有）
