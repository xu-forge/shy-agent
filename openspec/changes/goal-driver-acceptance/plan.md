# GoalDriver 可执行验收与完整结果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽出 GoalDriver：冻结用户原目标、步骤服务于它、可选可执行 check/总验收、收口 deliver 一份完整结果（报告类落盘），完成后硬停，启动时续被中断的 `running`。

**Architecture:** 纯函数（`checks.ts`、`goal-policy.ts`、`goal-resume.ts`）先用单测钉契约；`goal-driver.ts` 编排 冻结 goal → plan 步骤 → 工作图一段 → 跑 check → 回灌或 deliver；`graph.ts` 目标路径不再含 verify；`service.ts` 仅交互式走旧循环。开机只续一条最新 `running`。

**Tech Stack:** Electron main、LangGraph、vitest、better-sqlite3、现有 `shell_exec` 确认闸门、`getShyPaths().reportsDir`。

## Global Constraints

- 规格与任务以简体中文为主（专有名词可英文）
- 高危本机操作必须走现有 `waitConfirm`；用户拒绝 = 验收失败
- 交互式模式行为不变
- agent 不得改写用户钉死的 `verifyCommand`；不得改写冻结的 `goal`
- 验收默认超时 300_000ms；evidence 截断 8192 字符
- 历史会话迁移：`paused=1` → `runStatus=paused`，其余 → `idle`（不得把旧 checkpoint 当成 running）
- 测试：`npm test`（vitest run）；类型：`npm run typecheck`
- 实现计划与规格在 `openspec/changes/goal-driver-acceptance/`，不要写到 `docs/superpowers/`

## File map

| 文件 | 职责 |
|------|------|
| `src/shared/ipc.ts` | `RunStatus`、清单/会话/ChatRequest、`result` 事件 |
| `src/main/sessions/store.ts` | 新列、迁移、runtime patch |
| `src/main/sessions/title.ts` | 去掉 `<think>` |
| `src/main/agent/checks.ts` | 执行一条验收命令 |
| `src/main/agent/goal-policy.ts` | 冻结、开工、是否 deliver、回灌、停滞 |
| `src/main/agent/goal-resume.ts` | 选择自动续哪条会话 |
| `src/main/agent/goal-driver.ts` | 目标外循环 + deliver |
| `src/main/agent/graph.ts` | 目标模式只 act/tools |
| `src/main/agent/service.ts` | 按 mode 分流；错误不 append 成人话 |
| `src/main/index.ts` / `ipc.ts` | 启动续跑、verifyCommand 入参 |
| `src/renderer/src/components/ChatWorkspace.tsx` | 完整结果标记、总验收输入、completed 提示 |
| `src/renderer/src/components/SessionPanel.tsx` | chip「步骤」、check/evidence |
| `src/main/agent/*.test.ts` | 契约测试 |

---

### Task 1: 共享类型

**Files:**
- Modify: `src/shared/ipc.ts`
- Test: 无独立测试；store 测试会编译这些类型

**Interfaces:**
- Produces: 如下类型

- [ ] **Step 1: 改类型**

在 `src/shared/ipc.ts` 将相邻类型改为：

```ts
export type RunStatus = 'idle' | 'running' | 'paused' | 'completed' | 'cancelled'

export type ChatRequest = {
  sessionId: string
  message: string
  mode: AgentMode
  verifyCommand?: string
}

export type GoalChecklistItem = {
  id: string
  title: string
  done: boolean
  /** 可执行的 shell 验收命令；缺省则该步不单独判定 */
  check?: string
  evidence?: string
  lastExitCode?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
  kind?: 'result'
}

export type SessionSummary = {
  id: string
  title: string
  mode: AgentMode
  updatedAt: string
  createdAt: string
  paused: boolean
  goal?: string
  runStatus?: RunStatus
  verifyCommand?: string
}

export type SessionDetail = SessionSummary & {
  messages: ChatMessage[]
  checklist: GoalChecklistItem[]
  shortMemory: string
  approvedChecks?: string[]
  resultContent?: string
  resultReportPath?: string
}
```

`AgentEvent`（`service.ts`）增加 `{ type: 'result'; content: string; reportPath?: string }`。本任务若事件类型不在 ipc.ts，在 Task 5 与 Driver 一起加，但 ChatMessage.kind 必须本步就有。

- [ ] **Step 2: 编译共享类型**

Run: `npm run typecheck`  
Expected: store/renderer 可能报未使用新字段；不阻塞下一任务。

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
feat(goal): 验收、runStatus 与完整结果共享类型

EOF
)"
```

---

### Task 2: 会话表迁移与 runtime 字段

**Files:**
- Modify: `src/main/sessions/store.ts`
- Test: `src/main/sessions/store.test.ts`（新建；模式同 `src/main/schedule/store.test.ts`）

**Interfaces:**
- Consumes: `RunStatus`、`GoalChecklistItem`
- Produces: `updateSessionRuntime` 可写 `verifyCommand` / `runStatus` / `approvedChecks` / `resultContent` / `resultReportPath`；`listGoalSessionsByRunStatus`；`paused` 派生自 `runStatus === 'paused'`

- [ ] **Step 1: 写失败测试**

创建 `src/main/sessions/store.test.ts`（用 `SHY_HOME` 临时目录 + `vi.mock('electron')`，照现有 store 测试风格）：

- 新会话 `runStatus === 'idle'`、`paused === false`
- 插入 `paused=1` 旧行后 `ensureSessionTables()` → `runStatus=paused`
- 未暂停但有 checkpoint 的旧行 → `idle`（不得变成 running）
- `updateSessionRuntime` 可写 `resultContent` / `resultReportPath`

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/sessions/store.test.ts`  
Expected: FAIL

- [ ] **Step 3: 实现列、迁移、patch**

`ensureSessionTables` 之后 ALTER 增加（若不存在）：`run_status`（默认 idle）、`verify_command`、`approved_checks`（默认 `[]`）、`result_content`、`result_report_path`。若本次新加了 `run_status`，立刻 `UPDATE sessions SET run_status='paused' WHERE paused=1`。

`updateSessionRuntime` 扩展对应 patch；写 `paused` 时与 `runStatus` 同步。

```ts
export function listGoalSessionsByRunStatus(status: RunStatus): SessionSummary[]
```

`getSession` 解析 JSON 列并返回 result 字段。`appendMessage` 可选第四参 `kind?: 'result'` 写入（若表无 kind 列：用 content 前缀不稳，优先给 `session_messages` 加 `kind TEXT`）。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/sessions/store.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/sessions/store.ts src/main/sessions/store.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 会话 runStatus 与完整结果持久化

EOF
)"
```

---

### Task 3: 验收命令执行器

**Files:**
- Create: `src/main/agent/checks.ts`
- Test: `src/main/agent/checks.test.ts`

**Interfaces:**
- Produces: `runCheckCommand({ command, cwd?, timeoutMs?, waitConfirm, approved })` → `{ exitCode, stdout, stderr, denied, timedOut }`；超时 300_000；输出合计截断 8192

- [ ] **Step 1: 写失败测试**

注入 `exec`：`exitCode=0` 通过；非 0 失败；`waitConfirm` false → `denied: true` 且不 exec；已在 `approved` 里的命令不再 confirm。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/checks.test.ts`  
Expected: FAIL

- [ ] **Step 3: 最小实现**

与 `shell_exec` 同一 shell 策略（看现有 tools 实现，复用 spawn，不要新开一套权限模型）。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/checks.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/checks.ts src/main/agent/checks.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 可执行验收命令

EOF
)"
```

---

### Task 4: 纯策略函数

**Files:**
- Create: `src/main/agent/goal-policy.ts`、`src/main/agent/goal-resume.ts`
- Test: `src/main/agent/goal-policy.test.ts`、`src/main/agent/goal-resume.test.ts`

**Interfaces:**

```ts
freezeGoal(existing: string | null | undefined, userMessage: string): string
assertCanStart(input: { checklist: GoalChecklistItem[]; verifyCommand?: string }): { ok: true } | { ok: false; reason: string }
applyCheckResults(checklist, results: Array<{ id: string; exitCode: number; evidence: string; denied?: boolean }>): GoalChecklistItem[]
shouldDeliver(input: { checklist: GoalChecklistItem[]; hadWorkSegment: boolean }): boolean
buildFailureFeedback(failures: Array<{ title: string; exitCode: number; evidence: string }>): string
nextStagnantRounds(prev, passedBefore, passedAfter, overallPassed: boolean): number
selectAutoResume(sessions: Array<{ id: string; updatedAt: string }>): { resumeId: string | null; pauseIds: string[] }
stripThink(text: string): string
```

- [ ] **Step 1: 写失败测试**

`freezeGoal(null, '用户原话') === '用户原话'`；`freezeGoal('已冻结', 'plan改写') === '已冻结'`。

`assertCanStart`：空清单且无 verifyCommand → not ok；非空清单全无 check → ok。

`shouldDeliver`：所有带 check 的项 done（或没有任何带 check 的项且 `hadWorkSegment`）→ true；有带 check 项未 done → false。

`buildFailureFeedback` 含「不要修改验收命令本身」。

`nextStagnantRounds`：无新通过则 +1；有通过则 0。

`selectAutoResume`：两条则 resume 最新，pause 另一条。

`stripThink('<think>foo</think>标题')` 不含 `<think>`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.test.ts`  
Expected: FAIL

- [ ] **Step 3: 实现**

`assertCanStart`：**不要**要求每项都有 check。

`shouldDeliver`：过滤 `check?.trim()` 非空的项，全部 `done` 则为 true；若该集合为空，则 `hadWorkSegment === true` 为 true。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/goal-policy.ts src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.ts src/main/agent/goal-resume.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 冻结原目标与收口判定

EOF
)"
```

---

### Task 5: 工作图去掉目标 verify

**Files:**
- Modify: `src/main/agent/graph.ts`
- Test: `src/main/agent/graph-goal-route.test.ts`

**Interfaces:**
- Produces: `routeAfterActForGoal({ hasToolCalls, round, segmentSteps }): 'tools' | 'end_segment' | 'end_burst'`

- [ ] **Step 1: 写失败测试**

hasToolCalls → `'tools'`；否则 round>=segmentSteps → `'end_segment'`；否则 `'end_burst'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/graph-goal-route.test.ts`  
Expected: FAIL

- [ ] **Step 3: 改图**

goal：`act` 无 tool_calls → END（burst 结束给 Driver）；`end_segment` 时 `emit({ type: 'done', reason: 'segment' })`。删除 verify 节点与 `routeAfterVerify`。预算/停滞/`await_user` 从本图移除。`actNode` 不得写 `checklist[].done`。plan 节点可留作防御，但 Driver 有清单时 START→act，且 Driver 传入的 `goal` 不得被 plan 覆盖（目标路径建议直接不跑 plan）。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/graph-goal-route.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/graph.ts src/main/agent/graph-goal-route.test.ts
git commit -m "$(cat <<'EOF'
refactor(goal): 工作图不再判定目标完成

EOF
)"
```

---

### Task 6: GoalDriver 循环与 deliver

**Files:**
- Create: `src/main/agent/goal-driver.ts`
- Test: `src/main/agent/goal-driver.test.ts`
- Modify: `src/main/agent/service.ts`

**Interfaces:**

```ts
export async function runGoalDriver(args: {
  sessionId: string
  message: string
  verifyCommand?: string
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  resume?: boolean
  planSteps?: (goal: string) => Promise<GoalChecklistItem[]>
  runBurst?: (input: { goal: string; checklist: GoalChecklistItem[]; feedback?: string }) => Promise<{
    tokenUsed: number
    round: number
  }>
  runCheck?: typeof runCheckCommand
  deliver?: (input: { goal: string; checklist: GoalChecklistItem[] }) => Promise<{
    content: string
    isReport: boolean
  }>
}): Promise<void>
```

单测全部注入，不碰真 LLM。

- [ ] **Step 1: 写失败测试**

1. **冻结**：plan 试图返回别的 goal 字符串（若旧 API 返回 `{goal,checklist}`）——Driver 持久化的 goal 仍是 `message`。
2. **子项失败回灌**：check exit 1，第二次 burst 的 feedback 含失败输出与「不要修改验收命令」；`done===false`。用 AbortController 在第二次 burst 开头 abort。
3. **总验收失败**：子项 check 0，overall 1 → 不 emit `result`，不 completed。
4. **空清单无总验收**：不调用 `runBurst`。
5. **纯报告无 check**：plan 返回无 check 的项 → **会**调用 `runBurst`；burst 结束后 `deliver` 被调用；emit `result`；persist `completed`。
6. **同花顺回归**：burst 先产出普通 assistant 草稿（由 mock emit）；`shouldDeliver` 仍 false 时不得有 `type:'result'`；收口后恰好一条 `result`，之后 mock 再 emit assistant 也不应被 Driver 在 completed 后转发（completed 后 loop 结束）。
7. **错误不进对话**：burst throw 或 emit 的 error → persist 路径不 `appendMessage(..., 'assistant', 崩溃文案)`。可在 service 层测：见 Step 3。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/goal-driver.test.ts`  
Expected: FAIL

- [ ] **Step 3: 实现 Driver 并分流**

1. 读 session；`goal = freezeGoal(session.goal, message)` 并落盘。
2. `verifyCommand`：仅当现值为空时写入用户值。
3. 无清单则 `planSteps(goal)`（prompt：只输出步骤 JSON，check 必须是 shell 或省略，**不要输出 goal 字段**；若模型仍输出 goal 则丢弃）。
4. `assertCanStart`；失败 emit error，`idle`，return。
5. `runStatus=running`。
6. loop：abort → paused 或 cancelled；`runBurst`；对 `!done && check` 跑 `runCheckCommand`；`applyCheckResults`；若 `shouldDeliver`：若有 `verifyCommand` 先跑，失败则 feedback 继续；成功则 `deliver` → emit `{type:'result', content, reportPath}` → 若 isReport 写 `join(getShyPaths().reportsDir, `${sessionId}-${Date.now()}.md`)` → persist result 字段 → `completed` return。停滞达阈值 → `paused` return（**不 deliver**）。token 预算达阈值 → `paused`。
7. `resume: true`：先跑一轮验收，再决定 burst 或 deliver。

`service.ts`：`mode === 'goal'` 调 `runGoalDriver`。appendMessage：仅 user 输入、assistant 草稿、`result`。`error`/`status`/`notify` 不得当 assistant 写入 messages。删除目标模式对 graph verify 完成的依赖。

默认 `deliver`：一次 LLM 调用，系统提示「对照总目标与各步证据输出完整结果 JSON：`{ content, isReport }`。isReport 为新闻总结/周报/调研等文档型交付」。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/goal-driver.test.ts src/main/agent/goal-policy.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/goal-driver.ts src/main/agent/goal-driver.test.ts src/main/agent/service.ts
git commit -m "$(cat <<'EOF'
feat(goal): GoalDriver 外循环与完整结果交付

EOF
)"
```

---

### Task 7: 开机续跑

**Files:**
- Create: `src/main/agent/boot-resume.ts`
- Test: `src/main/agent/boot-resume.test.ts`
- Modify: `src/main/index.ts`、`src/main/ipc.ts`

**Interfaces:**
- Produces: `resumeInterruptedGoals({ resume, pause })` → `{ resumed, paused }`

- [ ] **Step 1: 写失败测试**

两条 running 只 resume 最新；空列表不 resume。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/boot-resume.test.ts`  
Expected: FAIL

- [ ] **Step 3: 实现并挂到启动**

必须在 `setMainWindow` 且窗口可 show 之后（确认框需要 window）。其余 running 改 `paused`。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/boot-resume.test.ts src/main/agent/goal-resume.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/boot-resume.ts src/main/agent/boot-resume.test.ts src/main/index.ts src/main/ipc.ts
git commit -m "$(cat <<'EOF'
feat(goal): 启动时自动续中断的目标会话

EOF
)"
```

---

### Task 8: UI、标题与 IPC

**Files:**
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`
- Modify: `src/renderer/src/components/SessionPanel.tsx`（任务 / 文件 / **产物** 三 tab）
- Modify: `src/main/sessions/title.ts`
- Test: `src/main/sessions/title.test.ts`
- Modify: `src/main/ipc.ts`、`src/main/agent/service.ts`、`src/preload/index.d.ts`（若需要）

**Interfaces:**
- Consumes: `ChatRequest.verifyCommand`、事件 `result`、`runStatus=completed`

- [ ] **Step 1: 标题清洗测试**

`stripThink` 或 `summarizeSessionTitle`：模型返回 `<think>用户想要...` 时标题不含该标签。优先用用户原话/`goal` 做 fallback。

Run: `npx vitest run src/main/sessions/title.test.ts`  
Expected: 先 FAIL 再实现 PASS。

- [ ] **Step 2: 完整结果 UI**

`onEvent`：`type==='result'` 渲染带「完整结果」标记的消息；若有 `reportPath` 显示入口。`completed` 后再发送：若 `runStatus==='completed'`，不要 `runAgent` 续清单，提示「目标已完成，请新开会话」。

- [ ] **Step 3: 步骤 chip、产物 tab 与总验收输入**

`SessionPanel`：第三个 tab「产物」。`getSession` 的 `resultContent` / `resultReportPath` 驱动空状态或正文；报告路径走现有 `revealSessionFile`。收到 `type==='result'`（本 session）时：若侧栏收起则展开，并 `setTab('outputs')`（需 ChatWorkspace 把 open 状态抬上来，或 panel 内部听事件后 `onOpen`）。任务 tab：`source==='goal'` 文案「步骤」。有 `check`/`evidence` 则展示。  
`ChatWorkspace`：goal 模式第二输入 `verifyCommand`。chat 带上该字段。

localStorage tab key 增加 `'outputs'`。文件 tab 行为不变。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatWorkspace.tsx src/renderer/src/components/SessionPanel.tsx src/main/sessions/title.ts src/main/sessions/title.test.ts src/main/ipc.ts src/main/agent/service.ts src/preload/index.d.ts
git commit -m "$(cat <<'EOF'
feat(goal): 完整结果标记、步骤清单与标题清洗

EOF
)"
```

---

### Task 9: 全量验收

**Files:** 本 change 下所有实现与测试

- [ ] **Step 1: 跑测试与类型**

Run: `npm test && npm run typecheck`  
Expected: 全部 PASS

- [ ] **Step 2: 对照 spec 走查**

`specs/goal-driver/spec.md`：原目标冻结、步骤非目标、完整结果唯一且最后并钉在产物 tab、报告落盘、completed 硬停、错误不进对话、check 失败回灌、总验收失败不交付、空清单无总验收拒绝、无 check 可开工、停滞先暂停、running 续上。缺测补对应 `*.test.ts`。

- [ ] **Step 3: Commit（若有补测）**

```bash
git add -u
git commit -m "$(cat <<'EOF'
test(goal): 补齐 GoalDriver 规格场景

EOF
)"
```

---

## 不做

- 后台 worker / 关窗口后继续跑
- 改交互式模式
- agent 改 `verifyCommand` 或冻结的 `goal`
- 把旧 checkpoint 会话当成 running 自动续
- 目标模式改成非聊天壳
