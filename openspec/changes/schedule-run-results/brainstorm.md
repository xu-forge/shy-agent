<!--
Raw capture of superpowers:brainstorming output.
本檔原樣捕捉 brainstorming skill 的產出，不強制結構。
-->

# Brainstorm: schedule-run-results

## Background

日历点开定时实例目前只有「配置详情」（状态/频率/预计时间）。`run_skill` 在 runner 里仍是预留日志，无运行记录，故看不到图一那种「执行成功 + 起止/耗时 + 结果正文 + 继续对话」。

上一 change `schedule-calendar-ui` 明确不做运行历史与「执行成功」态。

## Decision chain

### Q1：范围
- **A（选定）**：端到端——到点真跑技能、落结果、日历点已执行实例出结果弹层（含继续对话）
- B：先只做 UI 壳
- C：先存结果，继续对话延后

### Q2：会话绑定
- **1（选定）**：每次到点新建一条会话；结果挂该会话；「继续对话」打开它
- 2：同一定时任务共用一条会话
- 3：不绑会话，只建运行记录表

### Q3：Agent 模式
- **可配置（选定）**：默认**目标模式**；另一选项文案为**普通模式**（不要叫「交互模式」）
- 对应实现：`agentMode: 'goal' | 'normal'`（`normal` = 现有 interactive）

### Q4：高危确认
- **C（选定）**：建任务时可开「允许自动确认高危」，**默认关**
- 未开则走现有确认；无人确认时可进 `waiting_confirm`

### Q5：提醒动作点击
- **B（选定）**：有发出记录 →「已提醒」+ 时间 + 文案；无记录 →「尚未触发」/ 配置摘要

### Q6：落地路径
- **方案 1（选定）**：`schedule_runs` 表 + `sessionId` 外键；日历用 `taskId + scheduledAt` 查 run
- 否决：只靠会话元数据；只扩展 expand 拼状态

### Q7：项目归属（设计审批中补充）
- 建/编辑定时任务可选 `projectId`；空 =「未选择项目」
- 跑技能建会话后、写首条用户消息前，调用现有 `bindSessionProject`（会话字段即 `projectId`）
- 项目已删：当次按未选项目，不阻断

## Agreed design summary

- 任务字段：`agentMode`（默认 goal）、`allowAutoConfirm`（默认 false）、`projectId?`
- 新表 `schedule_runs`：taskId、scheduledAt、sessionId?、action、status、startedAt、endedAt?、errorMessage?
- 正文从 session（goal `result_content` / 普通模式末条助手消息）或提醒文案读取
- 日历状态：有 run → 执行中/成功/失败/等待确认；无 run → 待执行/已暂停/未执行
- 点击：有 run → 结果弹层；无 run → 配置详情
- 脚部：继续对话（有 sessionId）+ 查看定时任务

## Out of scope

- 单次跳过/暂停此次
- 改 cron 语义、多机、并发配额产品化
- 触发任务 / 模板 Tab
- 把「普通模式」产品文案改回「交互模式」
