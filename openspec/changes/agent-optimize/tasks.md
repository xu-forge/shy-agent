# Tasks: agent-optimize

## Phase 1：ReAct 流程强化

- [ ] 1.1 新建 `src/main/agent/react-prompt.ts`
- [ ] 1.2 graph.ts act / plan 加 ReAct 引导
- [ ] 1.3 verify-llm.ts 加 ReAct 引导
- [ ] 1.4 goal-context.ts 加 react_framework 段
- [ ] 1.5 react-prompt.test.ts + goal-context.test.ts 更新

## Phase 2：流式渲染

- [ ] 2.1 shared/ipc.ts 迁移 AgentEvent + 加 assistant_delta
- [ ] 2.2 service.ts AgentEvent re-export
- [ ] 2.3 goal-driver.ts defaultRunBurst 改 stream
- [ ] 2.4 useAgentEvents hook + 单测
- [ ] 2.5 ChatWorkspace 流式合并（Zustand）

## Phase 3：UI / 组件拆分

- [ ] 3.1 Composer 组件
- [ ] 3.2 MessageList + MessageItem（react-virtuoso）
- [ ] 3.3 Suggestions + StatusBar
- [ ] 3.4 ErrorBoundary
- [ ] 3.5 ChatWorkspace 瘦身 < 100 行
- [ ] 3.6 单测：Composer / MessageItem / useAgentEvents

## Phase 4：Tool / Function Call

- [ ] 4.1 builtin.test.ts + computer.test.ts
- [ ] 4.2 get_goal verbosity（summary / full）
- [ ] 4.3 tool-stats 模块 + 单测
- [ ] 4.4 修 render 中写 ref 反模式
- [ ] 4.5 tool schema .strict()

## Phase 5：架构 / 性能

- [ ] 5.1 goal-driver 拆分到 goal/ 子目录
- [ ] 5.2 Zustand store + react-virtuoso 依赖
- [ ] 5.3 docs/product-brief.md 加节

## Phase 6：验证

- [ ] 6.1 npm run typecheck
- [ ] 6.2 npm run lint
- [ ] 6.3 npm test（161+ 测试）
- [ ] 6.4 npm run test:coverage
- [ ] 6.5 npm run dev 启动验证
- [ ] 6.6 retrospective.md
