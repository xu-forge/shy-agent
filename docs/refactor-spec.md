# shy 重构 Spec — 全栈按 minimax 设计思路重构

> **状态**: 草案,等用户确认后开始执行
> **目标**: 把 shy(个人 Electron Agent 客户端)按 minimax 的设计思路全栈重构
> **参考**: minimax(MiniMax Code)22 个 `@mavis/*` 包的设计模式 + 8 原则 prompt 哲学
> **位置**: 原地改 `~/Projects/my-agent`
> **范围**: 4 层都改 — Agent 编排 / Prompt 设计 / 事件数据流 / UI 界面
> **workflow engine**: 完全砍掉,转 sub-agent 派活
> **优先级**: 先做阶段 1(Agent 编排),后续阶段在前一阶段验证后启动

---

## 0. 一句话目标

把 shy 从「个人玩具级 Electron Agent」重构为「准企业级本地 Agent」,核心差异:

| 维度 | shy 当前 | 重构后 |
|---|---|---|
| Agent 编排 | LangGraph 3 节点 plan/act/tools + verify-llm inline | 显式 8 步 pi-turn-runner + plan/act/verify 三阶段独立 |
| Sub-agent | ❌ 无 | ✅ `task` / `task_output` / `task_query` / `task_stop` 4 工具 |
| 状态机 | 散在 LangGraph + service.ts | 5 状态机(active/paused/complete/blocked/budget_limited)+ 3 surface 分离 |
| 提示词 | 1 句 description + 一次性 system 拼接 | 8 原则 tool description + system-reminder 4 类 provider 链 |
| System reminder | 直接拼接到 system | 25+ provider 链式注入,cooldown 6h/15min,critical 标记 |
| 事件流 | callback `emit` | event-bridge 1-to-N 翻译层 + 单一 schema |
| UI | 单 panel + sidebar | 左 sidebar + 主对话 + 右 inspector + 底 composer(minimax 布局) |
| 压缩 | 关键词正则 | 4 档压缩(soft-trim / hard-trim / summary / LLM-summary) |
| Workflow | ReactFlow + DAG | ❌ 砍掉,sub-agent 派活替代 |

---

## 1. 4 阶段总览

### 阶段 1: Agent 编排(本次详细) ⬅️ 优先

**改动文件**:
- `src/main/agent/turn-runner.ts` (新增) — 8 步生命周期,参考 `mavis-06 pi-turn-runner`
- `src/main/agent/goal/state.ts` (新增) — 5 状态机,3 surface,参考 `mavis-07`
- `src/main/agent/goal/service.ts` (新增) — 状态转换 + audit
- `src/main/agent/subagent/runner.ts` (新增) — 后台 sub-agent 派活
- `src/main/agent/subagent/store.ts` (新增) — 任务存储
- `src/main/agent/tools/builtin/task.ts` (新增) — `task` / `task_output` / `task_query` / `task_stop` 4 工具
- `src/main/agent/service.ts` (大改) — 改用新 turn-runner,移除 LangGraph 直接依赖
- `src/main/agent/goal-driver.ts` (大改) — 改用 goal state machine
- `src/main/agent/graph.ts` (删除) — LangGraph 移除
- `src/main/agent/verify-llm.ts` (改) — 拆成独立 verify 阶段
- `src/main/agent/tools/builtin.ts` (改) — 工具按 minimax 风格重组
- `src/main/workflows/**` (删除) — 砍掉整个目录

**关键 API**:
```ts
// turn-runner 主入口
async function runTurn(input: TurnInput): Promise<TurnResult>

// 5 状态机
type GoalStatus = 'active' | 'paused' | 'complete' | 'blocked' | 'budget_limited'

// sub-agent 派活
type TaskToolInput = {
  description: string
  prompt: string
  subagent_type: 'explore' | 'worker' | 'verifier'
  run_in_background: boolean
}
```

**验证标准**:
- [ ] `npm run typecheck` 通过
- [ ] `npm run test` 全部通过
- [ ] 跑交互式模式:发送消息 → LLM 回复 + 调 tool → tool result → 下一轮(对比重构前行为)
- [ ] 跑目标模式:设目标 → plan → act 循环 → verify → 标 complete(对比重构前)
- [ ] 跑 sub-agent 派活:`task(subagent_type='explore')` → 返回结果
- [ ] 跑后台 sub-agent:`task(run_in_background=true)` → 拿 task_id → `task_output` 拉结果
- [ ] 段式续跑(60 步超限自动续段)— 跟重构前一致
- [ ] 5 状态机:paused 可 resume,complete 不能继续,budget_limited 可 reopen
- [ ] workflow 目录完全删除,`git grep` 不到 `workflow`

### 阶段 2: Prompt 设计 + system-reminder 框架

**改动文件**:
- `src/main/agent/prompts/tools/*.ts` (新增) — 每个工具独立 prompt 文件,8 段式
- `src/main/agent/prompts/system-reminder/types.ts` (新增)
- `src/main/agent/prompts/system-reminder/registry.ts` (新增)
- `src/main/agent/prompts/system-reminder/providers/*.ts` (新增) — 4 类 provider
- `src/main/agent/prompts/system-reminder/service.ts` (新增)
- `src/main/agent/prompts/react-prompt.ts` (改) — 拆分 plan/act/verify 独立 prompt
- `src/main/agent/tools/builtin.ts` (改) — description 从 1 句扩到 4-6 段

**4 类 provider**:
1. **identity provider** — 身份/模式/会话 ID(turn 1 full, turn 2+ slim)
2. **platform provider** — OS / shell / 路径 / 权限层
3. **progress provider** — 目标/验收清单/当前段/进度
4. **memory provider** — 长期记忆摘录 + 短期压缩态

**cooldown 机制**:
- `bootstrap`: 6h(首次启动)
- `persona_missing`: 6h(用户没设人设)
- `user_profile_missing`: 15min(引导用户建档案)
- `task_completion_reminder`: 5min(任务完成)
- 4 类 `appendCritical` 强制注入

**验证标准**:
- [ ] 工具 description 平均 80-200 词
- [ ] system-reminder 链按注册顺序跑
- [ ] cooldown 命中时不输出 block
- [ ] critical provider 即使 SR 关闭也跑
- [ ] 4 类 provider 都有独立单测

### 阶段 3: 事件流 / 数据流重构

**改动文件**:
- `src/shared/event-schema.ts` (新增) — 单一事件 schema 枚举
- `src/main/event-bridge/index.ts` (新增) — main 端 event bus
- `src/preload/event-bridge.ts` (新增) — 跨 IPC 桥
- `src/renderer/src/lib/event-bridge.ts` (新增) — renderer 端订阅
- `src/renderer/src/lib/agent-event-store.ts` (新增) — 事件归约 store
- `src/shared/ipc.ts` (改) — 拆出事件 schema
- 所有 `emit()` 调用点改用新 bus

**事件 schema**:
```ts
type AgentEvent =
  | { type: 'session.started'; sessionId: string }
  | { type: 'goal.updated'; goal: string; checklist: ChecklistItem[] }
  | { type: 'task.added'; id: string; title: string; source: 'goal' | 'agent' }
  | { type: 'task.updated'; id: string; done: boolean; evidence?: string }
  | { type: 'task.removed'; id: string }
  | { type: 'turn.started'; turnId: string }
  | { type: 'turn.assistant_delta'; content: string }
  | { type: 'turn.assistant_done'; toolCalls?: ToolCall[] }
  | { type: 'turn.tool_call'; name: string; input: unknown; id: string }
  | { type: 'turn.tool_result'; id: string; output: unknown; error?: string }
  | { type: 'subagent.started'; taskId: string; description: string }
  | { type: 'subagent.progress'; taskId: string; message: string }
  | { type: 'subagent.completed'; taskId: string; output: unknown }
  | { type: 'subagent.failed'; taskId: string; error: string }
  | { type: 'goal.status_changed'; from: GoalStatus; to: GoalStatus; reason?: string }
  | { type: 'session.paused'; reason: 'user' | 'budget' | 'stagnation' | 'safety' }
  | { type: 'session.resumed' }
  | { type: 'session.completed'; result: string; reportPath?: string }
  | { type: 'session.error'; message: string; fatal: boolean }
  | { type: 'system_reminder.injected'; provider: string; block: string }
  | { type: 'audit.completion'; eachSatisfied: boolean; requirements: string[] }
  | { type: 'audit.blocked'; sameCondition: boolean; reason: string; rounds: number }
```

**验证标准**:
- [ ] 所有 emit 调用点迁移完成
- [ ] renderer 端用 `useAgentEvents` hook 订阅
- [ ] 事件归约正确(同一 type 后到达不覆盖前到达)
- [ ] 跨 preload 桥接正确(主进程 → renderer)
- [ ] 旧 `AgentEvent` 类型完全移除

### 阶段 4: UI 界面重构

**改动文件**:
- `src/renderer/src/App.tsx` (重写) — minimax 布局
- `src/renderer/src/components/Sidebar/*` (新增) — 会话列表 + 模式切换
- `src/renderer/src/components/ChatWorkspace/*` (新增) — 主对话
- `src/renderer/src/components/Inspector/*` (新增) — 任务进度 / 记忆 / 技能
- `src/renderer/src/components/Composer/*` (新增) — 底部输入
- `src/renderer/src/components/MessageItem/*` (新增) — 单条消息
- `src/renderer/src/components/ToolCallCard/*` (新增) — 工具调用卡片
- 旧 `Sidebar.tsx` / `SessionPanel.tsx` / `ChatWorkspace.tsx` 等大文件拆分

**minimax 布局**:
```
┌─────────┬──────────────────────────────┬──────────────┐
│         │  ┌──────────────────────┐    │              │
│ Side    │  │                      │    │  Inspector   │
│ bar     │  │   Chat Workspace     │    │  - Goal      │
│         │  │                      │    │  - Tasks     │
│ - Logo  │  │   - Messages         │    │  - Memory    │
│ - 模式  │  │   - Tool cards       │    │  - Skills    │
│ - 列表  │  │   - Sub-agent live   │    │  - Settings  │
│ - 设置  │  │                      │    │              │
│         │  └──────────────────────┘    │              │
│         │  ┌──────────────────────┐    │              │
│         │  │      Composer         │    │              │
│         │  └──────────────────────┘    │              │
└─────────┴──────────────────────────────┴──────────────┘
```

**验证标准**:
- [ ] 三栏布局(左 240px / 中 flex / 右 320px)
- [ ] sub-agent 实时进度(独立卡片)
- [ ] tool call 可折叠展开(input/output)
- [ ] 模式切换:交互式 ↔ 目标(右上 toggle)
- [ ] 检查清单实时更新(done 数 + 进度条)
- [ ] 高危操作 confirm 弹窗(minimax 风格)

---

## 2. 阶段 1 详细设计 — Agent 编排

### 2.1 8 步 turn-runner

**参考**: `mavis-packages/agent-core/pi-turn-runner` (8 步生命周期)

**8 步**:
```
[1] incrementTurn        → turn counter 自增
[2] collect input         → 收集本轮 input(用户消息 / 自动续段 / 续 resume)
[3] build context         → 拿历史 + system reminder + skill block + memory block
[4] call LLM              → 流式调用,emit content_delta
[5] handle tool calls     → 解析 tool_calls,emit tool_call 事件
[6] run tools             → 执行工具,emit tool_result
[7] append to history     → 把本轮 assistant + tool_result 写入 history
[8] decide next           → 工具调用 → 跳到 [6] 跑下一个;无 → done
```

**API**:
```ts
// src/main/agent/turn-runner.ts
export type TurnInput = {
  sessionId: string
  goal?: GoalContext
  history: Message[]
  tools: Tool[]
  emit: (event: AgentEvent) => void
  signal?: AbortSignal
  budget: Budget
}

export type TurnResult = {
  status: 'continue' | 'done' | 'blocked' | 'paused' | 'cancelled'
  toolCallsExecuted: number
  tokenUsed: number
  finalMessage: string
}

export async function runTurn(input: TurnInput): Promise<TurnResult>
```

**关键设计**:
- **不再用 LangGraph StateGraph** — 显式 8 步,容易测
- **每步可观测** — emit 中间状态
- **token / step budget 集中管** — `Budget` 类型
- **abort 信号贯穿** — 用户取消立刻停

### 2.2 5 状态机 + 3 surface

**参考**: `mavis-packages/goal` (5 状态)

**5 状态**:
```ts
type GoalStatus =
  | 'active'           // 正常推进
  | 'paused'           // 用户主动暂停 / 停滞 / 预算
  | 'complete'         // 全部完成
  | 'blocked'          // 3 轮同条件未解决
  | 'budget_limited'   // token 用尽
```

**3 surface**:
1. **LLM surface** — LLM 能看到 `active` / `paused` / `complete` / `blocked`(不可见 `budget_limited`)
2. **Renderer surface** — 看到全部 5 状态
3. **Internal surface** — 看到全部 + 中间态(creating / resuming / archiving)

**转换图**:
```
       ┌─→ active ──→ complete
       │     │
       │     ↓
new ──┤   paused ──→ active(resume)
       │     │
       │     ↓
       │   blocked ──→ active(用户决策后)
       │     │
       │     ↓
       └─ budget_limited ──→ active(用户加预算)
```

**API**:
```ts
// src/main/agent/goal/state.ts
export type GoalState = {
  status: GoalStatus
  goal: string
  checklist: ChecklistItem[]
  runStatus: 'idle' | 'planning' | 'acting' | 'verifying' | 'completing'
  blockedRounds: number
  stagnantRounds: number
  tokenUsed: number
  paused: boolean
  checkpoint: string | null
  resultContent: string | null
  resultReportPath: string | null
}

export function canTransition(from: GoalStatus, to: GoalStatus): boolean
export function applyBlockedAudit(state: GoalState, blocked: VerifyBlockedOutput): GoalState
export function applyStagnation(state: GoalState, passedBefore: number, passedAfter: number): GoalState
```

### 2.3 Sub-agent 派活(替代 workflow)

**4 个工具**:
1. **`task`** — 派活(foreground / background)
2. **`task_output`** — 拉后台任务输出
3. **`task_query`** — 查任务状态
4. **`task_stop`** — 停任务

**8 段式 prompt**(抄 `mavis-09 §1.6`):

> **Task tool description**:
>
> 启动一个 sub-agent 自主处理复杂、多步骤任务。
>
> 用于广度调研、可并行的调查、委托实现。**不要**用于定点文件读取、grep 式代码搜索,或更简单、可以直接完成的工作。
>
> 前台调用是无状态的、一次性的任务,最终结果只返回给你。后台调用会立刻返回一个 task id,用后台任务控制工具(task_query/task_output/task_stop)查询、读输出或停止。

**subagent_type**:
- `explore` — read-only,可调 search/read/grep,不能 write/edit
- `worker` — 全工具(主 agent 的子集)
- `verifier` — read-only + LLM 自检,产出结构化结果

**API**:
```ts
// src/main/agent/subagent/runner.ts
export type SubagentTask = {
  id: string
  parentSessionId: string
  description: string
  prompt: string
  subagentType: 'explore' | 'worker' | 'verifier'
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  output?: string
  error?: string
  createdAt: number
  completedAt?: number
}

export async function startSubagent(input: SubagentTask): Promise<SubagentTask>
export async function runSubagent(task: SubagentTask): Promise<SubagentTask>
```

**事件流**:
```
subagent.started    →  taskId, description
subagent.progress   →  taskId, message
subagent.completed  →  taskId, output
subagent.failed     →  taskId, error
```

### 2.4 砍掉 workflow 目录

**删除**:
- `src/main/workflows/db.ts`
- `src/main/workflows/engine.ts`
- `src/main/workflows/manager.ts`
- `src/main/workflows/scheduler.ts`
- `src/main/workflows/*.test.ts`
- `src/renderer/src/components/WorkflowEditor.tsx`
- `src/renderer/src/components/WorkflowScheduleEditor.tsx`
- `src/renderer/src/components/WorkflowsView.tsx`
- 数据库表 `workflows` / `workflow_runs`

**保留 + 改造**:
- `src/main/schedule/**` — 改为"定时任务"(类似 cron,跑预设 sub-agent)
- `src/renderer/src/components/CalendarView.tsx` — 改名为"定时任务"视图

### 2.5 目录变化预览

**重构前**:
```
src/main/agent/
├── blocked-audit.ts
├── boot-resume.ts
├── checks.ts
├── goal-context.ts
├── goal-driver.ts          # 675 行
├── goal-policy.ts
├── goal-resume.ts
├── goal-tools.ts
├── graph.ts                # 381 行
├── llm-client.ts
├── react-prompt.ts
├── run-log.ts
├── service.ts              # 528 行
├── token-usage.ts
├── tool-stats.ts
├── tools/
│   ├── builtin.ts          # 232 行
│   ├── computer.ts
│   └── registry.ts
├── verify-llm.ts
└── ...
```

**重构后**:
```
src/main/agent/
├── turn-runner.ts          # 新,8 步
├── service.ts              # 改,薄壳,调 turn-runner
├── goal/
│   ├── state.ts            # 新,5 状态机
│   ├── service.ts          # 新,转换 + audit
│   └── types.ts
├── subagent/
│   ├── runner.ts           # 新,sub-agent 派活
│   ├── store.ts            # 新,任务存储
│   └── types.ts
├── prompts/
│   ├── tools/              # 新,各工具独立 prompt
│   └── react-prompt.ts     # 改
├── tools/
│   ├── builtin/
│   │   ├── shell.ts
│   │   ├── fs.ts
│   │   ├── memory.ts
│   │   ├── skill.ts
│   │   ├── goal.ts         # 新,get_goal / update_goal
│   │   └── task.ts         # 新,4 个 sub-agent 工具
│   ├── computer.ts
│   └── registry.ts
├── llm-client.ts           # 保留
├── checks.ts               # 保留
├── blocked-audit.ts        # 保留
├── run-log.ts              # 保留
└── ...
```

### 2.6 数据迁移

**数据库 schema 变化**:
- 新增 `subagent_tasks` 表
- 保留 `long_memory` / `short_memory` / `session_files` / `session_tasks` / `schedule_tasks` / `memory_audit`
- 删除 `workflows` / `workflow_runs` / `workflow_run_logs` 表
- 给 `sessions` 表加 `goal_status` 字段(用枚举 string 存)

**migration 步骤**:
1. 新加列(用 `ALTER TABLE ... ADD COLUMN`,try/catch 跳过已存在)
2. 删除 workflow 表前给一次备份(写到 `~/.shy/migration-backup/`)
3. UI 上显示「已迁移:删除了 N 个旧工作流」

### 2.7 测试策略

**保留测试**:
- `goal-policy.test.ts` — 状态转换
- `blocked-audit.test.ts` — 阈值判定
- `checks.test.ts` — 验收命令
- `llm-client.test.ts` — 流式累积
- `goal-context.test.ts` — prompt 拼装

**新增测试**:
- `turn-runner.test.ts` — 8 步生命周期
- `goal/state.test.ts` — 5 状态机转换
- `goal/service.test.ts` — audit + 停滞判定
- `subagent/runner.test.ts` — 派活 + 后台拉取
- `tools/task.test.ts` — 4 工具 schema

**mock 策略**:
- LLM 调 `vi.mock('./llm-client')` — 不真调 API
- 数据库用 in-memory SQLite
- emit 收所有事件做断言

### 2.8 风险点 + 缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| LangGraph 移除后行为偏差 | 高 | 旧 `service.test.ts` + 手工跑交互式/目标模式对照 |
| 5 状态机转换遗漏边界 | 中 | 全状态对枚举测试(5×5=25 种) |
| Sub-agent 后台跑死循环 | 中 | token + step budget 跟主 agent 一样 |
| workflow 删了用户原数据 | 低 | 备份到 `~/.shy/migration-backup/` + 启动弹通知 |
| 段式续跑时 sub-agent 状态丢失 | 中 | subagent_tasks 落盘 SQLite,跨段可查 |

---

## 3. 阶段 1 实施步骤(详细)

按下面顺序,每步独立 commit,方便 review:

### Step 1.1: 砍 workflow + 数据迁移 (1-2 天)

1. 备份现有数据
2. 删 `src/main/workflows/**` + `WorkflowEditor` 等 UI
3. 加 `subagent_tasks` 表
4. 跑 `npm run typecheck` + `npm run test`

### Step 1.2: 新增 sub-agent 派活 (2-3 天)

1. 写 `subagent/runner.ts` + `subagent/store.ts`
2. 写 4 个 task 工具 builtin
3. 单测:派活 + 后台拉取 + 取消
4. 跟 `service.ts` 集成(暂时用旧 service)

### Step 1.3: 写 5 状态机 (1-2 天)

1. 写 `goal/state.ts` + `goal/service.ts`
2. 写 `goal/types.ts`
3. 单测:全状态对转换
4. 跟 `goal-driver.ts` 集成(暂时用旧 LangGraph)

### Step 1.4: 写 8 步 turn-runner (2-3 天)

1. 写 `turn-runner.ts`
2. 把 `graph.ts` 的 plan/act/tools 拆成显式步骤
3. 单测:每步独立 + 完整 8 步
4. 跟 `service.ts` 集成,移除 LangGraph 依赖

### Step 1.5: 集成 + E2E 测试 (1-2 天)

1. 跑交互式模式对照(重构前 vs 后)
2. 跑目标模式对照
3. 跑 sub-agent 派活
4. 跑段式续跑
5. 跑高危操作 confirm

---

## 4. 验证 / 验收

**阶段 1 完成的标志**:
- [ ] `git grep "workflow"` 在 `src/main` / `src/renderer` 下 0 命中
- [ ] `package.json` 不再有 `reactflow` / `@xyflow/react` 依赖
- [ ] `npm run typecheck` 通过
- [ ] `npm run test` 100% 通过(原 + 新)
- [ ] 手工跑 5 模式(交互 / 目标 / sub-agent 前台 / sub-agent 后台 / 段式续跑)都正常
- [ ] 5 状态机转换覆盖测试 100%(5×5=25 状态对)

**用户能立即感知的变化**:
- 主对话可以「派一个 explore agent 帮我搜资料」
- 目标模式跑长任务可并行 3-5 个 sub-agent
- 段式续跑更稳(无 LangGraph 黑盒)
- workflow 整个砍掉,UI 更干净
- 主 agent 的 graph 状态可观测(每步 emit 事件)

---

## 5. 时间估算

| 阶段 | 工作量 | 备注 |
|---|---|---|
| 阶段 1 Agent 编排 | 7-12 天 | 含测试 + 集成 |
| 阶段 2 Prompt + SR | 3-5 天 | 改动小,主要是内容创作 |
| 阶段 3 事件流 | 3-5 天 | 全栈迁移,要小心 |
| 阶段 4 UI 重构 | 5-8 天 | 最大工作面 |
| **合计** | **18-30 天** | solo,全栈 |

> 阶段 2-4 的详细 spec 在阶段 1 完成后启动,届时根据阶段 1 经验微调。

---

## 6. 风险声明

- **API 兼容性**: 重构期间会有一段「旧 service + 新 turn-runner」并存期,UI 端要兼容
- **数据迁移**: workflow 删除是不可逆的(有备份但不保证格式),用户原工作流会丢
- **测试覆盖**: 重构期间测试要保持绿色,旧测试不能直接删,先标注 `legacy/`
- **LangGraph 移除**: 是大手术,plan 阶段的 planChecklist 拆出来用 LLM invoke 替代
- **sub-agent 资源**: 后台跑多个 agent 会消耗 token + 内存,要有上限(默认最多 3 个并发)

---

## 7. 下一步

**等你确认**:
1. 阶段 1 的 8 步 turn-runner + 5 状态机 + 4 sub-agent 工具 + 砍 workflow — 方向 OK 吗?
2. 阶段 1 时间 7-12 天 — 节奏 OK 吗?
3. 实施步骤 Step 1.1 → 1.5 顺序 OK 吗?

**确认后我会**:
1. 先做 Step 1.1(砍 workflow),独立 commit
2. 跑测试,确认绿
3. 进 Step 1.2(sub-agent),独立 commit
4. ...

每个 Step 完成后给你一个变更报告 + 验证截图(用 `npm run test` 输出)。
