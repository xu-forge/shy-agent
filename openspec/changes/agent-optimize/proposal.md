# Proposal: agent-optimize

## Why

my-agent 已完成目标模式 + 与 Codex 对齐（`goal-mode-prompt-audit`），但 review 显示有 **5 大类短板**，整体 ReAct 评分 5.5/10：

1. **ReAct 范式缺位**：act / plan / verify prompt 没有 Thought 引导；UI 不显示 LLM 推理；非流式（用户等 LLM 完整生成才看到结果）
2. **ChatWorkspace 过载**：491 行单组件 / 12 个 state / 110 行 onEvent handler巨型 if-else
3. **工具覆盖薄弱**：内置工具覆盖率 4%（builtin.ts / computer.ts 0% 单测）
4. **错误处理缺失**：无 ErrorBoundary；组件抛错白屏
5. **类型架构问题**：AgentEvent 在 `service.ts` 而非 `shared/ipc.ts`，renderer 强转

这次"狠狠优化"要一次性扫掉这 5 类问题，把 ReAct 评分从 5.5 拉到 8+。

## What Changes

### A. ReAct 流程强化（核心）

- **A1**：`plan` / `act` / `verify` 三个 LLM 节点的 system prompt 加显式 ReAct Thought 引导
- **A2**：新增 `assistant_delta` AgentEvent 类型，支持流式渲染（LLM 每生成一段就推给 renderer）
- **A3**：`assistant` 消息 schema 增加 `thought` 字段，把 LLM 推理显式提取出来
- **A4**：`tool` 消息 schema 增加 `thought` / `input` 字段，附 reasoning 上下文
- **A5**：`goal_context` 块新增 `<react_framework>` 段，告诉 LLM 按 ReAct 循环

### B. UI / 组件拆分

- **B1**：抽 `useAgentEvents` hook（封装 110 行 if-else），单测覆盖
- **B2**：抽 `<Composer>` 组件（输入框 + verify-command 输入条）
- **B3**：抽 `<MessageList>` + `<MessageItem>` 组件
- **B4**：抽 `<Suggestions>` 空状态组件
- **B5**：抽 `<StatusBar>` 加 spinner + 目标进度条
- **B6**：新增 `<ErrorBoundary>` 包裹 ChatWorkspace

### C. Tool / Function Call 强化

- **C1**：给 `builtin.ts` / `computer.ts` 写单测（目标覆盖率 60%+）
- **C2**：`get_goal` 工具加 `verbosity` 参数（`summary` / `full`），默认 summary 省 token
- **C3**：新增 `tool_stats` 模块（call 次数 / token 占用 / 耗时）
- **C4**：把 `AgentEvent` 类型从 `service.ts` 移到 `shared/ipc.ts`，renderer 端用 typed listener
- **C5**：修掉 render 中写 ref 的反模式（`currentSessionIdRef.current = sessionId`）
- **C6**：tool schema 加 `additionalProperties: false` 防止 LLM 加额外字段

### D. 性能 / 架构

- **D1**：`messages` 状态用 Zustand 管理（支持跨会话、跨组件）
- **D2**：长会话用 `react-virtuoso` 虚拟滚动
- **D3**：把 `goal-driver.ts` 拆到 `goal/` 子目录（plan / run-burst / verify-phase / check-round / conclude / deliver）

### E. 文档 / 流程

- **E1**：`docs/product-brief.md` 加 "ReAct 流程 + 工具使用指南"节
- **E2**：写 `retrospective.md`

## Capabilities

### New Capabilities

- `agent-react-streaming`: ReAct 显式化（Thought 引导 + 流式 + 工具上下文）
- `agent-tool-stats`: 工具调用统计与可观测性

### Modified Capabilities

- `agent-runtime`: LangGraph 编排扩展流式事件 + 工具 schema 增强
- `renderer-shell-ui`: ChatWorkspace 拆分 + Zustand 状态 + ErrorBoundary
- `goal-runtime-audit`（上一 change）：goal_context 加 ReAct 段，verify prompt 加 Thought

## Impact

- **shared**：
  - `src/shared/ipc.ts`：迁移 AgentEvent + 新增 agent-react-streaming 事件类型
- **main**：
  - 新建 `src/main/agent/react-prompt.ts`（ReAct 引导常量）
  - 新建 `src/main/agent/tool-stats.ts`（工具统计）
  - 改 `src/main/agent/graph.ts`（流式 invoke + Thought 引导）
  - 改 `src/main/agent/goal-context.ts`（加 react_framework 段）
  - 改 `src/main/agent/verify-llm.ts`（加 Thought）
  - 改 `src/main/agent/service.ts`（emit delta 事件 + 新 AgentEvent 类型）
  - 改 `src/main/agent/tools/builtin.ts`（schema 优化）
  - 新增 `src/main/agent/tools/builtin.test.ts` / `computer.test.ts`
  - 拆 `src/main/agent/goal-driver.ts` 到 `goal/` 子目录
- **renderer**：
  - 新建 `src/renderer/src/components/chat/useAgentEvents.ts`
  - 新建 `src/renderer/src/components/chat/Composer.tsx`
  - 新建 `src/renderer/src/components/chat/MessageList.tsx`
  - 新建 `src/renderer/src/components/chat/MessageItem.tsx`
  - 新建 `src/renderer/src/components/chat/Suggestions.tsx`
  - 新建 `src/renderer/src/components/chat/StatusBar.tsx`
  - 新建 `src/renderer/src/components/ErrorBoundary.tsx`
  - 新建 `src/renderer/src/store/chat.ts`（Zustand）
  - 拆 `src/renderer/src/components/ChatWorkspace.tsx`（瘦身到 <100 行）
- **测试**：新增 useAgentEvents / tool-stats / builtin / computer 单测
- **依赖**：加 `react-virtuoso` + `zustand`（运行时依赖）

## Non-Goals

- 不改 IPC 协议（仅扩展事件类型）
- 不重写 LangGraph 状态机（仅在 act 节点加 stream）
- 不做 e2e / Playwright 测试（基础路径之外）
- 不动 product-brief 之外的产品文档
