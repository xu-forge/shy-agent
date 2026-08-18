# Proposal: goal-mode-prompt-audit

## Why

my-agent 的目标模式（goal mode）运行引擎已经成熟：`goal-driver` / `goal-policy` / LangGraph 编排 / 段式续跑 / 验收命令 / Token 预算 / 停滞检测 全部就位（见 `openspec/changes/goal-mode-runtime-budget`，14 项任务已完成）。

但 LLM 在 goal 模式下收到的**结构化约束不完整**——只有局部系统消息（plan / act / verify 各管一段），**没有一个统一的、结构化的、覆盖审计规则的 prompt context 块**。这导致以下三类问题：

1. **容易偷工减料**：LLM 在 verify 时容易用"我完成了"自证，`isGoalComplete` 只看清单 done 数，没要求"alignment to requested end state"。遇到范围大的目标，LLM 可能退到"局部完成"宣称整体完成。
2. **缺少 blocked 阈值**：当前 `stagnantRounds` 是**自动机器信号**（无 done + 无工具活动），但 Codex 那套 goal 系统里"blocked"是**人判断的语义**——同一阻塞条件连续 N 轮 + 推不动才标 blocked。两类信号应并存。
3. **token 用量只在内部累计**：complete 时不在 UI / event 流主动报告最终 tokenUsed，用户无法判断一次目标跑了多少成本。

参考来源：Codex goal system 的 `<codex_internal_context source="goal">` 注入 + completion / blocked audit 规则 + budget reporting。这些都是提示词层的硬约束，可以**叠加**在 my-agent 现有运行引擎之上。

## What Changes

**1. 结构化 `<goal_context>` prompt 块**
- From: plan / act / verify 各自局部系统消息，互不知全局状态。
- To: 新增 `buildGoalContext(state)` 函数，构造统一块（含 objective / run_status / progress / budget / stagnant_rounds / blocked_rounds / fidelity / completion_audit / blocked_audit / work_from_evidence 段落），在 plan / act / verify 系统消息**前置注入**。
- Reason: LLM 在每一节点都能看到全局护栏 + 审计规则，避免偷工减料与盲区。
- Impact: 非破坏；仅改系统消息内容。

**2. Blocked audit 阈值（人判断的 blocked）**
- From: 只有 `stagnantRounds`（机器信号）。
- To: 新增 `blockedAuditRounds` 设置（默认 3）+ `AgentState.blockedRounds` 字段。LLM 在 verify 时显式判定"是否在同条件重复且推不动"，是则 +1；达阈值 → emit `blocked` 事件 + 强制暂停等待用户介入。
- Reason: 区别于自动停滞，blocked 是"语义层确认无进展"，由 LLM 在 verify 阶段判定。
- Impact: 非破坏；goal mode 新增一个暂停原因。

**3. Completion audit 严格规则**
- From: `isGoalComplete` 只看 checklist 是否全 done + verifyCommand 是否过。
- To: verify prompt 加入 Codex 那 4 条规则（alignment / no narrower substitution / no mark-complete-on-budget-exhaust / verify each requirement has evidence），让 LLM 在宣称完成前**先按规则自检**。
- Reason: 防止"清单完成 = 目标完成"的逻辑捷径。
- Impact: 非破坏；verify prompt 内容扩展。

**4. Token 用量主动报告**
- From: `tokenUsed` 仅内部累计，complete 时不主动 emit。
- To: `goal-driver` 在 complete 分支 emit `{ type: 'goal_complete', tokenUsed, duration, rounds }`；renderer 在 session header / toast 显示。
- Reason: 用户无法判断一次目标的真实成本。
- Impact: 非破坏；新增一个事件类型。

**5. Fidelity / 不偷工减料（plan / act prompt）**
- From: act prompt 只有"完成一项后用文字说明可观察证据"。
- To: plan prompt 加入"Plan steps that move toward the requested end state. Do not redefine success around easier steps."；act prompt 加入"Make the requested final state more true. Useful-looking behavior that preserves a different end state is misaligned."
- Reason: prompt 层硬约束。
- Impact: 非破坏。

**6. Work from evidence（所有 prompt）**
- From: LLM 默认基于自己的"印象"。
- To: goal_context 块中加入 `Use current worktree and external state as authoritative. Inspect before relying.`，并在 act 系统消息中注入 `{cwd}` 让 LLM 知道工作目录。
- Reason: 防止 LLM 基于训练数据假设本机状态。
- Impact: 非破坏。

## Capabilities

### New Capabilities

- `goal-runtime-audit`: 目标模式的 prompt 层审计与结构化 context 注入（goal context 块、blocked audit、completion audit、fidelity、token 报告、work from evidence）。

### Modified Capabilities

- `goal-runtime`: 在已有 token 预算 + 工具级停滞 + 验收挂钩基础上，叠加 prompt 层审计规则与 blocked 阈值。

## Impact

- **shared**：
  - `src/shared/ipc.ts`（新增 `blockedAuditRounds` 设置项、`blocked` 事件类型、`goal_complete` 事件类型）
- **main**：
  - 新增 `src/main/agent/goal-context.ts`（context 块构造）
  - 新增 `src/main/agent/goal-context.test.ts`
  - 新增 `src/main/agent/blocked-audit.ts`（blocked 判定与阈值）
  - 新增 `src/main/agent/blocked-audit.test.ts`
  - 修改 `src/main/agent/graph.ts`（plan / act / verify 系统消息前置 goal context）
  - 修改 `src/main/agent/goal-driver.ts`（complete 分支 emit tokenUsed；blocked 暂停分支）
  - 修改 `src/main/settings/store.ts`（默认 `blockedAuditRounds = 3`）
- **renderer**：
  - `src/renderer/src/components/SettingsPanel.tsx`（新设置项）
  - `src/renderer/src/components/ChatWorkspace.tsx` 或新组件（complete 事件展示 tokenUsed）
- **测试**：
  - `goal-context.test.ts`（context 块随状态变化）
  - `blocked-audit.test.ts`（3 轮阈值 + 强制暂停）
  - `completion-audit.test.ts`（verify prompt 含规则）
  - 现有 `goal-driver.test.ts` / `goal-policy.test.ts` 不破坏

## Non-Goals（本 change 不做的事）

- **不**重写 goal-driver 主循环，仅在已有结构上叠加 prompt 层 + 新事件 + 工具注册。
- **不**改 token 预算阈值与验收命令执行机制。
- **不**做 progress visibility（用 Workflow 跟踪 goal 子步骤）——那是另一个独立功能（参考 `goal-runtime` 的 spec，checklist 已自带 progress）。
- **不**引入新的 IPC 通道，复用现有 `agentChat` / `agentCancel` / `agentEvent` 即可。

## 范围调整记录（v2）

应用户要求"整个功能跟 Codex 一致"，v2 撤回 v1 的以下决定：
- **补 `get_goal` / `update_goal` 工具**（v1 决定不补，v2 撤回）→ 用 LangChain `DynamicStructuredTool` 实现，由 goal-driver 显式注入到 LangGraph tools 数组；update_goal 严格按 Codex 硬规则（complete 仅当 auditCheck.eachSatisfied=true；blocked 仅当 blockedRounds>=blockedAuditRounds；不能 pause/resume/budget-limit）。

