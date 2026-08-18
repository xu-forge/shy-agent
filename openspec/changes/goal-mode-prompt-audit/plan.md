# Plan: goal-mode-prompt-audit

## 1. 数据模型与设置

- [ ] 1.1 `src/shared/ipc.ts` 扩展 `ModelSettings.blockedAuditRounds?: number`（默认 3）；新增 `AgentEvent` 类型 `'goal_complete'` 与 `'blocked'`
- [ ] 1.2 `src/main/settings/store.ts` 默认 `blockedAuditRounds = 3`
- [ ] 1.3 `src/main/agent/graph.ts` 的 `AgentState` 注解加 `blockedRounds: Annotation<number>`，初值 0

## 2. 结构化 goal_context 注入

- [ ] 2.1 新建 `src/main/agent/goal-context.ts`，导出 `buildGoalContext(state, settings, cwd): string`
- [ ] 2.2 内容：objective / run_status / progress / budget / stagnant_rounds / blocked_rounds / fidelity / completion_audit / blocked_audit / work_from_evidence
- [ ] 2.3 转义 XML 字符防注入（goal 里可能有 `<`/`>`/`&`）
- [ ] 2.4 `src/main/agent/goal-context.test.ts`：参数化覆盖各字段（done/total、budget%、stagnant 0-N、blocked 0-N、各 runStatus）
- [ ] 2.5 `src/main/agent/graph.ts`：planNode / actNode / verifyNode 系统消息**前置** goal_context

## 3. Blocked audit

- [ ] 3.1 新建 `src/main/agent/blocked-audit.ts`，导出 `nextBlockedRounds(prev, verifyOutput, blockedAuditRounds): number`
- [ ] 3.2 `verify` JSON schema 加 `blocked?: { sameCondition: boolean; reason?: string }`
- [ ] 3.3 `verifyNode` 调用 `nextBlockedRounds` 写回 state.blockedRounds
- [ ] 3.4 `routeAfterVerify` 加分支：`blockedRounds >= blockedAuditRounds` → emit `{ type: 'blocked', rounds, reason }` + 强制 `runStatus: 'idle'` + 持久化
- [ ] 3.5 `src/main/agent/blocked-audit.test.ts`：3 轮阈值 + 强制暂停 + 重置条件

## 4. Completion audit

- [ ] 4.1 verify prompt 通过 goal_context 注入 completion_audit 段（已在 2.5 中覆盖）
- [ ] 4.2 verify JSON schema 加 `auditCheck?: { requirements: string[]; eachSatisfied: boolean }`
- [ ] 4.3 `goal-policy.ts` 的 `isGoalComplete` 加前置 gate：`auditCheck.eachSatisfied === true`
- [ ] 4.4 否则走 `buildFailureFeedback`，告知"audit 未通过：列出未满足的需求"
- [ ] 4.5 `src/main/agent/goal-policy.test.ts` 新增场景：checklist 全 done 但 auditCheck=false → `isGoalComplete = false`

## 5. Token 用量报告

- [ ] 5.1 `goal-driver.ts` complete 分支：构造 `durationMs`（startTs / endTs）+ `rounds` 合计
- [ ] 5.2 emit `{ type: 'goal_complete', goal, checklist, tokenUsed, rounds, durationMs }`
- [ ] 5.3 `src/main/agent/goal-driver.test.ts` 新增场景：mock complete → emit 含 tokenUsed
- [ ] 5.4 `src/renderer/src/components/ChatWorkspace.tsx` 监听 `goal_complete` → session header 展示统计
- [ ] 5.5 错误路径（abort / error / blocked）不 emit goal_complete；只有 `isGoalComplete = true` 才 emit

## 6. Fidelity / Work from evidence

- [ ] 6.1 在 `goal-context.ts` 的 fidelity / work_from_evidence 段已包含规则（2.1）
- [ ] 6.2 验证：plan / act prompt 含 fidelity（2.5 注入时已覆盖）
- [ ] 6.3 act prompt 含 `{cwd}`（graph.ts 已有 system 上下文，扩展注入）

## 7. UI 与测试

- [ ] 7.1 `src/renderer/src/components/SettingsPanel.tsx`：新增 `blockedAuditRounds` 输入（数字，默认 3）
- [ ] 7.2 `src/renderer/src/components/SettingsPanel.tsx`：新增 `enableGoalCompleteReport` 开关（默认 on）
- [ ] 7.3 `npm run typecheck` 通过
- [ ] 7.4 `npm run lint` 通过
- [ ] 7.5 `npm test` 全部通过（不破坏现有 4495 行测试）

## 8. 文档

- [ ] 8.1 `docs/product-brief.md` 加一节"目标模式 prompt 层审计"
- [ ] 8.2 OpenSpec change：`/opsx:archive` 完成后写入 retrospective

## 9. goal-tools（v2 追加：get_goal / update_goal 工具）

- [x] 9.1 `src/main/agent/goal-tools.ts`：DynamicStructuredTool 实现
- [x] 9.2 `get_goal`：返回 GoalSnapshot（goal / checklist / runStatus / progress / budget / blockedRounds / blockedAuditRounds / paused / checkpoint）
- [x] 9.3 `update_goal`：schema 强制 status="complete" | "blocked"；complete gate 要求 auditOkRef.current=true；blocked gate 要求 blockedRounds>=blockedAuditRounds
- [x] 9.4 工具 description 直接搬 Codex 原话硬规则
- [x] 9.5 `goal-driver.ts` defaultRunBurst：创建 auditOkRef / blockedRoundsRef / tokenUsedRef；构建 getSnapshot；注入 `buildGoalTools` 到 graph tools
- [x] 9.6 graph.invoke 后同步 tokenUsed / blockedRounds 到 ref

## 10. v2 单测（goal-context / blocked-audit / goal-tools）

- [x] 10.1 `goal-context.test.ts`：6 个场景（含 XML 转义 / progress 边界 / budget 计算 / blocked 阈值 / runStatus 透传）
- [x] 10.2 `blocked-audit.test.ts`：15 个场景（extract / nextBlockedRounds / isBlocked / clamp）
- [ ] 10.3 `goal-tools.test.ts`：mock session / emit，验证 complete gate / blocked gate 拒绝路径
- [ ] 10.4 verifyNode 真正接入 + auditOkRef 维护（v3）

## 11. v2 范围记录

- [x] 11.1 proposal.md：撤回 v1 Non-Goals 里"不补工具"；加 v2 调整记录段
- [x] 11.2 design.md：加 D6：goal tools 决策
- [x] 11.3 tasks.md：标 v2 已完成项
- [ ] 11.4 spec.md：加 Requirement：goal tools 章节（v3）

## 顺序约束

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8（线性）
- 2 是其他模块的前置（注入后才能用 audit 字段）
- 4 依赖 2（completion_audit 在 goal_context 块中）
- 3 依赖 2（blocked_audit 在 goal_context 块中）

## 回滚策略

- prompt 层叠加只改系统消息内容，回滚 = 删 goal_context 注入点
- 数据模型扩展（blockedRounds / blockedAuditRounds）兼容老 session（默认 0 / 3）
- 事件类型新增，向后兼容

## 工作量估算

- 代码 ~350 行（含测试）
- OpenSpec artifacts ~600 行（已完成大半）
- 合计 ~1000 行

