# Design: schedule-calendar

## Context

产品已有工作流引擎与 `WorkflowSchedule`（frequency + time → cron）及 `checkSchedules` 轮询。用户要独立定时任务 + 日历 UI，动作含跑工作流 / 提醒 / 技能，并与工作流自带定时并存（仅提示双跑风险）。数据根在 `~/.shy`。

## Goals / Non-Goals

**Goals:**
- 独立 `ScheduleTask` 持久化与 CRUD
- 月历展示当月展开实例；C2 交互（点空新建、拖改时间）
- 到点执行三类动作；提醒在应用内可见
- 双跑仅提示，用 `taskId` 区分

**Non-Goals:**
- 自动关闭工作流定时
- 完整 iCal/RRULE 产品级编辑器
- 云同步 / 多设备

## Decisions

### D1：数据模型
- **选择**：SQLite 表 `schedule_tasks`（建议落在现有 `shy.sqlite`）：
  - `id` (taskId)、`title`、`enabled`、`action` (`run_workflow`|`remind`|`run_skill`)
  - `payload` JSON（workflowId / message / skillId 等）
  - 调度字段对齐或复用 `WorkflowSchedule` 形状（`frequency/time/weekdays/.../cron`）
  - `created_at` / `updated_at`
- **理由**：与工作流库共存，查询简单。
- **已考虑 alternative**：每任务一个文件 → 日历查询差，拒绝。

### D2：重复展开
- **选择**：主进程或 shared 纯函数 `expandOccurrences(task, rangeStart, rangeEnd) → { taskId, at, title, action }[]`，供月历 IPC 使用；按 cron/频率在可见月内展开。
- **理由**：UI 不自己猜日历规则。
- **已考虑 alternative**：只显示「锚点日」→ 无法满足「哪一天有哪些」，拒绝。

### D3：拖改时间语义
- **选择**：拖到新日期/时间时，更新任务的 **`time`（及必要时 frequency 不变）**；若拖到另一天且 frequency 为 weekly/monthly，同时更新 `weekdays` / `dayOfMonth` 以匹配落点；单次（若本期仅有周期类型）则改 time。UI 文案说明「拖拽会改该系列的调度时间」。
- **理由**：与「系列任务」心智一致，实现简单。
- **已考虑 alternative**：只改「这一次」例外 → 需例外存储，本期不做。

### D4：调度执行
- **选择**：扩展现有 30s 轮询（或并行 `checkCalendarTasks`）：对 enabled 任务用 cron 匹配当前分钟；匹配则按 action 执行；`lastFired` 按 `taskId+分钟戳` 防同一分钟双触。
- **理由**：复用工作流调度节奏。
- **run_workflow**：调用 `runWorkflowNow`，trigger 标记为 `calendar_task`（或 run 元数据带 `taskId`）。
- **remind**：`emit` 事件到 renderer（toast/会话通知条）。
- **run_skill**：读 skill；本期最小执行=记录日志 + 尝试已有技能脚本入口（若无则 stub 成功写 app/agent log，UI 标明「技能执行预留」）。

### D5：冲突提示（R2）
- **选择**：`listScheduleTasks` / 保存任务时计算：若 action=run_workflow 且目标工作流 `schedule.enabled`，返回 `warnings[]`（含 workflowId、taskId）；UI 黄条提示，不阻断保存。
- **理由**：用户明确要求可重复、自管。

### D6：导航与 UI
- **选择**：`App` nav 增加 `calendar`；`CalendarView`：月网格 + 当日/选中详情抽屉或侧栏；新建/编辑表单含动作与调度编辑器（可复用 `WorkflowScheduleEditor` 思路抽公共组件）。
- **拖拽**：任务芯片可拖到其他日期格；松手调 IPC `updateScheduleTask`。

### D7：存储路径
- **选择**：写入 `getShyPaths().dbPath` 同一库，不另起文件。

## Risks / Trade-offs

- [Risk] 双跑费用/副作用 → Mitigation: 提示 + run 元数据可审计。
- [Risk] 月展开性能 → Mitigation: 仅当前月 ±1 缓冲；任务量个人级。
- [Trade-off] skill stub → 接口与 UI 完整，执行深度可迭代。
- [Trade-off] 拖拽改系列而非单次例外 → 接受本期简化。

## Migration Plan

1. 建表 + IPC + expand/调度。
2. 日历 UI 与导航。
3. 动作执行与冲突 warnings。
4. 不强制迁移旧 `workflow.schedule`（R2 并存）；可选后续「一键转为日历任务」。
5. Rollback：停用日历调度代码路径即可；表可保留。

## Open Questions

- （无阻塞）`run_skill` 最小执行是否调用 skill 包内默认脚本：实现时优先尝试，失败则 stub 日志。
