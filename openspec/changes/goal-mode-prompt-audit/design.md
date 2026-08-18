# Design: goal-mode-prompt-audit

## Context

`goal-mode-runtime-budget` 已经把目标模式从"无成本护栏 / 粗停滞 / LLM 自证"升级为"token 预算 + 工具级停滞 + 验收挂钩"。运行引擎（LangGraph + 段式续跑 + checkpoint）已稳定。但 prompt 层只有局部系统消息，**没有一个统一的、覆盖审计规则的 context 块**。

本 change 不动运行引擎，**只在 prompt 层叠加审计约束 + 新增一个 blocked 信号通道 + complete 事件报告 token**。所有改动都向后兼容。

## Goals / Non-Goals

**Goals：**
- 在 plan / act / verify 节点前置注入结构化 `<goal_context>` 块
- 引入"人判断的 blocked"（区别于机器的 stagnant），达阈值强制暂停
- verify prompt 加 completion audit 严格规则
- complete 事件携带 tokenUsed / duration / rounds
- plan / act 加 fidelity 不偷工减料规则
- 所有 prompt 加 work-from-evidence 提示

**Non-Goals：**
- 不动 LangGraph state schema 的核心字段（仅追加 `blockedRounds`）
- 不重写 goal-driver 主循环
- 不新增 get_goal / update_goal 工具（架构差异）
- 不动 token 预算与验收命令机制

## Decisions

### D1：`buildGoalContext(state)` 纯函数 + 单点注入

- 位置：`src/main/agent/goal-context.ts`，导出 `buildGoalContext(state: AgentState, settings: ModelSettings): string`
- 输出格式（伪 XML + 转义后的字符串，**实际是 markdown 文本**，便于 LLM 解析）：
  ```
  <goal_context source="goal">
    <objective>{escape(goal)}</objective>
    <run_status>{runStatus}</run_status>
    <progress>{done}/{total} done</progress>
    <budget>{tokenUsed} / {tokenBudget} tokens ({pct}%)</budget>
    <stagnant_rounds>{n}</stagnant_rounds>
    <blocked_rounds>{n}/{blockedAuditRounds}</blocked_rounds>

    <fidelity>
    - Optimize each turn for movement toward the requested end state.
    - Do not substitute a narrower, safer, smaller, merely compatible, or easier-to-test solution.
    - An edit is aligned only if it makes the requested final state more true; useful-looking behavior that preserves a different end state is misaligned.
    </fidelity>

    <completion_audit>
    Treat completion as unproven. Verify each requirement has satisfied evidence:
    - Derive concrete requirements from the objective.
    - For each requirement, identify authoritative evidence (command output / file content / test result).
    - Do not mark complete merely because checklist is done.
    - Do not mark complete because budget is exhausted or work is stopping.
    </completion_audit>

    <blocked_audit>
    If the same blocking condition repeats:
    - Same verify failure reason + same checklist item stuck + same root cause → blockedRounds + 1
    - When blockedRounds >= blockedAuditRounds → pause and report reason
    </blocked_audit>

    <work_from_evidence>
    Use current worktree ({cwd}) and external state as authoritative. Inspect before relying.
    </work_from_evidence>
  </goal_context>
  ```
- 注入点：`graph.ts` 的 `planNode` / `actNode` / verifyNode 系统消息**前置**拼接（`[GOAL_CONTEXT, SYSTEM]` 两段式）
- 单测：参数化覆盖所有字段（runStatus / progress / budget / stagnant / blocked 各种组合）

### D2：Blocked audit = LLM 在 verify 阶段显式判定

- 新增 `AgentState.blockedRounds: number`（默认 0）
- 新增 `ModelSettings.blockedAuditRounds: number`（默认 3）
- verify LLM 输出 JSON 增加字段 `blocked: { sameCondition: bool, reason: string }`：
  - `sameCondition: true` → `blockedRounds += 1`
  - 否则 → `blockedRounds = 0`
- 路由判断：`routeAfterVerify` 增加 `blockedRounds >= blockedAuditRounds` → emit `blocked` 事件 + 强制 `runStatus: 'idle'` + 持久化 checkpoint
- 区别于 `stagnantRounds`：
  - `stagnantRounds` = 机器自动信号（无 done + 无工具活动）
  - `blockedRounds` = LLM 语义判定（同条件重复）
  - 两者并存，可独立触发暂停

### D3：Completion audit 在 verify prompt 内化

- verify prompt 注入 goal_context 块的 `<completion_audit>` 段
- verify LLM 输出 JSON 增加 `auditCheck: { requirements: string[], eachSatisfied: bool }`
- `isGoalComplete` 增加前置 gate：LLM 必须 `eachSatisfied: true` 才视为达标（否则即使 checklist done 也返回 `false`，触发 `buildFailureFeedback`）
- 单测：mock verify 返回 `eachSatisfied: false` → `isGoalComplete = false`

### D4：Token 用量事件

- `goal-driver` complete 分支：
  ```
  emit({
    type: 'goal_complete',
    goal,
    checklist,
    tokenUsed: <累计值>,
    rounds: <总轮数>,
    durationMs: <起止时间戳差>
  })
  ```
- 新增 `AgentEvent` 类型 `goal_complete`
- renderer 在收到事件后：session header 显示"✓ 完成 · {tokenUsed} tokens · {rounds} 轮 · {duration}分钟"

### D6：get_goal / update_goal 工具（对齐 Codex）

- 位置：`src/main/agent/goal-tools.ts`，导出 `buildGoalTools(deps): DynamicStructuredTool[]`（两个工具的工厂）
- **不**自动注册到 `tools/registry.ts`；由 `goal-driver.defaultRunBurst` 显式合并到 `buildAgentGraph` 的 tools 数组（避免污染 interactive 模式）
- **get_goal**：返回 `GoalSnapshot`（goal / checklist / runStatus / progress / budget / blockedRounds / blockedAuditRounds / paused / checkpoint），与 Codex 的 `get_goal` 工具语义一致
- **update_goal** 严格对齐 Codex 硬规则：
  - `status="complete"` only when objective 真正达成 + auditCheck.eachSatisfied === true（auditOkRef 由 verifyNode 维护）
  - `status="blocked"` only when blockedRounds >= blockedAuditRounds
  - 不能 pause / resume / budget-limit（schema 强制拒绝）
  - 带预算的目标 complete 时报告 tokensUsed
- 工具 description 文字**直接搬 Codex 原话**（"Do not mark complete merely because the checklist is done..."）
- 单测：mock getSession / emit，验证 complete gate / blocked gate 拒绝路径

### D5：Fidelity / Work from evidence 注入位置

- plan / act / verify 节点系统消息**全部**前置 goal_context（其中含 fidelity / completion_audit / blocked_audit / work_from_evidence 段）
- 不在 plan / act / verify 各自重复写规则，避免 drift
- 规则变更时只改 `goal-context.ts` 一个文件

## Risks / Trade-offs

- [Risk] prompt 长度膨胀 → Mitigation: `<goal_context>` 块静态结构 ~500 tokens，可控；不会进入短期记忆压缩范围。
- [Risk] blocked audit 误触发（LLM 偶发判 sameCondition）→ Mitigation: blockedRounds 单独计数，不会立即暂停；3 轮阈值给 LLM 多次确认机会。
- [Risk] verify prompt 加 audit 后单轮 token 增加 → Mitigation: 已有 token 预算护栏；超额自动暂停。
- [Risk] completion audit 过度严格导致合法目标被判未完成 → Mitigation: LLM 自评 + 失败时给清晰 feedback；用户可手动续跑。
- [Risk] 与 Codex 严格对齐会让 prompt 变"机械" → Mitigation: 保留 goal mode 原有 prompt 的人文措辞，只在前面叠 audit 块。

## Migration Plan

- 数据模型扩展：`blockedRounds` 字段（AgentState 注解，加默认 0）+ `blockedAuditRounds` 设置项（默认 3）
- 老 session 读盘时缺 `blockedRounds` → 默认 0，兼容
- IPC 新增 `goal_complete` / `blocked` 事件，老 renderer 收到会忽略（向后兼容）

## Open Questions

1. **goal_complete 事件要不要在 settings 里关掉？** 默认开，UI 设置页可选关（避免噪音）。
2. **blockedRounds 达阈值后，要不要给用户"继续忽略"选项？** 是；用户确认后清零继续（不重置 session，从上一 checkpoint 继续）。
3. **plan prompt 要不要也注入 blocked audit？** 否；plan 是产出清单的阶段，blocked audit 只对 verify 阶段有意义。
