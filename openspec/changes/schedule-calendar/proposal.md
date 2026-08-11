# Proposal: schedule-calendar

## Why

工作流虽已支持 cron 定时，但用户只能在列表里看到一句调度描述，无法按日期管理「哪天有哪些定时」。需要独立的定时任务模型与日历主界面，才能覆盖提醒、跑工作流、绑技能等多种动作，并与现有工作流定时并存、由用户自行取舍是否重复。

## What Changes

- **新增独立定时任务实体**（含 `taskId`、启用态、重复规则、动作类型与载荷）。
- **侧栏独立导航「日历」**：月视图为主；点空新建、点任务编辑、拖改时间并落盘。
- **动作类型**：`run_workflow` / `remind` / `run_skill`（技能本期接接口，执行最小可用或明确 stub）。
- **与 `workflow.schedule` 并存（R2）**：两边都可触发；检测到可能对同一工作流双跑时**提示用户**，不自动禁用任一侧；用 `taskId` 与 run 元数据区分。
- **调度器**：扩展或并行日历任务调度，到点按动作执行；运行/提醒可观测。

## Capabilities

### New Capabilities

- `calendar-schedule-tasks`：定时任务 CRUD、重复展开、到点执行、与工作流定时冲突提示
- `calendar-month-ui`：侧栏日历导航、月视图、点空新建、拖改时间、任务详情编辑

### Modified Capabilities

（主规格库若尚未归档工作流能力，本 change 以新 capability 描述行为；实现时对接现有 `runWorkflowNow` / skills，不强制删除 `workflow.schedule`。）

## Impact

- **main**：新表/存储、日历任务调度、IPC、与 workflow/skills 触发衔接；运行记录带 `taskId` / trigger 区分
- **shared / preload**：任务类型、IPC、事件（提醒）
- **renderer**：侧栏 nav、Calendar 视图与编辑 UI、拖拽交互、冲突提示
- **测试**：重复展开、调度匹配、拖拽改时落盘、冲突提示逻辑
