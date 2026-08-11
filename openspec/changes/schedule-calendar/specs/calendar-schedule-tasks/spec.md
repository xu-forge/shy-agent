## ADDED Requirements

### Requirement: 独立定时任务实体
系统 MUST 以独立实体持久化日历定时任务（`taskId`），不得仅作为工作流列表的视图投影。每条任务 MUST 含：`id`、`title`、`enabled`、调度规则（可与 `WorkflowSchedule` 同构：frequency/time/weekdays/dayOfMonth/cron 等）、`action`（`run_workflow` | `remind` | `run_skill`）、`payload`（JSON）、`createdAt`/`updatedAt`。数据 MUST 写入 `~/.shy` 下 SQLite（`db/shy.sqlite` 或经 `getShyPaths()` 的等价库）。

#### Scenario: 创建任务
- **WHEN** 用户通过 IPC 创建合法定时任务
- **THEN** 系统 MUST 分配唯一 `taskId`、落盘，并在列表/展开查询中可见

#### Scenario: 更新与删除
- **WHEN** 用户更新标题、调度、动作载荷或删除任务
- **THEN** 系统 MUST 持久化变更；删除后展开与调度 MUST 不再包含该任务

#### Scenario: 启用停用
- **WHEN** 任务 `enabled=false`
- **THEN** 调度器 MUST 不触发其动作；月历 MAY 仍展示（以灰态或等价方式区分）

### Requirement: 重复展开供月历查询
系统 MUST 提供按时间范围展开发生实例的能力（纯函数或 IPC），输入任务集合与 `[rangeStart, rangeEnd]`，输出含 `taskId`、`at`、`title`、`action` 的实例列表，供月视图展示。

#### Scenario: 每日任务在当月展开
- **WHEN** 任务 frequency 为 daily 且 enabled，查询覆盖该月
- **THEN** 结果 MUST 在该月符合 `time` 的各日各有一条实例（时区与现有工作流 cron 编译一致）

### Requirement: 到点执行三类动作
系统 MUST 周期性检查 enabled 日历任务（可与现有工作流 30s 轮询同节奏），在匹配的分钟内按 `action` 执行，并用 `taskId`+分钟戳防止同一分钟重复触发。

#### Scenario: run_workflow
- **WHEN** 到点且 action 为 `run_workflow`、payload 含合法 `workflowId`
- **THEN** 系统 MUST 调用现有工作流执行入口，且运行元数据 MUST 可区分来自日历任务（如 `trigger=calendar_task` 与/或 `taskId`）

#### Scenario: remind
- **WHEN** 到点且 action 为 `remind`
- **THEN** 系统 MUST 向 renderer 发出可观测提醒事件（应用内 toast/状态条即可）；payload 中的 message/title MUST 对用户可见

#### Scenario: run_skill
- **WHEN** 到点且 action 为 `run_skill`、payload 含 `skillId`
- **THEN** 系统 MUST 尝试最小可执行路径（如调用技能包脚本入口）；若不可用 MUST 写明确 stub/失败日志且不崩溃进程，UI/文档 MUST 标明本期执行深度

### Requirement: 与工作流定时并存并提示双跑
系统 MUST NOT 因存在日历任务而自动禁用 `workflow.schedule`。当 action=`run_workflow` 且目标工作流自身 `schedule.enabled` 时，系统 MUST 在保存任务或列出/加载日历相关数据时返回可展示的 `warnings`（含 workflowId 与相关 taskId），且 MUST 仍允许保存与双方触发。

#### Scenario: 双跑提示不阻断
- **WHEN** 用户保存会跑某工作流的日历任务，且该工作流定时已启用
- **THEN** 响应 MUST 含警告信息；任务 MUST 仍被保存；后续两边调度仍可各自触发

#### Scenario: 用 taskId 区分
- **WHEN** 同一工作流被日历任务与工作流定时先后或同时触发
- **THEN** 产生的运行记录 MUST 能通过 `taskId` 和/或 trigger 来源区分
