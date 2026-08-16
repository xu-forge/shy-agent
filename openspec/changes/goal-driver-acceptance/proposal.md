## Why

目标模式把 plan 拆出的清单当成多个终点，过程中往对话里丢结果，清单没勾完就继续「聊」。会话 9388e328 在 15:44 已有总结，却因 7 条步骤未全勾又跑到 15:49，并把崩溃当成新对话。完成仍由干活的模型自证，撑不住无人值守。要把「一条用户目标 + 步骤服务于它 + 最后一份完整结果」收成运行时能力，并把中断的 running 在启动时接上。

## What Changes

**GoalDriver 拥有目标生命周期**
- From: `graph.ts` 的 `verifyNode` 让 LLM 更新清单并决定是否结束；`service.ts` 只做段循环。
- To: GoalDriver 冻结用户原话为 `goal`，负责 plan 步骤、跑可选 check、`deliver` 完整结果、写可选报告文件、预算/停滞、checkpoint、`runStatus`。LangGraph 只执行 `act → tools` 直到段结束。
- Reason: 完成对象是用户原目标，不是 7 条清单；验收必须独立于干活的模型。
- Impact: 仅目标模式；交互式模式不变。

**步骤服务于最终目标，收口才交付**
- From: checklist 项在侧栏标「目标」；每轮 verify 往对话刷进度；清单全勾才说「目标完成」。
- To: checklist 是步骤；过程草稿不算交付；步骤做完后发一条带「完整结果」标记的消息（会话最底），并写入右侧「产物」tab。模型判定为报告类则再写 `~/.shy/artifacts/reports/`。`completed` 后不再 act。
- Reason: 用户要的是最后一份收齐各步产物的结果，而不是自己翻中间消息。
- Impact: 完成语义破坏性变化。

**右侧产物栏**
- From: 侧栏只有任务 / 文件；完整结果埋在对话里。
- To: 现有 `SessionPanel` 增加「产物」tab，展示 `resultContent` 与可选 `resultReportPath`（打开/在访达显示）。deliver 时目标会话自动展开侧栏并切到产物。不做整页三栏重做。
- Reason: 对照 WorkBuddy：过程在中间，步骤进度与产物在右侧，关掉再打开也能找到交付物。
- Impact: renderer 侧栏；会话已有 result 字段即可驱动。

**可执行验收（可选步骤 check + 可选总命令）**
- From: `check` 为说明文字；无 check 的项也可被模型勾 done。
- To: 有 `check` 则以退出码判定该步；无 check 不单独完成、也不拒绝开工。用户钉死的 `verifyCommand` 必须过才允许打完整结果。agent 不能改总验收。
- Reason: 报告类任务往往没有 shell check；编码类仍要客观闸门。
- Impact: 相对本 change 第一稿：取消「每项必须有 check」。

**启动时自动续跑**
- From: checkpoint 可恢复，但必须用户点继续。
- To: `runStatus === 'running'` 的目标会话在窗口就绪后自动 `resumeAgent`；用户暂停的不续；多个 running 只续最近一条。
- Reason: 两三天长跑必须能挺过崩溃/强退。
- Impact: 主进程启动路径；会话表新增状态。

## Capabilities

### New Capabilities

- `goal-driver`：目标外循环、冻结原目标、步骤清单、可选可执行验收、deliver 完整结果与报告文件、右侧产物栏、失败回灌、开机续跑、runStatus。

### Modified Capabilities

- （无主库 `openspec/specs/` 可挂 delta。`goal-runtime` / `final-runtime` 的完成判定与 verify 路径由本 capability 取代，不另开 delta 文件。）

## Impact

- **shared**：`GoalChecklistItem`（`check` 语义、`lastExitCode`）、`verifyCommand`、`runStatus`、`resultContent` / `resultReportPath`、启动目标请求、可选消息 `kind: result`
- **main**：`GoalDriver`；`graph.ts` 去掉目标 verify；`service.ts` 目标循环交给 Driver；会话新列；启动扫描；标题去掉 `<think>`；错误不写入 `session_messages` 当成人话
- **renderer**：完整结果标记；侧栏「产物」tab；目标模式可填总验收命令；清单 chip「步骤」；展示 check/evidence
- **测试**：同花顺回归场景 + 验收闭环与开机续跑
