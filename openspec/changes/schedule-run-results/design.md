## Context

`schedule-calendar-ui` 已提供周/月视图与实例配置详情，但调度侧 `checkCalendarTasks` 对 `run_skill` 只打「预留」日志，无 `schedule_runs`、无会话，故无法展示执行结果。会话侧已有 `projectId`、`bindSessionProject`（须在首条用户消息前绑定）、目标模式 `result_content`，以及 `waitConfirm` 高危闸门——本 change 把调度接到这些现成能力上。

约束：高危默认需确认（product-brief）；规格中文；数据在 `~/.shy` SQLite。

## Goals / Non-Goals

**Goals:**

- 到点真正执行提醒或跑技能，并持久化每次 run
- 每次跑技能新建会话，按任务 `projectId` 绑定（可空 → 未选择项目）
- 日历按 run 展示状态；点开已执行实例看结果弹层并可继续对话
- 任务可配：目标/普通模式、是否自动确认高危、所属项目

**Non-Goals:**

- 单次跳过/暂停此次、改 cron 语义
- 触发任务 / 模板产品壳
- 多机或复杂并发配额 UI
- 把产品文案改回「交互模式」

## Decisions

### D1：`schedule_runs` + session 外键
- **选择**：独立 runs 表；`taskId + scheduledAt` 对齐 occurrence `at`；正文从 session / 提醒文案读，不强制双写全文
- **理由**：提醒可无 session；失败/等待确认可查；与「每次新会话」解耦
- **已考虑 alternative**：只挂会话元数据（提醒难表达）；expand 时拼状态（仍需持久化，耦合展示）

### D2：每次触发新建会话
- **选择**：`createSession` →（可选）`bindSessionProject` → `runAgent`
- **理由**：隔离清晰；「继续对话」直达该次；绑定 API 要求无用户消息，故 bind 必须在 append 前
- **已考虑 alternative**：同任务共用会话（历史缠在一起）

### D3：模式与文案
- **选择**：字段 `agentMode: 'goal' | 'normal'`，默认 `goal`；UI「目标模式 / 普通模式」；`normal` 映射现有 `interactive`
- **理由**：用户明确不要「交互模式」文案；默认同目标模式结果字段更好用
- **已考虑 alternative**：固定一种模式；建任务时不暴露

### D4：高危自动确认可选
- **选择**：`allowAutoConfirm` 默认 `false`；为 true 时 `waitConfirm` 直接 resolve true；否则现有 UI 确认，可标 `waiting_confirm`
- **理由**：过夜自动化与安全默认之间可配置
- **已考虑 alternative**：一律弹确认；一律跳过高危

### D5：项目归属
- **选择**：任务可选 `projectId`；空 = 未选择；项目已删则当次当 null，不阻断
- **理由**：与现有会话 `projectId` / 侧栏分组一致

### D6：UI 分流
- **选择**：有 run → 结果弹层；无 run → 现有配置详情；过去无 run →「未执行」而非「已过期」冒充完成
- **理由**：对齐参考图，避免假完成感

## Risks / Trade-offs

- [Risk] App 未开或缺 apiKey 导致漏跑 → Mitigation: run 标 `failed` 并写可读原因；不静默吞掉
- [Risk] `waiting_confirm` 无人理会 → Mitigation: 状态可见；超时策略实现时定上限并写入 error
- [Risk] 目标模式未产出 `result_content` → Mitigation: 回退最后一条助手/result 类消息；仍空则展示占位说明
- [Risk] `scheduledAt` 与 expand `at` 时区/精度不一致 → Mitigation: 统一 ISO 分钟戳，与现有 `minuteStamp` 对齐
- [Trade-off] 每次新会话可能增多侧栏条目 → 接受：可按项目归类；优于混在一条长会话

## Migration Plan

1. SQLite：`schedule_tasks` 加列（默认 goal / false / null）；建 `schedule_runs`
2. 发布 runner + IPC 后，旧任务无需手工迁移即可按默认策略跑
3. Rollback：停用真执行分支、只读忽略 runs 表即可回退展示（保留表无害）

验收：见 proposal 能力与 tasks；手动点已成功实例应对齐结果弹层关键信息。

## Open Questions

- `waiting_confirm` 超时多久标失败：实现时定（建议 15–30 分钟量级，可配置非必须）
- 普通模式「结果正文」精确选取规则（末条 assistant vs 含 tool 的折叠）：实现偏好末条非空 assistant，tasks 中写清
