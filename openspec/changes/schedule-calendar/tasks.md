## 1. 数据与展开

- [x] 1.1 共享类型：`ScheduleTask`、动作枚举、payload、展开实例、warnings
- [x] 1.2 SQLite `schedule_tasks` 表 + CRUD（list/get/create/update/delete）
- [x] 1.3 `expandOccurrences(tasks, range)` 纯函数 + 单测（daily/weekly/monthly）
- [x] 1.4 双跑 warnings：对照目标工作流 `schedule.enabled`

## 2. 调度与动作执行

- [x] 2.1 `checkCalendarTasks`（或扩展现有轮询）：cron 匹配 + 防同分钟双触
- [x] 2.2 `run_workflow`：调 `runWorkflowNow`，run 元数据带 `taskId` / `calendar_task`
- [x] 2.3 `remind`：emit 到 renderer（应用内可见）
- [x] 2.4 `run_skill`：最小执行或明确 stub + 日志
- [x] 2.5 调度相关单测（匹配/防抖）

## 3. IPC / preload

- [x] 3.1 `scheduleTasksList` / `Get` / `Create` / `Update` / `Delete` / `Expand`（或 list+expand 合并）
- [x] 3.2 提醒事件通道 + preload `window.shy` 暴露
- [x] 3.3 返回值含 `warnings`（保存/列表按需）

## 4. 日历 UI

- [x] 4.1 侧栏 nav「日历」+ `CalendarView` 月网格、月切换
- [x] 4.2 点空新建 / 点任务编辑表单（三动作 + 调度编辑，可复用 WorkflowSchedule 思路）
- [x] 4.3 拖拽改日/时 → update IPC + 系列语义说明文案
- [x] 4.4 双跑警告条；remind toast/状态条

## 5. 验收

- [ ] 5.1 `npm run typecheck && npm test` 通过
- [ ] 5.2 对照 brainstorm 验收标准手工点验月历与到点行为
