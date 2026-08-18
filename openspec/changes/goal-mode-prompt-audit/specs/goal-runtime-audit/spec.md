## ADDED Requirements

### Requirement: 结构化 goal_context 注入
系统在 goal 模式下的每一次 LLM 调用（plan / act / verify）MUST 在系统消息中前置注入 `<goal_context>` 块，包含 objective、run_status、progress、budget、stagnant_rounds、blocked_rounds、fidelity、completion_audit、blocked_audit、work_from_evidence 十个字段。

#### Scenario: goal_context 必含字段
- **WHEN** goal 模式触发任意 LLM 调用
- **THEN** 系统 MUST 在该次调用的 SystemMessage 中包含 goal_context 块，且十个字段全部非空（除运行时确实为 0 的数字字段）

#### Scenario: goal 模式外不注入
- **WHEN** interactive 模式触发 LLM 调用
- **THEN** 系统 MUST NOT 注入 goal_context 块（避免污染交互式对话）

#### Scenario: goal 字符串含 XML 字符
- **WHEN** goal 字符串包含 `<`、`>`、`&`、`"` 等字符
- **THEN** 系统 MUST 转义后输出，避免解析错位

### Requirement: Blocked audit 阈值
系统 MUST 维护 `blockedRounds` 计数器。当 LLM 在 verify 阶段判定"同一阻塞条件重复"（`blocked.sameCondition === true`）时，`blockedRounds` 加 1；否则清零。当 `blockedRounds >= blockedAuditRounds`（默认 3）时，系统 MUST 触发 blocked 事件并强制暂停运行。

#### Scenario: 同条件连续 3 轮触发 blocked
- **WHEN** verify 在连续 3 轮均报告 `blocked.sameCondition === true`
- **THEN** 系统 MUST emit `{ type: 'blocked', rounds: 3, reason }` 事件 + 设置 `runStatus: 'idle'` + 持久化 checkpoint

#### Scenario: 任一轮恢复则重置
- **WHEN** verify 在任意一轮报告 `blocked.sameCondition === false`（或字段缺省）
- **THEN** 系统 MUST 将 `blockedRounds` 重置为 0

#### Scenario: 与 stagnantRounds 并存
- **WHEN** `stagnantRounds` 已达阈值但 `blockedRounds` 未达
- **THEN** 系统 MUST 触发的是 stagnation 暂停，不是 blocked

### Requirement: Completion audit 严格规则
verify LLM MUST 在宣称完成前完成 `<completion_audit>` 自检：派生具体需求、对每条需求给出可证证据（命令输出 / 文件内容 / 测试结果）。`isGoalComplete` MUST 要求 `auditCheck.eachSatisfied === true` 才返回 true。

#### Scenario: 清单完成但 audit 未通过
- **WHEN** checklist 全部 done 但 verify LLM 返回 `auditCheck.eachSatisfied === false`
- **THEN** `isGoalComplete` MUST 返回 false，并构造失败 feedback 告知"audit 未通过：列出未满足的需求"

#### Scenario: audit 通过 + 验收命令通过
- **WHEN** audit 通过 + verifyCommand 退出码 0 + checklist 全 done
- **THEN** `isGoalComplete` MUST 返回 true

#### Scenario: 不允许仅靠"清单 done"宣称完成
- **WHEN** LLM 输出缺少 `auditCheck` 字段
- **THEN** `isGoalComplete` MUST 视为 audit 未通过（防 LLM 跳过自检）

### Requirement: Token 用量主动报告
goal 模式在 `isGoalComplete === true` 完成时 MUST emit `{ type: 'goal_complete', goal, checklist, tokenUsed, rounds, durationMs }` 事件，renderer MUST 在收到后展示统计信息。

#### Scenario: 正常完成
- **WHEN** goal 通过 completion audit + 验收
- **THEN** 系统 MUST emit `goal_complete` 事件，tokenUsed 等于 run 期间累计值

#### Scenario: 中途取消 / 错误 / blocked
- **WHEN** goal 因 abort / error / blocked 终止
- **THEN** 系统 MUST NOT emit `goal_complete`（避免误报"完成"）

#### Scenario: UI 展示
- **WHEN** renderer 收到 `goal_complete` 事件
- **THEN** session header MUST 显示 tokenUsed、rounds、duration 统计

### Requirement: Fidelity 不偷工减料
plan / act / verify 节点的 LLM MUST 受 `<fidelity>` 段约束：plan steps 必须朝向最终状态、不允许用更窄/更安全/更小/更兼容/更易测的方案替换目标；act edits 仅当使最终状态更接近时才视为对齐。

#### Scenario: plan 阶段不能缩小范围
- **WHEN** goal 是大范围目标
- **THEN** plan prompt MUST 包含 "Plan steps that move toward the requested end state. Do not redefine success around easier steps."

#### Scenario: act 阶段不能假装完成
- **WHEN** act 节点输出
- **THEN** act prompt MUST 包含 "Make the requested final state more true. Useful-looking behavior that preserves a different end state is misaligned."

### Requirement: Work from evidence
所有 goal 模式 prompt MUST 包含 `<work_from_evidence>` 段，明确告知 LLM 用当前工作区作权威，inspect 后再行动。

#### Scenario: 告知工作目录
- **WHEN** goal_context 被注入
- **THEN** work_from_evidence 段 MUST 包含 `{cwd}` 当前工作目录路径

#### Scenario: 提示先用当前状态
- **WHEN** LLM 准备做改动
- **THEN** LLM SHOULD 先读当前文件 / 命令输出，再决策（由 prompt 约束）

### Requirement: blockedAuditRounds 设置项
`ModelSettings.blockedAuditRounds` MUST 可由用户在设置页配置，默认值为 3。范围 1–10，超出范围时 clamp 到边界。

#### Scenario: 设置项默认 3
- **WHEN** 用户首次安装且未配置
- **THEN** `blockedAuditRounds` MUST 默认为 3

#### Scenario: 范围校验
- **WHEN** 用户填入 0 或 100
- **THEN** 系统 MUST clamp 到 [1, 10] 范围

### Requirement: enableGoalCompleteReport 开关
`ModelSettings.enableGoalCompleteReport` MUST 可由用户在设置页配置，默认 on。关闭后 `goal_complete` 事件不再 emit 给 renderer（仅内部日志保留）。

#### Scenario: 开关为 on（默认）
- **WHEN** 默认设置
- **THEN** 系统 MUST emit goal_complete 给 renderer

#### Scenario: 开关为 off
- **WHEN** 用户关闭开关
- **THEN** 系统 MUST NOT emit goal_complete 给 renderer（仅写 run-log）


### Requirement: goal tools（get_goal / update_goal）
系统 MUST 向 goal 模式下的 LLM 暴露两个 LangChain Tool：`get_goal` 与 `update_goal`，严格对齐 Codex goal 工具的硬规则。

#### Scenario: get_goal 返回完整 snapshot
- **WHEN** LLM 调用 get_goal
- **THEN** 系统 MUST 返回 GoalSnapshot JSON（含 goal / checklist / runStatus / progress / budget / blockedRounds / blockedAuditRounds / paused / checkpoint）

#### Scenario: update_goal complete 受 audit gate 约束
- **WHEN** LLM 调用 update_goal({ status: "complete" }) 但 auditCheck.eachSatisfied !== true
- **THEN** 系统 MUST 拒绝（返回 ok=false + error），不更新 runStatus，不 emit goal_complete

#### Scenario: update_goal blocked 受阈值约束
- **WHEN** LLM 调用 update_goal({ status: "blocked" }) 但 blockedRounds < blockedAuditRounds
- **THEN** 系统 MUST 拒绝（返回 ok=false + error），不 emit blocked 事件

#### Scenario: update_goal schema 拒绝 pause/resume/budget-limit
- **WHEN** LLM 调用 update_goal 试图传 status="pause" | "resume" | "budget_limit"
- **THEN** zod schema MUST 拒绝（status 仅接受 "complete" | "blocked"）
