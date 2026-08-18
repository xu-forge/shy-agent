# Plan: agent-optimize

> 5 阶段顺序实施；每阶段独立可测；最后跑 typecheck + test + dev 验证。

## Phase 1：ReAct 流程强化（核心）

### 1.1 react-prompt.ts 新建

- [ ] 1.1.1 新建 `src/main/agent/react-prompt.ts`：导出 `REACT_GUIDE_BLOCK` 常量 + `getReactGuide(mode)` 函数
- [ ] 1.1.2 加单测：验证返回 string 含 "Thought" / "Action" / "Observation" 三个关键词

### 1.2 graph.ts act prompt 嵌入 ReAct

- [ ] 1.2.1 `graph.ts planNode`：在现有 system message 前置 REACT_GUIDE_BLOCK（plan 模式）
- [ ] 1.2.2 `graph.ts actNode`：在现有 system message 前置 REACT_GUIDE_BLOCK（act 模式）
- [ ] 1.2.3 保持现有 JSON schema 输出（plan / verify 不破坏）

### 1.3 verify-llm.ts ReAct 引导

- [ ] 1.3.1 在 VERIFY_SYSTEM_PROMPT 前置 REACT_GUIDE_BLOCK
- [ ] 1.3.2 改 prompt：让 LLM 先"Thought"（派生需求、找证据）再输出 JSON

### 1.4 goal-context.ts 加 react_framework 段

- [ ] 1.4.1 在 buildGoalContext 中加新段 `<react_framework>...</react_framework>`
- [ ] 1.4.2 内容：ReAct 循环 + Thought 引导 + 简单 Q&A 例外
- [ ] 1.4.3 单测更新：验证输出含 react_framework 段

## Phase 2：流式渲染

### 2.1 AgentEvent 加 assistant_delta

- [ ] 2.1.1 `src/shared/ipc.ts` 迁移 AgentEvent 类型（从 service.ts 搬过来）
- [ ] 2.1.2 新增 `{ type: 'assistant_delta'; content: string; sessionId?: string }`
- [ ] 2.1.3 `service.ts` 重新 export AgentEvent 类型（向后兼容）

### 2.2 main stream invoke

- [ ] 2.2.1 `goal-driver.ts defaultRunBurst`：`bound.stream()` 替代 `bound.invoke()`
- [ ] 2.2.2 for-await chunk → emit `{ type: 'assistant_delta', content: chunk.content }`
- [ ] 2.2.3 末 chunk 处理 tool_calls + 累计 tokenUsed
- [ ] 2.2.4 emit `{ type: 'assistant_done' }` 收尾

### 2.3 renderer useAgentEvents hook

- [ ] 2.3.1 新建 `src/renderer/src/components/chat/useAgentEvents.ts`
- [ ] 2.3.2 switch (ev.type) 分发到 handlers（onMessage / onDelta / onToolCall / etc.）
- [ ] 2.3.3 appendDelta：找到最后一条 assistant 消息（无 kind=result）追加；否则新开
- [ ] 2.3.4 单测：mock onEvent payload，验证 handler 调用

### 2.4 ChatWorkspace 流式合并

- [ ] 2.4.1 用 Zustand store 替代 useState messages
- [ ] 2.4.2 onDelta handler 调用 store.appendDelta
- [ ] 2.4.3 长 assistant 消息实时刷新

## Phase 3：UI / 组件拆分

### 3.1 Composer 组件

- [ ] 3.1.1 新建 `src/renderer/src/components/chat/Composer.tsx`
- [ ] 3.1.2 接收 props：mode / draft / verifyCommand / onSend / onChange
- [ ] 3.1.3 内部用 forwardRef 暴露 focus()
- [ ] 3.1.4 goal mode 渲染额外 verify-command input

### 3.2 MessageList + MessageItem

- [ ] 3.2.1 新建 `src/renderer/src/components/chat/MessageList.tsx`
- [ ] 3.2.2 用 `react-virtuoso` 虚拟滚动
- [ ] 3.2.3 新建 `src/renderer/src/components/chat/MessageItem.tsx`
- [ ] 3.2.4 按 role 分支渲染（assistant / tool / system / user）
- [ ] 3.2.5 tool message 折叠 output（`<details>`）

### 3.3 Suggestions + StatusBar

- [ ] 3.3.1 新建 `src/renderer/src/components/chat/Suggestions.tsx`（空状态 4 个建议）
- [ ] 3.3.2 新建 `src/renderer/src/components/chat/StatusBar.tsx`
- [ ] 3.3.3 spinner（busy 时）+ 状态文本 + 目标进度条（goal mode 时）

### 3.4 ErrorBoundary

- [ ] 3.4.1 新建 `src/renderer/src/components/ErrorBoundary.tsx`
- [ ] 3.4.2 class 组件，componentDidCatch → console.error + notify
- [ ] 3.4.3 fallback UI：友好提示 + 刷新按钮
- [ ] 3.4.4 在 ChatWorkspace 外层包裹

### 3.5 ChatWorkspace 瘦身

- [ ] 3.5.1 ChatWorkspace.tsx 缩到 < 100 行：组装 Composer + MessageList + StatusBar
- [ ] 3.5.2 业务逻辑全部下沉到 hooks / 子组件

## Phase 4：Tool / Function Call 强化

### 4.1 builtin.ts / computer.ts 单测

- [ ] 4.1.1 新建 `src/main/agent/tools/builtin.test.ts`
- [ ] 4.1.2 测试 shell / read / write / delete 等基础工具
- [ ] 4.1.3 新建 `src/main/agent/tools/computer.test.ts`
- [ ] 4.1.4 mock computer-use 工具
- [ ] 4.1.5 覆盖率目标：builtin.ts 60% / computer.ts 40%

### 4.2 get_goal 加 verbosity

- [ ] 4.2.1 `goal-tools.ts makeGetGoalTool`：schema 加 verbosity 字段（enum summary | full，default summary）
- [ ] 4.2.2 func 按 verbosity 构造返回
- [ ] 4.2.3 单测：summary 模式只返回关键字段

### 4.3 tool-stats 模块

- [ ] 4.3.1 新建 `src/main/agent/tool-stats.ts`
- [ ] 4.3.2 Map<string, ToolStat> 累计
- [ ] 4.3.3 export getToolStats / resetToolStats
- [ ] 4.3.4 在 buildGoalTools.func 里包一层统计
- [ ] 4.3.5 单测

### 4.4 修 render 中写 ref 反模式

- [ ] 4.4.1 `ChatWorkspace.tsx:53` 的 `currentSessionIdRef.current = sessionId` → useEffect

### 4.5 tool schema 加 additionalProperties

- [ ] 4.5.1 `goal-tools.ts` 两个工具的 zod schema 用 `.strict()`（替代默认 strip）
- [ ] 4.5.2 现有 builtin.ts 工具也加 .strict()

## Phase 5：架构 / 性能

### 5.1 goal-driver 拆分

- [ ] 5.1.1 新建 `src/main/agent/goal/` 子目录
- [ ] 5.1.2 拆 plan.ts / run-burst.ts / verify-phase.ts / check-round.ts / conclude.ts / deliver.ts
- [ ] 5.1.3 src/main/agent/goal-driver.ts 改为 re-export
- [ ] 5.1.4 现有测试 / 调用方不受影响

### 5.2 Zustand store

- [ ] 5.2.1 `npm install zustand react-virtuoso`
- [ ] 5.2.2 新建 `src/renderer/src/store/chat.ts`
- [ ] 5.2.3 messagesBySession + append + appendDelta + clear

### 5.3 docs 更新

- [ ] 5.3.1 `docs/product-brief.md` 加 "ReAct 流程" 节
- [ ] 5.3.2 retrospective.md

## Phase 6：验证

- [ ] 6.1 `npm run typecheck` 通过
- [ ] 6.2 `npm run lint` 通过
- [ ] 6.3 `npm test` 通过（不破坏现有 161 测试）
- [ ] 6.4 `npm run test:coverage` 通过（新模块覆盖率达标）
- [ ] 6.5 `npm run dev` 启动成功
- [ ] 6.6 手动跑：goal mode + interactive mode + 工具调用 + 流式渲染

## 工作量估算

- Phase 1（ReAct）：0.5 天
- Phase 2（流式）：1 天
- Phase 3（UI 拆分）：1 天
- Phase 4（tool）：0.5 天
- Phase 5（架构）：1 天
- Phase 6（验证）：0.5 天

**合计**：~4.5 天工作量（按理想节奏；含单测）
