# schedule-calendar Implementation Plan

> **For agentic workers:** 按 tasks.md 逐项实现；规格见 `specs/calendar-schedule-tasks` 与 `specs/calendar-month-ui`。

**Goal:** 独立定时任务 + 侧栏「日历」月视图（点空新建、编辑、拖改时间）；到点执行 run_workflow / remind / run_skill；与 workflow.schedule 并存并提示双跑。

**Architecture:** SQLite `schedule_tasks` → CRUD + `expandOccurrences` → 与现有 30s 调度并列的 `checkCalendarTasks` → IPC → `CalendarView`。动作分别接 `runWorkflowNow`、renderer 提醒事件、skills 最小路径/stub。

**Tech Stack:** Electron main、better-sqlite3、现有 `compileCron`/`WorkflowSchedule`、React 月历 UI、vitest。

---

## Task 1: 类型与存储

**Maps to:** tasks 1.1–1.2

- [ ] **Step 1:** 在 `src/shared/ipc.ts`（或邻接模块）定义 `ScheduleTask`、`ScheduleTaskAction`、payload、`ScheduleOccurrence`、`ScheduleConflictWarning`
- [ ] **Step 2:** 在 memory/db 初始化处建表 `schedule_tasks`（id TEXT PK, title, enabled, action, payload JSON, schedule JSON 或列拆分, timestamps）
- [ ] **Step 3:** 实现 `src/main/schedule/store.ts`：list/get/create/update/delete
- [ ] **Commit:** `feat(日历): 定时任务表与 CRUD`

## Task 2: 展开与冲突检测

**Maps to:** tasks 1.3–1.4

- [ ] **Step 1:** `src/main/schedule/expand.ts`（或 shared）：复用 `compileCron`，在范围内枚举发生时刻
- [ ] **Step 2:** 单测 daily/weekly/monthly 与边界
- [ ] **Step 3:** `detectWorkflowScheduleConflicts(tasks, workflows) → warnings[]`
- [ ] **Commit:** `feat(日历): 发生实例展开与双跑警告`

## Task 3: 调度执行

**Maps to:** tasks 2.1–2.5

- [ ] **Step 1:** `checkCalendarTasks`：读 enabled 任务、cron 匹配当前分钟、`lastFired` 防抖
- [ ] **Step 2:** 接入 `startScheduler` 同定时器或并列 interval
- [ ] **Step 3:** 三动作分发；workflow run 元数据带 taskId；remind emit；skill stub/最小
- [ ] **Step 4:** 单测匹配与防同分钟双触
- [ ] **Commit:** `feat(日历): 到点执行三类动作`

## Task 4: IPC

**Maps to:** tasks 3.1–3.3

- [ ] **Step 1:** 通道常量 + main handlers（含 expand 范围查询、保存返回 warnings）
- [ ] **Step 2:** preload + `window.shy` 类型
- [ ] **Step 3:** 提醒事件订阅 API
- [ ] **Commit:** `feat(日历): scheduleTasks IPC 与提醒事件`

## Task 5: Calendar UI

**Maps to:** tasks 4.1–4.4

- [ ] **Step 1:** App nav「日历」+ `CalendarView` 月网格与月切换，拉 expand
- [ ] **Step 2:** 新建/编辑抽屉或模态；调度编辑复用或抽取公共组件；三动作字段
- [ ] **Step 3:** 拖拽到其他日 → update（系列 time/weekday/dayOfMonth）+ 说明文案
- [ ] **Step 4:** warnings 黄条；remind toast
- [ ] **Commit:** `feat(日历): 月视图新建编辑与拖改时间`

## Task 6: 验收

**Maps to:** tasks 5.1–5.2

- [ ] **Step 1:** `npm run typecheck && npm test`
- [ ] **Step 2:** 对照 brainstorm §5 手工点验
- [ ] **Commit:**（若有修测）`test(日历): 补调度与展开覆盖`

---

## 不做

- 自动禁用 workflow.schedule
- 单次例外（只改这一次）存储
- 完整 RRULE / 云同步
