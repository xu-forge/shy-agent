## ADDED Requirements

### Requirement: ReAct Thought 引导
`plan` / `act` / `verify` 三个 LLM 节点的系统消息 MUST 前置 ReAct 引导段，包含 Thought / Action / Observation 三步骤说明。

#### Scenario: act prompt 含 ReAct 引导
- **WHEN** `actNode` 构造 system message
- **THEN** MUST 含 "Thought" / "Action" / "Observation" 三个关键词

#### Scenario: verify prompt 含 ReAct 引导
- **WHEN** `verify-llm.ts` 构造 VERIFY_SYSTEM_PROMPT
- **THEN** MUST 前置 ReAct 引导段

#### Scenario: goal_context 含 react_framework 段
- **WHEN** `buildGoalContext` 渲染
- **THEN** 输出 MUST 含 `<react_framework>` 段落

### Requirement: 流式渲染（assistant_delta 事件）
LLM 在 act 节点 MUST 用 stream 模式（替代 invoke），逐 chunk emit `assistant_delta` 事件给 renderer。

#### Scenario: chunk 到达时 emit delta
- **WHEN** LLM stream 输出新 chunk
- **THEN** main MUST emit `{ type: 'assistant_delta'; content: chunk }`

#### Scenario: 流结束 emit done
- **WHEN** stream 完成
- **THEN** main MUST emit `{ type: 'assistant_done' }` 收尾

#### Scenario: renderer 合并 delta
- **WHEN** renderer 收到 `assistant_delta`
- **THEN** MUST 追加到最后一条 assistant 消息（kind ≠ 'result'）；否则新开一条

### Requirement: tool 消息 schema 增强
tool 类型消息 MUST 支持 `toolName` / `input` / `output` / `thought` 字段；renderer MUST 默认折叠 output。

#### Scenario: tool msg 含 toolName
- **WHEN** 收到 tool 事件
- **THEN** ChatMessage MUST 包含 toolName 字段

#### Scenario: 折叠 output
- **WHEN** renderer 渲染 tool 消息
- **THEN** output MUST 默认折叠在 `<details>` 里，hover / click展开

### Requirement: useAgentEvents hook
事件订阅 MUST 抽离到独立 hook，封装 switch 分发与 sessionId 过滤；ChatWorkspace 不再持有 110 行巨型 if-else。

#### Scenario: hook 封装事件
- **WHEN** ChatWorkspace 订阅事件
- **THEN** MUST 调用 `useAgentEvents` hook，传入 typed handlers

#### Scenario: hook 单测覆盖
- **WHEN** 跑 `useAgentEvents.test.ts`
- **THEN** 至少 5 个测试覆盖 result / assistant / tool / status / done / blocked / goal_complete

### Requirement: ChatWorkspace 组件拆分
ChatWorkspace MUST 拆为 < 100 行的组装组件 + 子组件 / hooks。

#### Scenario: 行数 < 100
- **WHEN** 跑 `wc -l src/renderer/src/components/ChatWorkspace.tsx`
- **THEN** 行数 MUST < 100

#### Scenario: 子组件存在
- **WHEN** 检查 `src/renderer/src/components/chat/` 目录
- **THEN** MUST 包含 Composer / MessageList / MessageItem / Suggestions / StatusBar / useAgentEvents

### Requirement: ErrorBoundary
renderer MUST 有 ErrorBoundary 包裹 ChatWorkspace，组件抛错时显示 fallback UI。

#### Scenario: 子组件抛错
- **WHEN** 子组件 render 时抛 Error
- **THEN** MUST 显示 fallback UI（友好提示 + 刷新按钮）

#### Scenario: 错误日志
- **WHEN** componentDidCatch 触发
- **THEN** MUST console.error + 调用 window.shy.notify（如可用）

### Requirement: AgentEvent 类型迁移
AgentEvent 类型 MUST 从 `service.ts` 迁移到 `shared/ipc.ts`，renderer 端用 typed listener。

#### Scenario: shared/ipc.ts 导出 AgentEvent
- **WHEN** 检查 `src/shared/ipc.ts`
- **THEN** MUST export `type AgentEvent`

#### Scenario: renderer 不用 type-assert
- **WHEN** renderer 收到 event
- **THEN** MUST 能用 `ev.type` switch（无需 `as { type?: string }`）

### Requirement: get_goal verbosity
`get_goal` 工具 MUST 支持 `verbosity` 参数（`summary` / `full`），默认 `summary`。

#### Scenario: 默认 summary
- **WHEN** LLM 调用 `get_goal({})`
- **THEN** MUST 返回 summary 模式（goal / progress / budget / blockedRounds / runStatus 字段）

#### Scenario: full 模式
- **WHEN** LLM 调用 `get_goal({ verbosity: 'full' })`
- **THEN** MUST 返回完整 snapshot（含 checklist 全部项）

### Requirement: tool-stats 统计
tool-stats 模块 MUST 累计每个工具的调用次数 / token 占用 / 平均耗时。

#### Scenario: 调用后累计
- **WHEN** 工具 func 被调用
- **THEN** stats MUST 增加 call count + token count + 更新 avg duration

#### Scenario: 单测覆盖
- **WHEN** 跑 `tool-stats.test.ts`
- **THEN** 至少 3 个测试（增加 / 重置 / 聚合）

### Requirement: goal-driver 拆分子目录
`src/main/agent/goal-driver.ts` MUST 拆为 `src/main/agent/goal/` 子目录，每个文件 < 200 行。

#### Scenario: 子目录存在
- **WHEN** 检查 `src/main/agent/goal/`
- **THEN** MUST 含 plan.ts / run-burst.ts / verify-phase.ts / check-round.ts / conclude.ts / deliver.ts

#### Scenario: 原文件 re-export
- **WHEN** 检查 `src/main/agent/goal-driver.ts`
- **THEN** MUST re-export 自 goal/ 子目录（保持向后兼容）

### Requirement: tool schema strict
所有 LangChain 工具的 zod schema MUST 用 `.strict()`（替代默认 strip），防止 LLM 加额外字段。

#### Scenario: 额外字段被拒绝
- **WHEN** LLM 调工具时传额外字段
- **THEN** zod MUST 抛错（不让静默丢弃）
