## 1. 类型与会话持久化

- [ ] 1.1 `RunStatus`、`GoalChecklistItem.lastExitCode`、`ChatRequest.verifyCommand`、会话字段
- [ ] 1.2 sessions 表新列 + 历史迁移（paused=1→paused，其余 idle）
- [ ] 1.3 `updateSessionRuntime` 写入 verifyCommand / runStatus / approvedChecks

## 2. 验收命令执行器

- [ ] 2.1 `runCheckCommand`：退出码、超时 5min、截断 8KB、拒绝确认=失败
- [ ] 2.2 钉死命令首次确认后记入 approved；agent check 同理
- [ ] 2.3 单测（inject exec / confirm）

## 3. GoalDriver 纯逻辑

- [ ] 3.1 `assertCanStart`：无检查拒绝开工；清单项缺 check 拒绝
- [ ] 3.2 `applyCheckResults` / `isGoalComplete` / `buildFailureFeedback`
- [ ] 3.3 `selectAutoResume`：只续最新 running，其余 pause
- [ ] 3.4 停滞：验收无新通过则递增（有工具活动也算）
- [ ] 3.5 单测覆盖 spec 场景 1–6 中可纯函数化的部分

## 4. 工作图收瘦

- [ ] 4.1 目标模式去掉 verify 完成判定；无 tool_calls 或达到 segmentSteps 则 END
- [ ] 4.2 plan 从目标图中移除（改由 Driver 调 LLM）
- [ ] 4.3 图 MUST NOT 把模型声称写成 done

## 5. Driver 循环接线

- [ ] 5.1 `runGoalDriver`：plan → 工作段 → 验收 → 回灌 / 完成 / 暂停
- [ ] 5.2 `service.ts` 目标模式走 Driver；交互式保持原路径
- [ ] 5.3 暂停落盘 `paused`；取消 `cancelled`

## 6. 开机续跑与 UI

- [ ] 6.1 `resumeInterruptedGoals` + `app.whenReady` 调用
- [ ] 6.2 续跑先验收再决定是否再打段
- [ ] 6.3 目标模式输入框可填 `verifyCommand`；清单展示 check/evidence
- [ ] 6.4 ChatRequest 带上 verifyCommand

## 7. 验收

- [ ] 7.1 `npm test && npm run typecheck`
- [ ] 7.2 对照 spec 场景走查
