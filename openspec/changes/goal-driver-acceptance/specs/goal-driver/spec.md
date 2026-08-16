## ADDED Requirements

### Requirement: GoalDriver 拥有目标生命周期
目标模式下，系统 MUST 由 GoalDriver 拥有冻结的目标文本、步骤清单、可选 `verifyCommand`、验收执行、deliver、段式续跑、checkpoint 与 `runStatus`。LangGraph 工作图 MUST 只执行工作段（act/tools），MUST NOT 根据模型输出将步骤标为完成，MUST NOT 作为目标是否结束的判定来源。交互式模式 MUST NOT 走 GoalDriver。

#### Scenario: 工作图不能自证完成
- **WHEN** 工作段中的模型输出声称某清单项已完成
- **THEN** 系统 MUST NOT 仅凭该输出把该项 `done` 设为 true

#### Scenario: 交互式不受影响
- **WHEN** 会话模式为 interactive
- **THEN** 系统 MUST 保持现有单次/非 Driver 运行路径，MUST NOT 要求 `verifyCommand` 或完整结果标记

### Requirement: 用户原目标冻结
目标启动时，系统 MUST 把用户原话写入 `goal` 并冻结。后续 plan 或工作段 MUST NOT 改写该字段。plan MUST 只产出步骤清单（title 与可选 `check`），MUST NOT 把步骤当作另一条最终目标。

#### Scenario: plan 不能改写原目标
- **WHEN** 用户发送「帮我到同花顺总结周末新闻并给出明天推荐」且 plan 模型另写一条更长的 goal
- **THEN** 会话 `goal` MUST 仍等于用户原话

### Requirement: 步骤服务于最终目标
侧栏中来源为 checklist/`source=goal` 的项 MUST 显示为「步骤」，MUST NOT 显示为「目标」。步骤 MUST 为最终 `goal` 服务，MUST NOT 作为多个并列终点。

#### Scenario: 清单在侧栏是步骤
- **WHEN** plan 产出 7 条 checklist 并同步为 session tasks
- **THEN** UI MUST 将它们标为「步骤」而非「目标」

### Requirement: 可执行子项 check 与总验收
`GoalChecklistItem.check` 若存在，MUST 表示可执行的 shell 命令。会话 MUST 能持久化用户钉死的 `verifyCommand`；agent MUST NOT 修改该字段。Driver MUST 用进程退出码判定通过（0 为通过，其它为失败），并把 stdout/stderr 截断（至多约 8KB）写入 `evidence` 与 `lastExitCode`。

#### Scenario: 子项失败不勾完成
- **WHEN** 某项 `check` 退出码非 0
- **THEN** 该项 `done` MUST 为 false，且 `evidence` MUST 包含失败输出；系统 MUST NOT 因此进入 deliver

#### Scenario: 总验收失败不交付
- **WHEN** 带 `check` 的步骤均已通过，且 `verifyCommand` 退出码非 0
- **THEN** 系统 MUST NOT emit 完整结果，MUST NOT 将 `runStatus` 设为 completed，且下一段输入 MUST 包含总验收的失败输出

#### Scenario: 用户钉死的总验收不可被模型改写
- **WHEN** 工作段或 plan 的模型输出试图更改 `verifyCommand`
- **THEN** 系统 MUST 忽略该更改，磁盘上的 `verifyCommand` MUST 保持用户设定值

### Requirement: 失败封闭的完成与收口条件
系统 MUST 按以下规则判定，不得把模型声称当作完成：

1. 有 `check` 的步骤：`done === true` 当且仅当该项 `check` 退出码为 0。
2. 没有 `check` 的步骤 MUST NOT 被单独标为完成；它们 MUST 在 deliver 时把已有 evidence 纳入完整结果。
3. 清单为空且不存在 `verifyCommand` 时，Driver MUST 拒绝进入工作循环（`runStatus` 为 `idle`）。
4. 清单可以全无 `check`（纯报告）；系统 MUST 允许开工，收口走 deliver。
5. 进入 deliver 当且仅当：所有带 `check` 的步骤均已通过（若没有任何带 `check` 的步骤，则在至少一段工作之后），或用户从停滞暂停点继续并请求收口。
6. 若存在 `verifyCommand`，MUST 在 emit 完整结果之前通过；通过后才可 `completed`。
7. 若不存在 `verifyCommand`，emit 完整结果后 MUST `completed`。

v1 在 plan 成功之后 MUST 冻结步骤的 title 与 `check`；后续只允许 Driver 更新 `done` / `evidence` / `lastExitCode`。

#### Scenario: 无步骤且无总验收则拒绝开工
- **WHEN** 目标会话没有 `verifyCommand`，且 plan 结果清单为空
- **THEN** Driver MUST 不调用工作图，MUST 向用户报告需要步骤或总验收，且 `runStatus` MUST 为 `idle`

#### Scenario: 纯报告无 check 也可开工
- **WHEN** plan 得到非空清单，且每一项 `check` 均为空，且用户未设置 `verifyCommand`
- **THEN** Driver MUST 进入工作循环，MUST NOT 因缺 check 拒绝开工

#### Scenario: 仅总验收也可完成
- **WHEN** 清单为空且用户设置了 `verifyCommand`，该命令退出码为 0
- **THEN** 系统 MUST 进入 deliver 并在总验收通过后将目标标为完成

### Requirement: 完整结果交付
Driver 进入 deliver 时 MUST 对照冻结的 `goal` 与各步 evidence 汇总，MUST emit 一条 `type: 'result'` 事件（完整结果）。该消息 MUST 是 completed 前最后一条面向用户的助手类消息，UI MUST 标明「完整结果」，且 MUST 同时写入产物 tab 所用的 `resultContent`。过程中的普通 assistant 消息 MUST NOT 带该标记。

#### Scenario: 完整结果在会话最底且唯一带标记
- **WHEN** 步骤收口且（若有）总验收通过
- **THEN** 系统 MUST 恰好 emit 一条完整结果；其后 MUST NOT 再 emit 普通 assistant 进度或寒暄；该条 MUST 带「完整结果」标记

#### Scenario: 草稿不算交付
- **WHEN** 工作段输出一份总结草稿，但带 `check` 的步骤尚未全部通过
- **THEN** 该草稿 MUST NOT 带「完整结果」标记，产物 tab MUST NOT 把该草稿当作交付，`runStatus` MUST NOT 为 completed

### Requirement: 右侧产物栏
Renderer MUST 在现有会话侧栏增加「产物」tab。`resultContent` 非空时 MUST 在该 tab 展示完整结果正文；若 `resultReportPath` 非空 MUST 提供打开/在访达显示的入口。目标模式 `deliver` 发出 `result` 后，系统 MUST 展开侧栏并切换到产物 tab。产物 tab MUST NOT 与「文件」tab 混用（文件仍为工具读写记录）。交互式模式无完整结果时，产物 tab MUST 显示空状态。

#### Scenario: deliver 后产物可打开
- **WHEN** 目标会话完成 deliver 且 `resultContent` 已持久化
- **THEN** 侧栏产物 tab MUST 展示该正文；用户无需翻聊天记录即可看到交付物

#### Scenario: 有报告文件可揭示
- **WHEN** `resultReportPath` 指向已存在的报告文件
- **THEN** 产物 tab MUST 提供在访达中显示该文件的入口

#### Scenario: deliver 时自动切到产物
- **WHEN** 目标会话收到 `type: 'result'` 事件
- **THEN** 侧栏 MUST 展开（若已收起）并选中产物 tab

### Requirement: 报告类落盘
deliver 汇总时，系统 MUST 让模型判断本次交付是否为报告类。若是，MUST 将完整结果写入 `~/.shy/artifacts/reports/` 下的文件，MUST 把路径写入 `resultReportPath`，且完整结果消息 MUST 提供该入口。若否，`resultReportPath` MUST 为空。

#### Scenario: 新闻总结落盘报告
- **WHEN** deliver 判定交付为报告类（如周末新闻总结）
- **THEN** `resultReportPath` MUST 指向已存在的报告文件，且完整结果消息 MUST 包含该路径或打开入口

### Requirement: completed 后硬停
`runStatus` 变为 `completed` 之后，系统 MUST NOT 再调用工作图，MUST NOT 再跑验收回合，MUST NOT 自动续段。用户在同一会话再发送消息时，系统 MUST NOT 续跑同一张步骤清单，MUST 提示目标已完成。

#### Scenario: 完成后不再当对话续跑
- **WHEN** 完整结果已发出且 `runStatus=completed`
- **THEN** 系统 MUST NOT 再进入 act；MUST NOT 把后续空档解释为「用户说了谢谢」并回复

### Requirement: 运行时错误不进对话
工具失败、崩溃恢复提示、编码错误等运行时事件 MUST 只走 status 与 L2 日志。系统 MUST NOT 将它们 `appendMessage` 为 user 或 assistant 内容并因此再触发一轮 act。

#### Scenario: 崩溃提示不写入 session_messages
- **WHEN** 工作段因权限或解码错误中断
- **THEN** `session_messages` MUST NOT 新增一条把该错误当成用户/助手对话的记录来继续目标循环

### Requirement: 验收在工作段之后由运行时执行
每段工作图结束后，Driver MUST 先执行仍未通过且带 `check` 的子项。仅当这些子项全部通过后再执行 `verifyCommand`（若有）。验收 MUST 使用与 `shell_exec` 相同的本机 shell，默认超时 5 分钟。用户钉死的 `verifyCommand` MUST 在目标启动时确认一次后记入会话已批准列表。agent 新提出的 `check` MUST 在首次执行时走现有高危确认；用户拒绝 MUST 视为该项失败；通过后本会话内 MUST 静默重跑。超时、无法启动、非零退出均视为失败。

#### Scenario: 失败输出回灌下一段
- **WHEN** 一段结束后至少一项带 check 的验收失败且目标未暂停/取消
- **THEN** 下一段工作图的输入 MUST 包含失败项的 title、退出码与 evidence，并指示根据输出修改、不要修改验收命令本身

#### Scenario: 拒绝确认视为失败
- **WHEN** 用户拒绝某条 agent `check` 的高危确认
- **THEN** 该项 MUST 保持未完成，MUST NOT 写入已批准列表

### Requirement: 验收进展驱动停滞
停滞计数 MUST 在「本段没有任何带 check 的清单项新通过、且总验收未新通过」时递增；没有任何带 check 的项时，停滞 MUST 按「完整结果尚未交付」计。达到设置的 `stagnationRounds` 后 MUST 软暂停（`runStatus=paused`），MUST NOT 自动 deliver。本段若有工具活动但验收无新通过，停滞 MUST 仍递增。用户从该暂停点继续后，Driver MUST 进入 deliver（对照原目标汇总已有产物）。

#### Scenario: 空转改文件仍算停滞
- **WHEN** 一段内发生了有效工具调用，但没有任何 check 从失败变为通过，总验收也未通过，且尚未 deliver
- **THEN** 停滞计数 MUST 增加而非清零

#### Scenario: 停滞先暂停不自动交卷
- **WHEN** 停滞计数达到 `stagnationRounds`
- **THEN** `runStatus` MUST 为 `paused`，系统 MUST NOT emit 完整结果

### Requirement: runStatus 与开机续跑
会话 MUST 持久化 `runStatus`：`idle | running | paused | completed | cancelled`。目标开始干活时 MUST 为 `running`；用户暂停 MUST 为 `paused` 且落盘后再停循环；完成 MUST 为 `completed`；取消 MUST 为 `cancelled`。现有 `paused` 布尔 MUST 与 `runStatus === 'paused'` 一致。

应用在窗口与 IPC 可用之后，MUST 扫描 `mode === 'goal' && runStatus === 'running'` 的会话：只自动恢复 `updated_at` 最新的一条；其余 MUST 改为 `paused` 并记录因另有目标在跑而未自动续。`paused`/`completed`/`cancelled`/`idle` MUST NOT 被自动恢复。自动恢复 MUST 先执行一轮验收，再决定是否再打工作段或 deliver。

本 change 上线时的历史会话：`paused=1` 迁移为 `paused`，其余迁移为 `idle`，MUST NOT 把旧 checkpoint 当成 `running`。

#### Scenario: 崩溃后的 running 会续上
- **WHEN** 磁盘上存在 goal 会话 `runStatus=running`，且进程内没有对应活 runtime，应用完成启动扫描
- **THEN** 系统 MUST 自动恢复 `updated_at` 最新的那一条

#### Scenario: 用户暂停的不自动续
- **WHEN** 会话 `runStatus=paused`
- **THEN** 启动扫描 MUST NOT 自动 resume 该会话

#### Scenario: 多个 running 只续一条
- **WHEN** 启动扫描发现多于一条 `runStatus=running` 的目标会话
- **THEN** 系统 MUST 只 resume `updated_at` 最新的一条，并将其余改为 `paused`

### Requirement: 会话标题不含思维链
目标会话的标题 MUST 来自用户原话或已清洗的摘要。系统 MUST NOT 把模型输出的 `<think>…` 等内容写入会话标题。

#### Scenario: 标题不是 think 片段
- **WHEN** 标题生成模型返回以 `<think>` 开头的文本
- **THEN** 会话标题 MUST NOT 包含 `<think>` 标签或其未闭合片段
