# Proposal: goal-driver-acceptance

## Why

目标模式已经能段式续跑，但「完成」仍由执行任务的同一模型自证，无法支撑两三天的无人值守。崩溃后必须手动继续。需要把验收收成运行时能力，并把中断的 `running` 会话在应用启动时接上。

## What Changes

**GoalDriver 拥有目标生命周期**
- From: `graph.ts` 的 `verifyNode` 让 LLM 更新清单并决定是否结束；`service.ts` 只做段循环。
- To: 新模块 GoalDriver 负责 plan、跑验收、写 `done`、回灌失败、预算/停滞、checkpoint、`runStatus`。LangGraph 只执行 `act → tools` 直到 `segmentSteps`。
- Reason: 验收必须独立于干活的模型，否则长任务会自我开脱。
- Impact: 仅目标模式；交互式模式不变。

**可执行验收（总命令 + 子项 check）**
- From: `GoalChecklistItem.check` 为说明文字，不执行。
- To: `check` 为 shell 命令；会话级 `verifyCommand` 由用户钉死、agent 不能改。退出码决定通过与否；失败输出截断写入 `evidence` 并注入下一段。
- Reason: 领域无关的客观判定。
- Impact: 清单完成语义破坏性变化（不再接受模型勾选）。

**启动时自动续跑**
- From: checkpoint 可恢复，但必须用户点继续。
- To: `runStatus === 'running'` 的目标会话在 `app.whenReady` 后自动 `resumeAgent`；用户暂停的不续；多个 running 只续最近一条。
- Reason: 两三天长跑必须能挺过崩溃/强退。
- Impact: 主进程启动路径；会话表新增状态。

## Capabilities

### New Capabilities

- `goal-driver`：目标外循环、可执行验收、失败回灌、开机续跑、runStatus。

### Modified Capabilities

- `goal-runtime`：清单 `check` 从透传说明改为运行时执行；`verifyNode` 不再是完成判定来源。
- `final-runtime`：目标模式的 verify 路径改为 Driver；工作图不再路由到 verify。

## Impact

- **shared**：`GoalChecklistItem`（`check` 语义、`lastExitCode`）、`verifyCommand`、`runStatus`、启动目标请求
- **main**：`GoalDriver` 新模块；`graph.ts` 去掉目标 verify；`service.ts` 把目标循环交给 Driver；`sessions/store.ts` 新列；`index.ts` 启动扫描
- **renderer**：目标模式可填总验收命令；清单展示 check/evidence；状态区分 running/paused
- **测试**：验收闭环与开机续跑（见 spec 场景）
