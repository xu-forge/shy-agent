# Design: schedule-calendar-ui

## Context

`CalendarView` 用 `buildGrid`（周日起始 42 格）+ `scheduleTasksExpand` 拉月范围 occurrences，点芯片即 `ScheduleEditor`。参考图要求周视图、周一起算月视图、实例详情 Modal。任务模型仍是 `ScheduleTask` + `ScheduleOccurrence`（`taskId` / `at` / `title` / `action`）。

## Goals / Non-Goals

**Goals:**

- 周 | 月切换，数据按可见范围 expand
- 周列：卡片展示时间、本地徽章、标题、状态
- 月格：紧凑 `HH:mm 标题` 条；今天高亮
- 点实例 → 只读详情；「查看定时任务」→ 现有编辑器
- 点空日 /「+ 新建」→ 现有新建表单
- 拖拽改系列落点行为可保留（月视图）

**Non-Goals:**

- 触发任务、模板、任务管理
- 单次暂停/跳过 IPC
- 改 cron 编译或 runner

## Decisions

### D1：视图状态

- **选择**：`viewMode: 'week' | 'month'`；`anchorDate`（周用当周某一天，月用年月）
- **理由**：切换时只改可见窗口与展示密度
- **已考虑 alternative**：仅 CSS 藏列 → 无法正确 expand 周范围

### D2：周范围与周起始

- **选择**：周一为一周之始（对齐参考图「周一…周日」）；月网格同步改为周一起算
- **理由**：与参考一致；与旧 `getDay()` 周日始网格不同，需改 `buildGrid` 并补测
- **已考虑 alternative**：保持周日始 → 与图不符

### D3：状态与「本地」

- **选择**：纯函数 `occurrenceStatus(occ, task, now)` → `pending | paused | past`；文案待执行 / 已暂停 / 已过期。徽章「本地」写死
- **理由**：无 run 历史
- **已考虑 alternative**：调 runner 查状态 → 超范围

### D4：频率人话

- **选择**：`formatScheduleLabel(schedule)` 从 frequency/time/weekdays/dayOfMonth 生成（如「每天 09:00」「每周一、三 09:00」）
- **理由**：详情图三需要
- **已考虑 alternative**：直接展示 cron → 不友好

### D5：详情弹层 vs 编辑器

- **选择**：点击 occurrence 打开详情 Modal；主按钮「查看定时任务」再 `openEdit(taskId)`。不展示「暂停此次」
- **理由**：无 skip API
- **已考虑 alternative**：继续点开即编辑 → 不符合图三

### D6：组件拆分

- **选择**：在 `calendar/` 或同目录拆：`ScheduleWeekView`、`ScheduleMonthView`、`ScheduleOccurrenceDetail`；`CalendarView` 作壳（工具栏 + 数据加载 + 编辑器）
- **理由**：CalendarView 已偏大
- **已考虑 alternative**：单文件继续堆 → 难维护

## Risks / Trade-offs

- [Risk] 周/月切换频繁 expand → Mitigation：沿用现有 IPC；范围变小时缓存可选后置
- [Risk] 周一始破坏旧拖拽心智 → Mitigation：单测覆盖网格；拖拽逻辑仍按落点 Date
- [Trade-off] 不做单次暂停 → 详情比参考少一按钮；接受

## Migration Plan

1. 抽纯函数（周范围、周一网格、状态、频率文案）+ 单测
2. 改 CalendarView 壳与样式
3. 详情 Modal
4. 目视周/月/详情对照参考图

Rollback：回退 renderer 即可，无 DB。

## Open Questions

- 无（暂停此次已明确不做）
