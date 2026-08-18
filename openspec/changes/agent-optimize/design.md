# Design: agent-optimize

## Context

my-agent 已完成 goal-mode-prompt-audit（与 Codex 对齐）。但 review 显示 5 类短板。这次"狠狠优化"覆盖 ReAct 显式化、UI 拆分、工具强化、错误处理、类型架构。

## Goals / Non-Goals

**Goals**：把 ReAct 评分从 5.5 拉到 8+；UI 组件化；工具可观测性；类型化事件；性能优化。

**Non-Goals**：不改 IPC 协议；不重写 LangGraph；不动产品文档核心。

## Decisions

### D1：ReAct Thought 引导（不强制输出，prompt 引导）

在 `react-prompt.ts` 定义 `REACT_GUIDE_BLOCK` 常量：

```
【ReAct 框架】每次回复按以下顺序：
1. Thought: 1-3 句说明你看到了什么 + 你打算做什么 + 为什么
2. Action: 调用工具 / 或输出最终结论
3. Observation: 工具结果回到这里后，再次 Thought → Action 循环

例外：simple Q&A 可直接回答，不需要 Thought。
```

嵌入 `plan` / `act` / `verify` 三个 system message。LLM 不强制输出 `Thought:` 文本（避免破坏 JSON 结构），但会**自然倾向于**显式推理。

### D2：流式渲染（assistant_delta 事件）

- 新增 AgentEvent：`{ type: 'assistant_delta'; content: string; done?: boolean }`
- main：`bound.stream(...)` 替代 `bound.invoke(...)`，逐 chunk emit `assistant_delta`
- renderer：`useAgentEvents` 监听 delta，合并到最后一条 assistant 消息
- 性能：长 LLM 响应不再"等到底"才显示，用户能实时看到

### D3：tool 消息 schema 增强

```typescript
type ToolMsg = {
  role: 'tool'
  toolName: string       // 工具名
  input?: unknown        // 工具输入参数
  output?: unknown       // 工具输出
  thought?: string       // LLM 调用前的 Thought
  ts: string
}
```

renderer 默认折叠 `output`，展开看完整 JSON。

### D4：useAgentEvents hook 抽离

`src/renderer/src/components/chat/useAgentEvents.ts` 封装 onEvent 订阅 + 类型化 switch + sessionId 过滤。ChatWorkspace 调用 hook，传入 handlers（onMessage / onToolCall / onStatus / etc.），不再有 110 行 if-else。

### D5：ChatWorkspace 组件拆分

```
src/renderer/src/components/
├─ ChatWorkspace.tsx           # < 100 行：组装 + 状态管理
├─ chat/
│  ├─ useAgentEvents.ts        # 事件 hook
│  ├─ Composer.tsx             # 输入框（textarea + verify-command）
│  ├─ MessageList.tsx          # 消息列表（virtuoso）
│  ├─ MessageItem.tsx          # 单条消息
│  ├─ Suggestions.tsx          # 空状态建议
│  └─ StatusBar.tsx            # 状态栏（spinner + 进度）
└─ ErrorBoundary.tsx           # 顶层错误兜底
```

### D6：Zustand 管理 messages

```typescript
type ChatStore = {
  messagesBySession: Record<string, ChatMsg[]>
  append: (sessionId, msg) => void
  appendDelta: (sessionId, delta) => void  // 流式合并
  clear: (sessionId) => void
}
```

跨会话 / 跨组件共享；selectors 控制重渲染。

### D7：get_goal 工具加 verbosity

```typescript
schema: z.object({
  verbosity: z.enum(['summary', 'full']).default('summary')
})
```

`summary` 模式只返回 goal / progress / budget / blockedRounds / runStatus（~150 tokens）；`full` 模式返回完整 snapshot（~500 tokens）。LLM 默认 summary，复杂决策时显式 full。

### D8：tool-stats 模块

```typescript
type ToolStat = {
  name: string
  calls: number
  totalInputTokens: number
  totalOutputTokens: number
  avgDurationMs: number
}
const stats = new Map<string, ToolStat>()
export function trackToolCall(name, inputTokens, outputTokens, durMs) {...}
export function getToolStats(): ToolStat[] {...}
```

后续可暴露给设置页 / debug 页。

### D9：goal-driver 拆分子目录

```
src/main/agent/goal/
├─ index.ts            # runGoalDriver 入口
├─ plan.ts             # defaultPlanChecklist
├─ run-burst.ts        # defaultRunBurst（graph invoke）
├─ verify-phase.ts     # runVerifyPhase + audit
├─ check-round.ts      # runCheckRound（验收命令）
├─ conclude.ts         # concludeAfterChecks
└─ deliver.ts          # defaultDeliver
```

每个文件 < 200 行，单一职责。

### D10：修 render 中写 ref 反模式

```typescript
// 旧（ChatWorkspace.tsx:53）：render 中直接写 ref
currentSessionIdRef.current = sessionId

// 新：用 useEffect 同步
useEffect(() => {
  currentSessionIdRef.current = sessionId
}, [sessionId])
```

## Risks / Trade-offs

- [Risk] 流式 invoke 可能影响 token 计算（usage_metadata 在 stream 末尾）→ Mitigation：在 final chunk 后再加一次 `tokensOf(res)`
- [Risk] Zustand 加运行时依赖（~3 KB gz）→ 接受（小）
- [Risk] react-virtuoso 加运行时依赖（~10 KB gz）→ 接受（小，长会话必备）
- [Risk] ChatWorkspace 拆分可能短期降低开发效率（多文件）→ 长期收益（可测 / 可复用）
- [Risk] tool-stats 可能 hot path 有 perf 开销 → 用简单 Map（不每次分配对象）

## Migration Plan

- 不破坏现有 IPC 协议：仅扩展事件类型
- 不破坏现有测试：旧测试照常通过
- 不破坏现有 renderer：ChatWorkspace 拆分是内部重构

## Open Questions

1. 流式事件要不要可配置关闭（开关在 SettingsPanel）？ → v2 决定
2. tool-stats 要不要在 UI 暴露？ → v2 决定
3. 工具折叠 / 摘要要哪种交互？ → 默认折叠，hover展开
PROPOSAL_EOF
echo "design.md: $(wc -l < /Users/xuzhihao/Projects/my-agent/openspec/changes/agent-optimize/design.md) lines"