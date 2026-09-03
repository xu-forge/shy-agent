## Why

日历点开定时实例只能看配置摘要，看不到跑完后的结果；`run_skill` 仍是预留日志，没有运行记录与会话。用户对照参考图期望：执行完点当天实例即可看到成功态、起止/耗时、正文，并能继续对话。现在补齐「真跑 → 落库 → 结果弹层」才能让「已安排」从展示变成可验收的自动化。

## What Changes

**到点真执行**
- From: `run_skill` 仅打日志；提醒只发事件、无持久 run
- To: 命中后写入 `schedule_runs`，提醒记成功；跑技能则新建会话并 `runAgent`
- Reason: 没有执行与记录就不可能有结果弹层
- Impact: `schedule/runner` 及调度入口；非破坏（旧任务可默认字段）

**任务可配置执行策略**
- From: 任务仅有频率/动作/技能或提醒文案
- To: 增加 `agentMode`（默认目标；UI「普通模式」= interactive）、`allowAutoConfirm`（默认关）、可选 `projectId`
- Reason: 过夜跑要可配模式与高危策略；会话需归入项目或「未选择项目」
- Impact: store / IPC / `ScheduleEditor` 表单

**日历状态与结果弹层**
- From: 过去一律「已过期」；详情只有配置
- To: 有 run 显示执行中/成功/失败/等待确认；点开为结果弹层（正文、耗时、「继续对话」）；无 run 仍为配置详情 / 尚未触发
- Reason: 对齐参考图一
- Impact: `CalendarView`、详情组件、查询 run 的 IPC

**明确不做**
- 单次跳过、改 cron、触发/模板 Tab、多机会话

## Capabilities

### New Capabilities

- `schedule-run-execution`：到点执行、`schedule_runs` 持久化、任务执行策略字段、与会话/项目绑定
- `schedule-run-result-ui`：日历 run 状态、结果弹层、继续对话与编辑入口

### Modified Capabilities

- （无已归档主规格需 delta；日历展示契约在 change `schedule-calendar-ui` 内，本 change 以新 capability 叠加结果态，不强制改其 archived 文本。）

## Impact

- **main**：`schedule/runner`、`schedule/store`、新 runs store、IPC；复用 `createSession` / `bindSessionProject` / `runAgent` / confirm
- **shared/preload**：任务与 run 类型、查询 API
- **renderer**：编辑表单、日历状态、结果弹层、打开会话导航
- **测试**：runner 落 run、按 taskId+at 查询、状态文案、绑定项目顺序（消息前 bind）
