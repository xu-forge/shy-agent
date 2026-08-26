# Proposal: convincing-agent-ui

## Why

shy 在事实类、推荐类问题（如「广州周末去哪玩」）上常直接输出 markdown 答案，缺少可感知的思考与查证过程；对标 WorkBuddy 时用户明显更信任后者的时间轴式「思考 → 搜索 → 读指南 → 可视化 widget → 总结」。根因横跨 Prompt（允许无工具直答）、工具链（主 agent 缺 web_search / 呈现工具）、事件模型（reasoning 埋在 assistant 文本）与 UI（通用 JSON 工具卡）。本轮通过 OpenSpec 分三阶段补齐「信服感」，先规格后实现，避免盲目改 UI 或整栈替换 agent runtime。

## What Changes

**信服感四层模型（WorkBuddy → shy 映射）**
- From: 仅 assistant 流 + 通用 tool_call/result，思考折叠在 `<think>`
- To: 独立 reasoning 事件 + 时间轴穿插 + 按工具定制 Renderer + 事实类强制查证
- Reason: 用户信任来自过程可见与行为一致
- Impact: 扩展 `AgentEvent`、renderer 组件、可选新工具；IPC 向后兼容（旧事件仍可用）

**Phase 1 — 呈现（本 change 优先 implement）**
- From: `ReActContent` 深折叠「思考 N 次」；`ToolCallCard` 显示 raw 工具名与 JSON
- To: 思考默认可见摘要+耗时；工具行人话标签；消息线程按事件序 interleave
- Reason: 即使尚未加 web_search，已有工具调用也应「演」清楚
- Impact: `shared/ipc.ts`、`ChatWorkspace`、`ReActContent`、`ToolCallCard`、`turn-runner` emit

**Phase 2 — 工具 enrichment（完整矩阵，非仅 web_search）**
- From: 主 agent 缺大量工具；subagent allowlist 存在 ghost 名（grep/glob/web_search/web_fetch/fs_edit）；无 visualizer / present / 交互类工具
- To: 按 WorkBuddy 分类补齐并注册：**Web**（web_search、web_fetch）、**Read/Nav**（grep、glob、fs_list）、**Edit**（fs_edit）、**Visual**（read_me、show_widget）、**Present**（present_artifact）、**Interact**（ask_user）、**Lint**（read_lints）、**Task**（主 agent 暴露 task_*）；每项配专用 Renderer
- Reason: 信服感依赖「查→读→改→演→交付」全链路可见，WorkBuddy 对每类工具都有定制 UI
- Impact: `src/main/agent/tools/`（多模块）、`react-prompt.ts` 工具表、renderer tool registry（10+ Renderer）

**Phase 3 — Prompt 对齐**
- From: `react-prompt.ts` 允许简单 Q&A 直答；工具名与 prompt 不完全一致
- To: 事实/时效/地点类 MUST 先工具后答；final_answer 须自洽中间结果
- Reason: 防止模型跳过工具链
- Impact: `react-prompt.ts`、goal context 段

## Capabilities

### New Capabilities

- `agent-reasoning-display`：推理/思考过程的流式展示、耗时与折叠策略
- `agent-tool-timeline`：工具调用时间轴、人话标签、与正文/思考穿插排序
- `agent-tool-enrichment`：主 agent 工具全集（Web/导航/编辑/可视化/呈现/交互/lint/task）及专用 Renderer
- `agent-fact-check-prompt`：事实类问题的 prompt 约束与 final_answer 自洽规则

### Modified Capabilities

（无 `openspec/specs/` 下既有 capability 的 REQUIREMENTS 语义变更；本 change 均为新增 capability。）

## Impact

- **shared**：`ipc.ts` — 扩展 `AgentEvent`（`reasoning_delta` / `reasoning_done` 等）
- **main/agent**：`turn-runner/`、`llm-client.ts`、`react-prompt.ts`（Phase 3）、`tools/`（Phase 2）
- **renderer**：`ChatWorkspace.tsx`、tool renderer registry（Search/WebFetch/Read/Write/Edit/Grep/Glob/Widget/Artifact/Task/AskUser/Lints 等）
- **参考（只读）**：`../workbuddy` — `workbuddy-prompt.tpl`、`docs/18-acp-protocol.md`、renderer 解包 JS 中的 tool renderers
- **测试**：`react-parser`、`useAgentEvents`、tool label 映射、reasoning 事件单测
- **依赖**：不新增 LangGraph；Phase 2 可能需 Search API 或复用 `browser_fetch`
