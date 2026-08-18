# Tasks: goal-mode-prompt-audit

> 实现前先 review `proposal.md` / `design.md` / `plan.md` / `specs/goal-runtime-audit/spec.md`，确认后再开始勾选。

## 1. 数据模型与设置

- [ ] 1.1 `src/shared/ipc.ts`：扩展 `ModelSettings.blockedAuditRounds?: number`、`enableGoalCompleteReport?: boolean`；新增 `AgentEvent` 类型 `'goal_complete'` 与 `'blocked'`
- [ ] 1.2 `src/main/settings/store.ts`：默认 `blockedAuditRounds = 3`、`enableGoalCompleteReport = true`
- [ ] 1.3 `src/main/agent/graph.ts`：`AgentState` 注解加 `blockedRounds: Annotation<number>`，初值 0

## 2. 结构化 goal_context 注入

- [ ] 2.1 新建 `src/main/agent/goal-context.ts`，导出 `buildGoalContext(state, settings, cwd): string`
- [ ] 2.2 实现 10 个字段（objective / run_status / progress / budget / stagnant_rounds / blocked_rounds / fidelity / completion_audit / blocked_audit / work_from_evidence）
- [ ] 2.3 XML 转义（`<` `>` `&` `"`）防 prompt 注入
- [ ] 2.4 `src/main/agent/goal-context.test.ts`：参数化覆盖
  - [ ] runStatus 各值（idle / running / blocked）
  - [ ] done/total 边界（0/0、0/3、3/3）
  - [ ] budget 计算（0 / 200000 / 400000 / disabled when 0）
  - [ ] stagnant 0 / 5 / 20
  - [ ] blocked 0 / 1 / 3 / 4
  - [ ] 含特殊字符的 goal
- [ ] 2.5 `src/main/agent/graph.ts`：planNode / actNode / verifyNode 系统消息**前置** goal_context
- [ ] 2.6 `graph.ts` 单测：mock LLM 调用 SystemMessage 数组第一项为 goal_context

## 3. Blocked audit

- [ ] 3.1 新建 `src/main/agent/blocked-audit.ts`，导出 `nextBlockedRounds(prev, verifyOutput, blockedAuditRounds): number`
- [ ] 3.2 verify JSON schema 加 `blocked?: { sameCondition: boolean; reason?: string }`
- [ ] 3.3 `verifyNode` 调用 `nextBlockedRounds`，写回 `state.blockedRounds`
- [ ] 3.4 `routeAfterVerify` 新分支：`blockedRounds >= blockedAuditRounds` → emit `{ type: 'blocked', rounds, reason }` + 强制 `runStatus: 'idle'` + 持久化 checkpoint
- [ ] 3.5 `src/main/agent/blocked-audit.test.ts`：
  - [ ] 同条件 3 轮 → blocked 触发
  - [ ] 同条件 2 轮 + 第 3 轮恢复 → blockedRounds = 0
  - [ ] `blocked.sameCondition` 缺省视为 false（不递增）
  - [ ] blocked 与 stagnant 并存（各自独立触发）

## 4. Completion audit

- [ ] 4.1 verify prompt 通过 goal_context 注入 completion_audit 段（2.5 已覆盖）
- [ ] 4.2 verify JSON schema 加 `auditCheck?: { requirements: string[]; eachSatisfied: boolean }`
- [ ] 4.3 `goal-policy.ts` 的 `isGoalComplete` 加前置 gate：`auditCheck.eachSatisfied === true`
- [ ] 4.4 否则 `buildFailureFeedback` 告知"audit 未通过：列出未满足的需求"
- [ ] 4.5 `src/main/agent/goal-policy.test.ts` 新增：
  - [ ] checklist 全 done 但 auditCheck=false → `isGoalComplete = false`
  - [ ] auditCheck 缺省视为 false
  - [ ] auditCheck=true + verifyCommand 通过 → `isGoalComplete = true`

## 5. Token 用量报告

- [ ] 5.1 `goal-driver.ts` complete 分支：构造 `durationMs`、`rounds` 合计
- [ ] 5.2 emit `{ type: 'goal_complete', goal, checklist, tokenUsed, rounds, durationMs }`
- [ ] 5.3 `src/main/agent/goal-driver.test.ts` 新增：mock 完成路径 → emit 含 tokenUsed
- [ ] 5.4 错误路径（abort / error / blocked）不 emit goal_complete
- [ ] 5.5 `src/renderer/src/components/ChatWorkspace.tsx` 监听 `goal_complete` → session header 展示统计
- [ ] 5.6 渲染层单测 / snapshot

## 6. UI 设置

- [ ] 6.1 `src/renderer/src/components/SettingsPanel.tsx`：新增 `blockedAuditRounds` 数字输入（默认 3，范围 1-10）
- [ ] 6.2 `src/renderer/src/components/SettingsPanel.tsx`：新增 `enableGoalCompleteReport` 开关（默认 on）
- [ ] 6.3 设置持久化（已有路径）

## 7. 校验

- [ ] 7.1 `npm run typecheck` 通过
- [ ] 7.2 `npm run lint` 通过
- [ ] 7.3 `npm test` 全部通过（不破坏现有 4495 行测试）
- [ ] 7.4 `npm run build` 通过

## 8. 文档与归档

- [ ] 8.1 `docs/product-brief.md` 加一节"目标模式 prompt 层审计"
- [ ] 8.2 `/opsx:archive`：写 `retrospective.md` + 归档到 `openspec/changes/archive/`

## 9. goal-tools（v2 完成）

- [x] 9.1 `src/main/agent/goal-tools.ts` 实现（159 行）
- [x] 9.2 `get_goal` 返回 GoalSnapshot
- [x] 9.3 `update_goal` schema + complete gate + blocked gate
- [x] 9.4 description 搬 Codex 原话
- [x] 9.5 `goal-driver.ts` 注入到 graph tools
- [x] 9.6 graph invoke 后同步 tokenUsed / blockedRounds

## 10. v2 单测

- [x] 10.1 `goal-context.test.ts`（121 行，6 个场景）
- [x] 10.2 `blocked-audit.test.ts`（89 行，15 个场景）
- [ ] 10.3 `goal-tools.test.ts`（v3）
- [ ] 10.4 verifyNode 接入（v3）

## 11. v2 artifacts 调整

- [x] 11.1 proposal.md Non-Goals 撤回 + 范围调整段
- [x] 11.2 design.md D6
- [x] 11.3 tasks.md v2 段
- [ ] 11.4 spec.md goal tools Requirement（v3）

## 顺序约束

- 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8（线性）
- 2 是其他模块的前置
- 4 依赖 2
- 3 依赖 2
- 5 依赖 4（completion audit 通过才 emit goal_complete）
