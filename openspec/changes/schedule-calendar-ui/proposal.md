# Proposal: schedule-calendar-ui

## Why

定时任务主区仍是旧月历芯片 + 编辑抽屉，缺少参考图中的周视图、月格紧凑条与「点开某次实例」的只读详情。用户已有三张对标截图（周 / 月 / 详情），现在改展示层即可明显提升「已安排」可用性，且不必扩触发任务或模板空壳。

## What Changes

**周 / 月切换**
- From: 仅月网格
- To: 工具栏「周 | 月」；周为 7 列，当天列高亮；月为圆角网格 + 格内 `HH:mm 标题` 短条
- Reason: 对齐图一 / 图二
- Impact: `CalendarView.tsx` 及样式；展开范围随视图切换（周 7 天 / 月网格）

**实例卡片与详情**
- From: 点任务直接进系列编辑表单
- To: 点展开实例先出只读详情弹层（标题、本地、状态、频率、预计时间、动作摘要）；「查看定时任务」再打开现有编辑器
- Reason: 对齐图三；区分「这一次」与「整个系列」
- Impact: 新详情组件；编辑器入口后移

**页头**
- From: 「定时任务」说明偏实现向
- To: 保留「定时任务」标题 + 更清晰副文案；「+ 新建」主按钮
- Reason: 有能力才展示；不做自动化多 Tab
- Impact: 文案与布局

**明确不做**
- 触发任务 / 模板 / 任务管理 Tab
- 「暂停此次」单次跳过（无 IPC）
- 调度器与任务模型字段变更

## Capabilities

### New Capabilities

- `schedule-week-month-ui`：周/月视图切换、周列卡片、月格短条、实例详情弹层与状态/频率展示

### Modified Capabilities

- （无 `openspec/specs/` 下已归档的 calendar-month-ui；既有行为在 change 目录 `schedule-calendar` 中描述。本 change 以新 capability 锁定展示契约，不强制修改未归档旧 delta。）

## Impact

- **renderer**：`CalendarView.tsx` 重构或拆分子组件；`calendarOccurrences` 可能扩展周范围辅助函数；样式
- **main / IPC**：无强制变更（复用 `scheduleTasksExpand` / list）
- **测试**：周范围计算、状态文案、频率人话、按日分组不回归
