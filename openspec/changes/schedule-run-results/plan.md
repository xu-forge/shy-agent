# 定时任务执行结果 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development
> to implement this plan task-by-task.

**Goal:** 到点真正执行定时任务并落库，日历可点开查看执行结果并继续对话。

**Architecture:** `schedule_runs` 持久化每次触发；`run_skill` 经 createSession → bindSessionProject → runAgent；日历用 taskId+at 关联 run，有则结果弹层、无则配置详情。任务增补 agentMode / allowAutoConfirm / projectId。

**Tech Stack:** Electron main SQLite、现有 sessions/projects/agent、React CalendarView、vitest

**Spec/Design:** `openspec/changes/schedule-run-results/`

**等待确认超时：** 默认 30 分钟未确认 → `failed` + 可读原因。

**普通模式结果正文：** 优先非空末条 `assistant` 消息；目标模式优先 `result_content`。

---

## Task 1: 任务字段迁移

**Files:**
- Modify: `src/shared/ipc.ts`、`src/main/schedule/store.ts`、相关 test

- [ ] **Step 1:** 类型加 `agentMode`、`allowAutoConfirm`、`projectId?`
- [ ] **Step 2:** ALTER/建列默认 `goal` / `0` / NULL；读写映射
- [ ] **Step 3:** store 单测默认值与更新；Commit：`feat(schedule): 任务支持模式与项目字段`

---

## Task 2: schedule_runs store + IPC

**Files:**
- Create: `src/main/schedule/runs-store.ts`（+ test）
- Modify: `src/main/schedule/ipc.ts`、`src/shared/ipc.ts`、preload

- [ ] **Step 1:** 红测 create/getByTaskAt/listRange/updateStatus
- [ ] **Step 2:** 建表实现并绿
- [ ] **Step 3:** IPC `scheduleRunsGet` / `scheduleRunsList`（命名与现有风格对齐）
- [ ] **Step 4:** Commit：`feat(schedule): 增加 schedule_runs 持久化与查询`

---

## Task 3: runner 真执行

**Files:**
- Modify: `src/main/schedule/runner.ts`、`runner.test.ts`；接线 createSession/bind/runAgent/settings

- [ ] **Step 1:** remind 路径写 run succeeded/failed
- [ ] **Step 2:** run_skill：session → bind → prompt → runAgent；更新 run 终态
- [ ] **Step 3:** confirm 包装与 waiting_confirm / 30min 超时
- [ ] **Step 4:** 单测 mock 依赖；Commit：`feat(schedule): 到点执行技能并写入运行记录`

---

## Task 4: 编辑表单

**Files:**
- Modify: `ScheduleEditor.tsx`、`CalendarView.tsx` form 映射

- [ ] **Step 1:** UI 三控件 + 文案（普通模式 / 未选择项目）
- [ ] **Step 2:** 保存与回显打通

---

## Task 5: 日历状态与结果弹层

**Files:**
- Modify: `calendarScheduleUi.ts`(+test)、周/月视图、`ScheduleOccurrenceDetail` 或新 `ScheduleRunResultModal`、`CalendarView.tsx`、`App.tsx`（打开会话）

- [ ] **Step 1:** status 纯函数接入 Optional run
- [ ] **Step 2:** 加载范围 runs；卡片状态
- [ ] **Step 3:** 有 run 结果弹层；无 run 配置详情
- [ ] **Step 4:** 继续对话回调；typecheck + 单测
- [ ] **Step 5:** Commit：`feat(ui): 定时任务展示执行结果并可继续对话`

---

## Non-goals

- 单次跳过、cron 语义变更、触发/模板 Tab、多机
