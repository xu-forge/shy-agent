# Stage 1 总结 — Agent 编排重构

> **状态**: Step 1.1 - 1.4 完成,Step 1.5 (集成 + E2E) 待用户授权后开始
> **总进度**: Stage 1 完成 80%(4/5 step)
> **总测试**: 229 passed | 13 skipped (242) — 零失败
> **总类型检查**: 通过

---

## 1. 4 步全景对比

| Step | 内容 | 新增文件 | 删除文件 | 改动文件 | 测试增量 | 风险 |
|---|---|---|---|---|---|---|
| 1.1 砍 workflow | 删除整个 workflow 引擎(12 文件),加 migration 备份 | 0 | 12 | 20+ | 0(原 183 全过) | 低(全删) |
| 1.2 sub-agent 派活 | 4 个 task 工具 + subagent 池 + 并发上限 3 | 7 | 0 | 1 | +14 | 中 |
| 1.3 5 状态机 | GoalStatus 5 状态 + 3 surface + 8 个 apply* 纯函数 | 5 | 0 | 0 | +23 | 低(纯函数) |
| 1.4 8 步 turn-runner | 显式 8 步生命周期 + runTurn 主入口 | 5 | 0 | 0 | +9 | 中(独立模块) |
| **合计** | | **+17** | **-12** | **~21** | **+46** | |

---

## 2. 新增模块(架构总览)

### 2.1 `src/main/agent/subagent/` (Step 1.2)

```
subagent/
├── types.ts          3 种 type + 6 状态 + budget + 工具白名单
├── store.ts          SQLite 落盘 + 6 个 CRUD
├── runner.ts         跑单 sub-agent(budget + 工具过滤)
└── types.test.ts / store.test.ts
```

**亮点**:完全对齐 minimax mavis-12 `canonical-tool-policy.ts` 思路,subagent_type 通过白名单决定可见工具集。

### 2.2 `src/main/agent/goal/` (Step 1.3)

```
goal/
├── types.ts          GoalStatus 5 状态 + 3 surface 元数据
├── state.ts          8 个纯函数(canTransition + 4 个 apply*)
├── service.ts        bridge RunStatus ↔ GoalStatus
└── state.test.ts / service.test.ts
```

**亮点**:25 状态对全覆盖测试(17 合法 + 8 非法)+ 自我转换允许 + complete 终态拒绝转出。

### 2.3 `src/main/agent/turn-runner/` (Step 1.4)

```
turn-runner/
├── types.ts          8 步枚举 + TurnInput + TurnResult + 6 事件
├── lifecycle.ts      8 个纯函数
├── index.ts          runTurn 主入口(LLM + ToolNode + 工具循环)
└── lifecycle.test.ts / index.test.ts
```

**亮点**:每步独立 emit `step:start/step:end(durationMs)`,错误兜底不抛,单 turn 内最多 8 个 tool_call 防死循环。

---

## 3. 关键设计决策(供 review)

### 决策 1:Step 1.3 不集成 goal-driver.ts(留作 Step 1.5)

**理由**:goal-driver.ts 是 675 行大文件,内部状态机散落。改它风险太高。  
**做法**:5 状态机作为**纯函数模块**独立测通,`service.ts:runStatusToGoalStatus` 做桥接。  
**代价**:业务还在用旧 RunStatus,Step 1.5 才统一。

### 决策 2:Step 1.4 不集成 service.ts(留作 Step 1.5)

**理由**:service.ts 528 行 + graph.ts 381 行,LangGraph 替换是大手术。  
**做法**:新 turn-runner 作为**独立模块**测通,文档说"Step 1.5 集成时切换"。  
**代价**:runtime 多一份代码,Step 1.5 才删除 LangGraph。

### 决策 3:砍 workflow 引擎(完全删除,不是 hide)

**理由**:你原话"鸡肋 + 没做好",没有保留价值。  
**做法**:12 文件全删 + 数据库 DROP + 备份到 `~/.shy/migration-backup/`。  
**好处**:UI 更干净(少 1 个 nav),代码更简单(少 381 行),专注 sub-agent 派活。  
**保留**:`WorkflowSchedule` 类型(可交互式 cron 配置,跟 schedule 模块一起),`ScheduleEditor` 组件。

### 决策 4:Sub-agent 并发上限 3

**理由**:3 个 sub-agent 一起跑能 cover "调研 XX 行业" 类任务;再多会烧 token + UI 混乱。  
**做法**:`SUBAGENT_MAX_CONCURRENT = 3` 常量,`task` tool 入口检查。  
**改法**:如果不够,改这个常量即可,无需改逻辑。

### 决策 5:8 步 turn-runner 工具调用循环上限 8

**理由**:LLM 偶尔会无限循环(工具一直出错),需要硬保险丝。  
**做法**:`maxLoops = 8` 在 `index.ts:140`,超过返回 status='errored'。  
**改法**:如果合理(比如 plan-act-verify 多步任务),改这个常量。

---

## 4. 跟 minimax 的对照(完成度)

| 维度 | shy 重构后 | minimax | 状态 |
|---|---|---|---|
| **8 步 turn-runner** | ✅ 独立模块 | ✅ mavis-06 | 已对齐(代码未集成) |
| **5 状态机** | ✅ 纯函数 + 3 surface | ✅ mavis-07 | 已对齐(代码未集成) |
| **3 surface 不对称** | ✅ LLM 屏蔽 budget_limited | ✅ mavis-07 | 已对齐 |
| **Sub-agent 派活** | ✅ 4 工具 + 3 type | ✅ mavis-09 §1.6 | 已对齐 + 已注册 |
| **工具白名单** | ✅ SUBAGENT_TOOL_ALLOWLIST | ✅ mavis-12 | 已对齐 |
| **Blocked audit 阈值** | ✅ 默认 3 | ✅ mavis-07 | 已对齐 |
| **Stagnation audit** | ✅ 默认 20 轮 | ✅ minimax | 已对齐 |
| **Cooldown 6h/15min** | ❌ 未实现 | ✅ mavis-09 §3.4 | Stage 2 待做 |
| **System-reminder provider 链** | ❌ 未实现 | ✅ mavis-09 | Stage 2 待做 |
| **Tool description 8 段式** | ❌ 未实现 | ✅ mavis-09 | Stage 2 待做 |
| **Context 4 档压缩** | ❌ 关键词正则 | ✅ mavis-08 | Stage 2 待做 |
| **Event bridge 1-to-N** | ❌ callback emit | ✅ mavis-13 | Stage 3 待做 |
| **UI minimax 布局** | ❌ 旧 layout | ✅ mavis-04 | Stage 4 待做 |

**Stage 1 完成了 ~70% minimax 的 agent 编排能力。** Stage 2-4 完成 prompt + event + UI 后,基本就齐了。

---

## 5. Step 1.5 集成 — 大手术详情(供决策)

### 5.1 改动范围

| 文件 | 改动量 | 风险 |
|---|---|---|
| `src/main/agent/service.ts` (528 行) | while-true 段循环(~140 行)→ 调 `runTurn()` | 中(单 LLM 循环改成 8 步,但段式续跑保留) |
| `src/main/agent/goal-driver.ts` (675 行) | 状态转换段(182-403 行,约 220 行)→ 调 `goal/state.ts` 纯函数 | 中(5 状态机替换,verify-llm 集成) |
| `src/main/agent/graph.ts` (381 行) | 整个文件删除(LangGraph 替换) | 低(全删) |
| `@langchain/langgraph` 依赖 | 从 `package.json` 删 | 低 |

### 5.2 验证

- [ ] `npm run typecheck` 通过
- [ ] `npm run test` 全部通过
- [ ] **手工 E2E**:
  - 交互式模式:发消息 → LLM 回复 + 调 tool → 工具结果 → 下一轮
  - 目标模式:设目标 → plan → act 循环 → verify → 标 complete
  - 段式续跑(60 步超限自动续段)— 跟重构前一致
  - 5 状态机:paused 可 resume,complete 不能继续,budget_limited 可 reopen
  - 5 个 sub-agent 派活用例:foreground / background / blocking / cancel / 并发上限

### 5.3 时间估算

- 1-2 天
- 不需要新建模块,纯改 + 跑测试

### 5.4 风险 + 缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LangGraph 移除后行为偏差 | 高 | 旧 `service.test.ts` 测跑 + 手工 E2E 对照 |
| 5 状态机转换遗漏边界 | 中 | state.test.ts 已经覆盖 17 个合法 + 8 个非法转换 |
| 段式续跑丢失 | 中 | runTurn() 内部已经支持 status='continue' + nextStep,只要 caller 检查后循环调 runTurn |
| 集成测试时间不够 | 低 | 可以拆成两个 commit:runTurn 集成 + 5 状态机集成 |

---

## 6. 文件清单(本 Stage 改动)

### 删除(-12)
- `src/main/workflows/db.ts`, `engine.ts`, `manager.ts`, `scheduler.ts` (4 source + 3 test)
- `src/renderer/src/components/WorkflowEditor.tsx`
- `src/renderer/src/components/WorkflowScheduleEditor.tsx`
- `src/renderer/src/components/WorkflowsView.tsx`
- `src/shared/workflow-format.ts`

### 新增(+17)
```
src/main/agent/subagent/types.ts
src/main/agent/subagent/store.ts
src/main/agent/subagent/runner.ts
src/main/agent/subagent/types.test.ts
src/main/agent/subagent/store.test.ts
src/main/agent/goal/types.ts
src/main/agent/goal/state.ts
src/main/agent/goal/service.ts
src/main/agent/goal/state.test.ts
src/main/agent/goal/service.test.ts
src/main/agent/turn-runner/types.ts
src/main/agent/turn-runner/lifecycle.ts
src/main/agent/turn-runner/index.ts
src/main/agent/turn-runner/lifecycle.test.ts
src/main/agent/turn-runner/index.test.ts
src/main/agent/tools/builtin/task.ts
src/main/agent/tools/builtin/task.test.ts
```

### 修改(~21)
```
package.json                                              删 @xyflow/react
src/shared/ipc.ts                                         删 workflow 7 IPC + 8 type
src/main/index.ts                                         加 dropLegacyWorkflowTables
src/main/migration.ts                                     加 dropLegacyWorkflowTables 函数
src/main/paths.ts                                         加 migrationBackupDir
src/main/ipc.ts                                           删 workflow handlers
src/main/schedule/{expand,ipc,runner,store}.ts + .test    删 run_workflow 引用
src/main/schedule/scheduler.ts                            从 workflows 迁过来
src/main/schedule/scheduler-loop.ts                       新增
src/preload/{index.ts,index.d.ts}                         删 7 个 workflow IPC
src/renderer/src/App.tsx                                  删 editingWorkflow state
src/renderer/src/components/Sidebar.tsx                   删 workflows nav
src/renderer/src/components/CalendarView.tsx              删 workflow 引用
src/renderer/src/components/ScheduleEditor.tsx            新增(从 WorkflowScheduleEditor 改名)
src/renderer/src/components/CalendarView.test.ts          删 run_workflow 测试
src/main/agent/tools/builtin.ts                           加 registerTaskTools()
src/main/agent/llm-client.ts                              修 zod 兼容
src/main/agent/llm-client.test.ts                         加 asFunction helper
```

---

## 7. 一句话

**Stage 1 在不动业务逻辑的前提下,把 shy 的 agent 编排从"LangGraph 黑盒 + 散落状态"重构成了"8 步可观测 + 5 状态机 + 4 sub-agent 工具"的 minimax 风格骨架。** 集成(switch over)是 Step 1.5 的事,需要你明确授权。

---

## 8. 接下来做什么 — 4 个选项

### A.「继续 Step 1.5 集成」(1-2 天)
按上面 5.1 改动 service.ts / goal-driver.ts,删 graph.ts,跑全测试 + 手工 E2E。**Stage 1 收官。**

### B.「先做 Stage 2 Prompt 设计」(3-5 天)
跳过集成,先做 8 段式 tool description + 4 类 system-reminder provider 链 + cooldown/critical 机制。**Stage 1 集成留到 Stage 2 之后。**

### C.「先做 Stage 4 UI 重构」(5-8 天)
跳过 Stage 1.5,直接做左 sidebar + 中对话 + 右 inspector + 底 composer 的 minimax 布局。**Step 1.4 turn-runner 的可观测性是 UI 重构的好基础。**

### D.「暂停 review」
你 review 这 17 个新增 + 21 个修改文件,确认 Stage 1 质量后再决定。

我倾向**A 或 B**:
- A 风险低,1-2 天就能 Stage 1 收官
- B 把 Stage 1 留个"未集成"状态直接进 Stage 2,但 Stage 2 做的 8 段式 tool description 已经在 task.ts 里有了,可以先复用

**你的选择?**
