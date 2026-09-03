# 定时任务周/月/详情 UI Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 定时任务主区支持周/月切换、对齐参考的卡片/短条样式，以及实例只读详情弹层。

**Architecture:** 纯函数负责周一网格、周范围、状态与频率文案；`CalendarView` 作壳加载 `scheduleTasksExpand`；拆周/月/详情子组件。不改 IPC。

**Tech Stack:** React、现有 schedule IPC、vitest、app.css

**Spec/Design:** `openspec/changes/schedule-calendar-ui/`

---

## Task 1: 日历纯函数

**Files:**
- Create/Modify: `src/renderer/src/lib/calendarGrid.ts`（或扩展 `calendarOccurrences.ts`）
- Create: 对应 `*.test.ts`

- [ ] **Step 1:** 红测：周一始 42 格；已知「1 日=周三」时第一格为上周一
- [ ] **Step 2:** 实现并绿
- [ ] **Step 3:** 红测周范围七天、status、formatScheduleLabel
- [ ] **Step 4:** 实现并绿；Commit：`test(ui): 定时任务周月网格与状态文案纯函数`

---

## Task 2: CalendarView 壳与数据范围

**Files:**
- Modify: `src/renderer/src/components/CalendarView.tsx`

- [ ] **Step 1:** `viewMode` + 工具栏（范围文案、前后、今天、周|月）
- [ ] **Step 2:** `fetchRangeData(start, end)` 替换仅按月 fetch；切换视图重载
- [ ] **Step 3:** 页头新建按钮接 `openCreate(today)`

---

## Task 3: 周视图与月视图

**Files:**
- Create: `src/renderer/src/components/schedule/ScheduleWeekView.tsx`
- Create: `src/renderer/src/components/schedule/ScheduleMonthView.tsx`
- Modify: `CalendarView.tsx`、`app.css`

- [ ] **Step 1:** 周七列卡片 UI + 当天高亮；点击 occurrence 回调
- [ ] **Step 2:** 月网格短条 + 今天高亮；点空新建、点条详情；可选保留拖拽
- [ ] **Step 3:** 样式抛光对照图一图二

---

## Task 4: 实例详情弹层

**Files:**
- Create: `src/renderer/src/components/schedule/ScheduleOccurrenceDetail.tsx`
- Modify: `CalendarView.tsx`

- [ ] **Step 1:** Modal：标题、本地、状态、频率、预计时间、动作摘要
- [ ] **Step 2:** 「查看定时任务」→ `openEdit`；关闭；确认无暂停此次
- [ ] **Step 3:** typecheck + 单测；Commit：`feat(ui): 定时任务周月视图与实例详情`

---

## Non-goals

- 触发任务 / 模板 / 任务管理 / 单次暂停 IPC
