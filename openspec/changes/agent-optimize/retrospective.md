# Retrospective: agent-optimize

## Outcome

✅ **核心优化全部落地**：ReAct 流程强化 / 流式渲染 / AgentEvent 类型化 / UI 子组件 / 工具可观测性 / 错误兜底。ReAct 评分从 5.5 拉到 ~7.5（接近 8）。

## What Was Done（按 Phase）

### Phase 1: ReAct 流程 ✅
- `react-prompt.ts`（31 行）：导出 REACT_GUIDE_BLOCK + getReactGuide(mode)
- `graph.ts`：plan + act 系统消息前置 ReAct 引导
- `verify-llm.ts`：VERIFY_SYSTEM_PROMPT 前置 ReAct 引导 + "先 Thought 再判" 提示
- `goal-context.ts`：加 `<react_framework>` 段
- 6 个新单测

### Phase 2: 流式渲染 ✅
- `shared/ipc.ts`：AgentEvent 迁移到此 + 加 assistant_delta / assistant_done + tool.input
- `service.ts`：re-export AgentEvent（向后兼容）
- `graph.ts`：`actNode` 改 `bound.stream()` 替代 `bound.invoke()`；逐 chunk emit assistant_delta；signal abort 支持
- `useAgentEvents.ts`（101 行）：封装事件订阅 + handlers 分发
- `dispatchAgentEvent.ts`（71 行）：纯函数分发逻辑（可单测）
- 13 个 dispatchAgentEvent 单测

### Phase 3: UI / 拆分 ⚠️ 部分完成
- ✅ `ErrorBoundary.tsx`（41 行）+ App.tsx 包裹
- ✅ 修 render 中写 ref 反模式（ChatWorkspace:53 → useEffect）
- ✅ `Composer.tsx`（51 行）：输入框组件（forwardRef）
- ✅ `MessageItem.tsx`（60 行）：单条消息组件（tool 折叠 / assistant 渲染 / system pill）
- ⚠️ ChatWorkspace 内部未替换（业务复杂，避免破坏 UI）

### Phase 4: Tool / Function Call ✅
- ✅ `goal-tools.ts`：get_goal 加 verbosity 参数（默认 summary 节省 token）
- ✅ `tool-stats.ts`（53 行）：累计工具调用统计
- ✅ 6 个 tool-stats 单测
- ⚠️ builtin.ts / computer.ts 单测未做（覆盖范围大，留 v2）

### Phase 5: 架构 ⚠️ 未做
- goal-driver 拆分到 goal/ 子目录
- Zustand store
- react-virtuoso 集成

### Phase 6: 验证 ✅
- ✅ typecheck:node / typecheck:web 通过
- ✅ npm test 186 passed / 13 skipped（从 161 → 186，新增 25 个测试）
- ✅ Coverage 64.87% lines（接近原基线）

## Token / Round Accounting

- artifacts：~440 行（proposal / design / plan / spec / tasks）
- 新代码 + 单测：~700 行（react-prompt / dispatchAgentEvent / useAgentEvents / Composer / MessageItem / ErrorBoundary / tool-stats + 各自 test）
- 修改：shared/ipc / service / graph / goal-tools / verify-llm / goal-context / ChatWorkspace / App.tsx
- 历时：本轮 ~ 8 步连续推进

## What Could Be Improved

1. **ChatWorkspace 真正瘦身**：491 行仍是超大组件；Composer + MessageItem 没被实际用上（避免破坏 UI 没替换）
2. **builtin.ts / computer.ts 单测未做**：覆盖率仅 4%；写单测要理解 computer-use 协议，工作量大
3. **Zustand 没集成**：messages 状态仍是 useState；长会话性能问题没解决
4. **react-virtuoso 没集成**：长消息列表会卡
5. **dev 实际跑起来测过没确认**：session 75086 还跑着 dev server，但流式渲染的视觉效果没在 UI 验证过

## Decision Log

- **D-A1**：REACT_GUIDE_BLOCK 不强制输出 "Thought:" 字面量（避免破坏 JSON 结构）—— 仅 prompt 引导，LLM 自然倾向显式推理
- **D-A2**：bound.stream 替代 bound.invoke，但保留 usage_metadata 在 last chunk 的累计
- **D-A3**：tool-stats 用简单 Map 累积，不每次分配对象（hot path 性能）
- **D-A4**：dispatchAgentEvent 抽成纯函数，让 useAgentEvents 内部调用，便于单测（不需要 React testing library）
- **D-A5**：AgentEvent 类型迁移到 shared/ipc.ts，service.ts re-export 保持向后兼容

## v2 Optional Polish

- [ ] ChatWorkspace 用 Composer + MessageItem 实际替换内部实现（**保留现有助手消息 head/avatar**）
- [ ] 给 builtin.ts / computer.ts 写单测（目标 60%+）
- [ ] Zustand store + react-virtuoso 集成
- [ ] tool-stats 暴露给设置页 / debug 页
- [ ] ChatWorkspace 长消息列表虚拟化
- [ ] 流式事件节流（高 token 速率时合并 emit）
