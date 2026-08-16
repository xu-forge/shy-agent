## 1. 类型与会话持久化

- [x] 1.1 `RunStatus`、`lastExitCode`、`verifyCommand`、`resultContent` / `resultReportPath`、`ChatRequest.verifyCommand`、消息/事件 `result`
- [x] 1.2 sessions 表新列 + 历史迁移（paused=1→paused，其余 idle）
- [x] 1.3 `updateSessionRuntime` 写入 verifyCommand / runStatus / approvedChecks / result 字段

## 2. 验收命令执行器

- [x] 2.1 `runCheckCommand`：退出码、超时 5min、截断 8KB、拒绝确认=失败
- [x] 2.2 钉死命令首次确认后记入 approved；agent check 同理
- [x] 2.3 单测（inject exec / confirm）

## 3. GoalDriver 纯逻辑

- [x] 3.1 `freezeGoal`：用户原话写入 goal，plan 不得覆盖
- [x] 3.2 `assertCanStart`：仅「空清单且无 verifyCommand」拒绝开工；允许全无 check
- [x] 3.3 `applyCheckResults` / `shouldDeliver` / `buildFailureFeedback`
- [x] 3.4 `selectAutoResume`：只续最新 running，其余 pause
- [x] 3.5 停滞：验收无新通过则递增；达阈值只 paused，不自动 deliver
- [x] 3.6 单测覆盖 spec 可纯函数化的场景

## 4. 工作图收瘦

- [x] 4.1 目标模式去掉 verify 完成判定；无 tool_calls 或达到 segmentSteps 则 END
- [x] 4.2 plan 从目标图中移除（改由 Driver 调 LLM，且不得改写 goal）
- [x] 4.3 图 MUST NOT 把模型声称写成 done；MUST NOT 把运行时错误当成人话 emit assistant

## 5. Driver 循环与 deliver

- [x] 5.1 `runGoalDriver`：冻结 goal → plan 步骤 → 工作段 → 验收 → 回灌 / 暂停
- [x] 5.2 `deliver`：对照 goal+evidence 汇总；有 verifyCommand 则先跑；emit `result`；报告类写文件
- [x] 5.3 `service.ts` 目标模式走 Driver；交互式保持原路径
- [x] 5.4 暂停落盘 `paused`；取消 `cancelled`；`completed` 后不再 act
- [x] 5.5 单测：同花顺回归（草稿非 result、完成后无寒暄、错误不进 messages）

## 6. 开机续跑与 UI

- [x] 6.1 `resumeInterruptedGoals` + 窗口就绪后调用
- [x] 6.2 续跑先验收再决定工作段或 deliver
- [x] 6.3 目标模式可填 `verifyCommand`；清单 chip「步骤」；展示 check/evidence；对话完整结果标记
- [x] 6.4 侧栏增加「产物」tab：展示 resultContent / 报告入口；deliver 时展开并切到产物
- [x] 6.5 标题生成去掉 `<think>`；completed 后再发送提示已完成

## 7. 验收

- [x] 7.1 `npm test && npm run typecheck`
- [x] 7.2 对照 spec 场景走查
