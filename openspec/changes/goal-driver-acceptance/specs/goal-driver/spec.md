## ADDED Requirements

### Requirement: GoalDriver 拥有目标生命周期
目标模式下，系统 MUST 由 GoalDriver 拥有目标文本、清单、`verifyCommand`、验收执行、段式续跑、checkpoint 与 `runStatus`。LangGraph 工作图 MUST 只执行工作段（act/tools），MUST NOT 根据模型输出将清单项标为完成，MUST NOT 作为目标是否结束的判定来源。交互式模式 MUST NOT 走 GoalDriver。

#### Scenario: 工作图不能自证完成
- **WHEN** 工作段中的模型输出声称某清单项已完成
- **THEN** 系统 MUST NOT 仅凭该输出把该项 `done` 设为 true

#### Scenario: 交互式不受影响
- **WHEN** 会话模式为 interactive
- **THEN** 系统 MUST 保持现有单次/非 Driver 运行路径，MUST NOT 要求 `verifyCommand` 或子项 check

### Requirement: 可执行子项 check 与总验收
`GoalChecklistItem.check` MUST 表示可执行的 shell 命令（不是说明文字）。会话 MUST 能持久化用户钉死的 `verifyCommand`；agent MUST NOT 修改该字段。Driver MUST 用进程退出码判定通过（0 为通过，其它为失败），并把 stdout/stderr 截断（不少于失败判定所需、至多约 8KB）写入 `evidence` 与 `lastExitCode`。

#### Scenario: 子项失败不勾完成
- **WHEN** 某项 `check` 退出码非 0
- **THEN** 该项 `done` MUST 为 false，且 `evidence` MUST 包含失败输出；目标 MUST NOT 因此被标为完成

#### Scenario: 总验收失败不结束
- **WHEN** 所有带 `check` 的子项均已通过，且 `verifyCommand` 退出码非 0
- **THEN** 目标 MUST 保持未完成，且下一段输入 MUST 包含总验收的失败输出

#### Scenario: 用户钉死的总验收不可被模型改写
- **WHEN** 工作段或 plan 的模型输出试图更改 `verifyCommand`
- **THEN** 系统 MUST 忽略该更改，磁盘上的 `verifyCommand` MUST 保持用户设定值

### Requirement: 失败封闭的完成条件
系统 MUST 按以下规则判定完成，不得把模型声称当作完成：

1. 子项完成当且仅当其 `check` 退出码为 0。
2. 没有 `check` 的子项 MUST NOT 被标为完成。
3. 清单非空时，plan 之后每一项 MUST 带有非空 `check`；若仍有缺项，Driver MUST 视为 plan 失败并拒绝进入工作循环（`runStatus` 为 `idle`）。
4. 目标完成当且仅当下列之一：
   - 清单为空，且 `verifyCommand` 退出码为 0；
   - 清单非空，每一项均通过，且若存在 `verifyCommand` 则其退出码为 0。
5. 清单为空且不存在 `verifyCommand` 时，Driver MUST 拒绝进入工作循环（`runStatus` 为 `idle`）。

v1 在 plan 成功之后 MUST 冻结清单的 title 与 `check`；后续只允许 Driver 更新 `done` / `evidence` / `lastExitCode`。

#### Scenario: 无检查则拒绝开工
- **WHEN** 目标会话没有 `verifyCommand`，且 plan 结果中没有任何子项带 `check`
- **THEN** Driver MUST 不调用工作图，MUST 向用户报告需要补验收命令，且 `runStatus` MUST 为 `idle`

#### Scenario: 清单有缺 check 的项则拒绝开工
- **WHEN** plan 得到非空清单，且其中至少一项 `check` 为空
- **THEN** Driver MUST 不调用工作图，`runStatus` MUST 为 `idle`

#### Scenario: 仅总验收也可完成
- **WHEN** 清单为空且用户设置了 `verifyCommand`，该命令退出码为 0
- **THEN** 系统 MUST 将目标标为完成

### Requirement: 验收在工作段之后由运行时执行
每段工作图结束后，Driver MUST 先执行仍未通过的子项 `check`，仅当这些子项全部通过后再执行 `verifyCommand`（若有）。验收 MUST 使用与 `shell_exec` 相同的本机 shell，默认超时 5 分钟。用户钉死的 `verifyCommand` MUST 在目标启动时确认一次后记入会话已批准列表。agent 新提出的 `check` MUST 在首次执行时走现有高危确认；用户拒绝 MUST 视为该项失败；通过后本会话内 MUST 静默重跑。超时、无法启动、非零退出均视为失败。

#### Scenario: 失败输出回灌下一段
- **WHEN** 一段结束后至少一项验收失败且目标未暂停/取消
- **THEN** 下一段工作图的输入 MUST 包含失败项的 title、退出码与 evidence，并指示根据输出修改、不要修改验收命令本身

#### Scenario: 拒绝确认视为失败
- **WHEN** 用户拒绝某条 agent `check` 的高危确认
- **THEN** 该项 MUST 保持未完成，MUST NOT 写入已批准列表

### Requirement: 验收进展驱动停滞
停滞计数 MUST 在「本段没有任何清单项新通过、且总验收未新通过」时递增，达到设置的 `stagnationRounds` 后软暂停（`runStatus=paused`）。本段若有工具活动但验收无新通过，停滞 MUST 仍递增。

#### Scenario: 空转改文件仍算停滞
- **WHEN** 一段内发生了有效工具调用，但没有任何 check 从失败变为通过，总验收也未通过
- **THEN** 停滞计数 MUST 增加而非清零

### Requirement: runStatus 与开机续跑
会话 MUST 持久化 `runStatus`：`idle | running | paused | completed | cancelled`。目标开始干活时 MUST 为 `running`；用户暂停 MUST 为 `paused` 且落盘后再停循环；完成 MUST 为 `completed`；取消 MUST 为 `cancelled`。现有 `paused` 布尔 MUST 与 `runStatus === 'paused'` 一致。

应用在 `whenReady` 且 IPC 可用之后，MUST 扫描 `mode === 'goal' && runStatus === 'running'` 的会话：只自动恢复 `updated_at` 最新的一条；其余 MUST 改为 `paused` 并记录因另有目标在跑而未自动续。`paused`/`completed`/`cancelled`/`idle` MUST NOT 被自动恢复。自动恢复 MUST 先执行一轮验收，再决定是否再打工作段。

本 change 上线时的历史会话：`paused=1` 迁移为 `paused`，其余迁移为 `idle`，MUST NOT 把旧 checkpoint 当成 `running`。

#### Scenario: 崩溃后的 running 会续上
- **WHEN** 磁盘上存在 goal 会话 `runStatus=running`，且进程内没有对应活 runtime，应用完成启动扫描
- **THEN** 系统 MUST 自动对该会话走恢复路径

#### Scenario: 用户暂停的不自动续
- **WHEN** 会话 `runStatus=paused`
- **THEN** 启动扫描 MUST NOT 自动调用恢复

#### Scenario: 多个 running 只续一条
- **WHEN** 启动时有两条以上 `runStatus=running` 的目标会话
- **THEN** 系统 MUST 只自动恢复 `updated_at` 最新的一条，并将其余改为 `paused`
