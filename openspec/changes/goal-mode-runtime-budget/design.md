# Design: goal-mode-runtime-budget

目标：让 goal mode 能**长跑数天**——去掉一切业务性轮次限制，护栏收敛为「成本 + 进度」，并通过**段式自动续跑 + 持久化 checkpoint** 支撑跨天/跨重启。

## 护栏模型（不看轮次）

- **移除**：`hardRoundCap`（绝对轮次上限）、`recursionLimit` 设置项与 UI。
- `recursionLimit` 是 LangGraph `graph.invoke` 强制参数，**删不掉**；改为代码内大常量（如 `100_000`），仅当「状态机失控保险丝」，不参与业务判断。
- 护栏收敛为两个真实信号：
  - **成本**：`tokenBudget`（tokens，默认 400_000，0=关闭），按 `usage_metadata` 累计。
  - **进度**：停滞检测 + 工具级进展（有有效工具结果即不算停滞）。

## 段式自动续跑（长跑核心）

- 不复用单次大 `graph.invoke` 跑完整个目标；改为**外部循环 + 单段 invoke**：
  1. `invoke` 一次只跑一段（默认每段上限步数 `segmentSteps`，如 60）。
  2. 段尾（或每步后）把 `goal + checklist + shortMemory + tokenUsed` 落盘到 session 行（复用现有 `updateSessionRuntime` / `checkpoint`）。
  3. 段内若完成 → 结束；若未完成 → **自动用 resume 路径启动下一段**，并在新段开头注入短期记忆压缩后的摘要，控制上下文窗口。
  4. 每段之间执行 `compressWithLlm` 压缩短期记忆。
- 因为进度与摘要都落盘，**进程崩溃/重启后可从磁盘 checkpoint 恢复**，实现真正「跑好几天」。
- 暂停/取消仍即时生效（AbortController + beforeStep gate）。

## 停滞判定

- `AgentState` 增加 `lastToolActivity`（最近有效工具结果步数）；tools 节点后置标记。
- verify 时：无新 done 且无工具活动 → 停滞+1；否则清零。
- 停滞达阈值 → 软暂停（等用户补充线索后继续），跨段保持计数。

## Token 预算

- `AgentState` 增加 `tokenUsed`；act / verify 的 `llm.invoke` 读 `usage_metadata.total_tokens` 累计。
- `routeAfterVerify`：`tokenUsed >= tokenBudget`（>0）→ 软暂停（reason=budget）。
- 完成/取消重置。

## check 字段

- `GoalChecklistItem` 增加可选 `check?: string`；plan/verify JSON 支持；本轮仅透传展示，rules engine 后续单独 change。

## 持久化

- 复用 `sessions` 表的 `goal / checklist / short_memory / checkpoint` 字段，段尾写入。
- 新增落盘函数（如 `persistSegment`）统一段尾持久化。
