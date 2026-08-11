# Proposal: goal-mode-runtime-budget

## Why

目标模式（goal mode）当前存在三个可观察短板，均影响「结果导向」的可靠性与成本：

1. **无成本预算**：目标模式靠 LangGraph 递归保险丝与「清单无进展轮数」控制，`hardRoundCap` 默认 0（关闭）。对按量计费的 OpenAI-compatible 模型（如 Minimax）长任务可能无上限烧 token，用户无法预设单次目标的总成本上限。
2. **停滞判定过粗**：仅看「done 数量是否增加」，无法区分「一步内做了大量实质工具工作」与「真正卡死空转」，可能在真正推进时误触发暂停。
3. **验收自证**：清单完成状态由执行任务的同一 LLM 宣称，缺乏可执行的客观检查，无法真正保证「可验收完成」。

本 change 为 goal mode 增加显式成本预算、更细的停滞判定，并为验收提供可执行检查的挂钩（先落地数据模型与预算，可执行检查规则引擎留待后续）。

## What Changes

**Token 成本预算（goal mode，默认开启）**
- From: 目标模式无成本上限，仅靠轮数与停滞控制。
- To: 新增 `tokenBudget` 设置（默认开启，如 400_000 tokens），按 OpenAI-compatible 返回的 `usage_metadata` 累计本轮消耗；超预算时软暂停并保存进度，等用户决定是否续跑。
- Reason: 付费模型长任务需要显式成本护栏，避免失控烧 token。
- Impact: 非破坏；目标模式行为变化，交互式模式不受影响。

**停滞判定细化（工具级进展）**
- From: 仅按「清单 done 数量未增」累计停滞轮数。
- To: 停滞计数器只在「既无清单进展、又无有效工具调用结果」时递增；有实质工具产出则清零。
- Reason: 区分真正推进与空转，减少误暂停。
- Impact: 非破坏；仅调整 goal mode 内的计数逻辑。

**验收可执行检查挂钩（数据模型先行）**
- From: 清单项只有 `done` / `evidence`（LLM 自证）。
- To: 清单项可选携带 `check` 描述（可执行验收规则的说明），本轮不强制校验，为后续 rules engine 预留；同时 verify 的 prompt 要求产出可观察证据而非空泛声称。
- Reason: 为「可验收完成」铺路，先落数据模型与提示约束。
- Impact: 非破坏；`GoalChecklistItem` 增加可选字段。

## Capabilities

### New Capabilities

- `goal-runtime`: 目标模式运行护栏与验收挂钩（token 预算、工具级停滞、可执行 check 字段）。

### Modified Capabilities

- `final-runtime`：goal loop 的验收判定与停滞逻辑细化；新增成本预算行为。

## Impact

- **shared**：`src/shared/ipc.ts`（`GoalChecklistItem.check?`、`ModelSettings.tokenBudget?`）
- **main**：
  - `src/main/settings/store.ts`（默认 `tokenBudget`）
  - `src/main/agent/graph.ts`（token 累计、停滞判定、check 字段、verify prompt）
  - `src/main/agent/service.ts`（预算阈值读取与暂停触发）
- **renderer**：`src/renderer/src/components/SettingsPanel.tsx`（token 预算输入）
- **测试**：`src/main/agent/graph.test.ts`（预算停止、停滞判定、check 透传）
