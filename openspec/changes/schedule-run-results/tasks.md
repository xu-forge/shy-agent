## 1. 数据模型与 IPC

- [x] 1.1 `ScheduleTask` / create/update 类型增加 `agentMode`、`allowAutoConfirm`、`projectId`；store 迁移加列与默认值
- [x] 1.2 新建 `schedule_runs` 表与 CRUD（create/update/getByTaskAt/listInRange）+ 单测
- [x] 1.3 暴露查询 run 的 IPC + preload 类型（按 taskId+at；可选按范围批量）

## 2. 调度真执行

- [x] 2.1 `dispatchTask`：remind 写 succeeded run；失败写 failed
- [x] 2.2 `run_skill`：createSession → bindProject（消息前）→ runAgent；映射 goal/normal；注入技能触发提示
- [x] 2.3 `allowAutoConfirm` 包装 `waitConfirm`；未确认时 run=`waiting_confirm`；超时（建议 30 分钟）→ failed
- [x] 2.4 缺 apiKey / 技能缺失 / 抛错 → failed + errorMessage；同分钟防重保留
- [x] 2.5 runner 单测（mock session/agent/confirm）

## 3. 编辑表单

- [x] 3.1 `ScheduleEditor`：模式（目标/普通）、允许自动确认高危、项目下拉（含未选择项目）
- [x] 3.2 create/update 传新字段；编辑回显

## 4. 日历状态与结果 UI

- [x] 4.1 `occurrenceStatus` 扩展接入 run（成功/失败/执行中/等待确认/未执行）+ 单测
- [x] 4.2 CalendarView 加载可见范围 runs 并传给周/月视图
- [x] 4.3 有 run → 结果弹层（时间/耗时/正文/继续对话/查看定时任务）；无 run → 现有配置详情
- [x] 4.4 「继续对话」导航到 `sessionId`（复用 App 打开会话路径）

## 5. 验收

- [x] 5.1 typecheck + 相关单测
- [ ] 5.2 手动：到点或触发后点实例见结果；会话在正确项目/未选择项目下
