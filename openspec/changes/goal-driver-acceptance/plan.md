# GoalDriver 可执行验收 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 shy 目标模式中抽出 GoalDriver：用可执行 check/总验收判定完成，失败回灌下一段，并在应用启动时自动续被中断的 `running` 会话。

**Architecture:** 纯函数模块（`checks.ts`、`goal-policy.ts`、`goal-resume.ts`）先用单测钉死契约；`goal-driver.ts` 编排 plan → 工作图一段 → 跑验收 → 回灌；`graph.ts` 目标路径不再含 verify；`service.ts` 仅交互式走旧循环。开机扫描只续一条最新 `running`。

**Tech Stack:** Electron main、LangGraph、vitest、better-sqlite3、现有 `shell_exec` 确认闸门。

## Global Constraints

- 规格与任务以简体中文为主（专有名词可英文）
- 高危本机操作必须走现有 `waitConfirm`；用户拒绝 = 验收失败
- 交互式模式行为不变
- agent 不得改写用户钉死的 `verifyCommand`
- 验收默认超时 300_000ms；evidence 截断 8192 字符
- 历史会话迁移：`paused=1` → `runStatus=paused`，其余 → `idle`（不得把旧 checkpoint 当成 running）
- 测试：`npm test`（vitest run）；类型：`npm run typecheck`
- 实现计划与规格在 `openspec/changes/goal-driver-acceptance/`，不要写到 `docs/superpowers/`

## File map

| 文件 | 职责 |
|------|------|
| `src/shared/ipc.ts` | `RunStatus`、清单/会话/ChatRequest 字段 |
| `src/main/sessions/store.ts` | 新列、迁移、runtime patch |
| `src/main/agent/checks.ts` | 执行一条验收命令 |
| `src/main/agent/goal-policy.ts` | 开工条件、完成判定、回灌文本、停滞 |
| `src/main/agent/goal-resume.ts` | 选择自动续哪条会话 |
| `src/main/agent/goal-driver.ts` | 目标外循环 |
| `src/main/agent/graph.ts` | 目标模式只 act/tools |
| `src/main/agent/service.ts` | 按 mode 分流 |
| `src/main/index.ts` / `ipc.ts` | 启动续跑、verifyCommand 入参 |
| `src/renderer/src/components/ChatWorkspace.tsx` | 总验收输入 |
| `src/main/agent/*.test.ts` | 契约测试 |

---

### Task 1: 共享类型

**Files:**
- Modify: `src/shared/ipc.ts`
- Test: 无独立测试；下一任务的 store 测试会编译这些类型

**Interfaces:**
- Produces: `RunStatus`；`GoalChecklistItem.lastExitCode?`；`ChatRequest.verifyCommand?`；`SessionSummary.runStatus?` / `verifyCommand?`；`SessionDetail.approvedChecks`

- [ ] **Step 1: 改类型**

在 `src/shared/ipc.ts` 将 `GoalChecklistItem` 与相邻类型改为：

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
  /** 可执行的 shell 验收命令 */
  check?: string
  evidence?: string
  lastExitCode?: number
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
}
```

删掉 `check` 字段上「本轮仅透传」的注释。

- [ ] **Step 2: 编译共享类型**

Run: `npm run typecheck`
Expected: 会在 store/renderer 处报错（尚未读新字段）或通过但未使用新字段。若仅 unused 警告可继续；若 `ChatRequest` 解构处无需改则下一步补 store。

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc.ts
git commit -m "$(cat <<'EOF'
feat(goal): 验收命令与 runStatus 共享类型

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
- Produces: `updateSessionRuntime` 可写 `verifyCommand` / `runStatus` / `approvedChecks`；`listGoalSessionsByRunStatus(status: RunStatus)`；`rowToSummary` 派生 `paused` 自 `runStatus === 'paused'`

- [ ] **Step 1: 写失败测试**

创建 `src/main/sessions/store.test.ts`：

```ts
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.env.SHY_HOME ?? tmpdir() }
}))

let tmpDir = ''

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shy-session-store-'))
  process.env.SHY_HOME = tmpDir
  vi.resetModules()
})

afterEach(() => {
  delete process.env.SHY_HOME
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('sessions runStatus', () => {
  it('新会话默认为 idle，paused 为 false', async () => {
    const store = await import('./store')
    const s = store.createSession('goal', 't')
    const d = store.getSession(s.id)
    expect(d?.runStatus).toBe('idle')
    expect(d?.paused).toBe(false)
  })

  it('paused=1 的旧行迁移为 runStatus=paused', async () => {
    const { getDb } = await import('../memory/db')
    const store = await import('./store')
    store.ensureSessionTables()
    const db = getDb()
    db.exec(`
      INSERT INTO sessions (id, title, mode, goal, checklist, short_memory, paused, created_at, updated_at)
      VALUES ('old-p', 'old', 'goal', 'g', '[]', '', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `)
    store.ensureSessionTables()
    const d = store.getSession('old-p')
    expect(d?.runStatus).toBe('paused')
    expect(d?.paused).toBe(true)
  })

  it('未暂停的旧行迁移为 idle，即使有 checkpoint', async () => {
    const { getDb } = await import('../memory/db')
    const store = await import('./store')
    store.ensureSessionTables()
    const db = getDb()
    db.exec(`
      INSERT INTO sessions (id, title, mode, goal, checklist, short_memory, paused, checkpoint, created_at, updated_at)
      VALUES ('old-c', 'old', 'goal', 'g', '[]', '', 0, '{"round":1}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `)
    store.ensureSessionTables()
    const d = store.getSession('old-c')
    expect(d?.runStatus).toBe('idle')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/sessions/store.test.ts`
Expected: FAIL（`runStatus` undefined 或列不存在）

- [ ] **Step 3: 实现列、迁移、patch**

在 `ensureSessionTables` 建表后增加迁移：若无 `run_status` 列则 `ALTER TABLE sessions ADD COLUMN run_status TEXT NOT NULL DEFAULT 'idle'`，同样添加 `verify_command TEXT`、`approved_checks TEXT NOT NULL DEFAULT '[]'`。然后：

```sql
UPDATE sessions SET run_status = 'paused' WHERE paused = 1 AND (run_status = 'idle' OR run_status IS NULL OR run_status = '');
```

只在「本列刚加上、尚未被新代码写入 running」时跑一次即可：用 `PRAGMA table_info` 检测新列是否刚添加。更稳妥：若 `run_status` 列是本次 ALTER 新增的，立刻执行 `UPDATE ... paused=1 → paused`，其余保持 default idle。

扩展 `updateSessionRuntime` patch：`verifyCommand?: string | null`、`runStatus?: RunStatus`、`approvedChecks?: string[]`。写 `paused` 时同步：`runStatus==='paused'` 则 `paused=1`，若只传 `paused: true` 则 `run_status='paused'`，若只传 `paused: false` 且当前为 paused 则回到 `running`（恢复路径会再写 running）。

`rowToSummary`：`runStatus` 从列读取；`paused: runStatus === 'paused'`。

增加：

```ts
export function listGoalSessionsByRunStatus(status: RunStatus): SessionSummary[] {
  ensureSessionTables()
  const rows = getDb()
    .prepare(`SELECT * FROM sessions WHERE mode='goal' AND run_status=? ORDER BY updated_at DESC`)
    .all(status) as Record<string, unknown>[]
  return rows.map(rowToSummary)
}
```

`getSession` 解析 `approved_checks` JSON。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/sessions/store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/sessions/store.ts src/main/sessions/store.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 会话 runStatus 与验收字段落盘

EOF
)"
```

---

### Task 3: 验收命令执行器

**Files:**
- Create: `src/main/agent/checks.ts`
- Test: `src/main/agent/checks.test.ts`

**Interfaces:**
- Consumes: `waitConfirm` 形状 `(action: string, detail: string) => Promise<boolean>`
- Produces:

```ts
export const CHECK_TIMEOUT_MS = 300_000
export const EVIDENCE_MAX_CHARS = 8192

export type CheckRunResult = {
  command: string
  exitCode: number
  output: string
  timedOut: boolean
  denied: boolean
}

export async function runCheckCommand(opts: {
  command: string
  approved: ReadonlySet<string>
  pinned: boolean
  confirm: (action: string, detail: string) => Promise<boolean>
  execImpl?: (command: string, timeoutMs: number) => Promise<{ stdout: string; stderr: string; exitCode: number }>
}): Promise<{ result: CheckRunResult; approved: Set<string> }>
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from 'vitest'
import { EVIDENCE_MAX_CHARS, runCheckCommand } from './checks'

describe('runCheckCommand', () => {
  it('退出码非 0 为失败并截断 output', async () => {
    const long = 'x'.repeat(EVIDENCE_MAX_CHARS + 50)
    const { result } = await runCheckCommand({
      command: 'npm test',
      approved: new Set(),
      pinned: true,
      confirm: async () => true,
      execImpl: async () => ({ stdout: long, stderr: 'boom', exitCode: 1 })
    })
    expect(result.exitCode).toBe(1)
    expect(result.denied).toBe(false)
    expect(result.output.length).toBeLessThanOrEqual(EVIDENCE_MAX_CHARS)
    expect(result.output).toContain('boom')
  })

  it('用户拒绝确认为失败且不加入 approved', async () => {
    const { result, approved } = await runCheckCommand({
      command: 'rm -rf /',
      approved: new Set(),
      pinned: false,
      confirm: async () => false,
      execImpl: async () => {
        throw new Error('should not exec')
      }
    })
    expect(result.denied).toBe(true)
    expect(result.exitCode).not.toBe(0)
    expect(approved.has('rm -rf /')).toBe(false)
  })

  it('已批准的命令不再询问', async () => {
    const confirm = vi.fn(async () => true)
    await runCheckCommand({
      command: 'npm test',
      approved: new Set(['npm test']),
      pinned: false,
      confirm,
      execImpl: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })
    })
    expect(confirm).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/checks.test.ts`
Expected: FAIL Cannot find module './checks'

- [ ] **Step 3: 实现 `checks.ts`**

逻辑：若 `command` 不在 `approved`：调用 `confirm('执行验收命令', command)`；false 则返回 `denied: true, exitCode: -1, output: '用户拒绝验收命令'`。true 则加入 approved。然后 `execImpl` 或默认 `exec`（timeout `CHECK_TIMEOUT_MS`，shell 与 `builtin.ts` 相同）。把 stdout+stderr 拼起来截断到 `EVIDENCE_MAX_CHARS`。超时：`timedOut: true, exitCode: -2`。默认 `execImpl` 用 `promisify(exec)`，catch 时读 `error.code` / `status`。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/checks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/checks.ts src/main/agent/checks.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 运行时可执行验收命令

EOF
)"
```

---

### Task 4: 开工 / 完成 / 回灌 / 续跑选择（纯函数）

**Files:**
- Create: `src/main/agent/goal-policy.ts`
- Create: `src/main/agent/goal-resume.ts`
- Test: `src/main/agent/goal-policy.test.ts`、`src/main/agent/goal-resume.test.ts`

**Interfaces:**
- Consumes: `GoalChecklistItem`、`CheckRunResult`、`RunStatus`
- Produces:

```ts
export function assertCanStart(input: {
  verifyCommand?: string
  checklist: GoalChecklistItem[]
}): { ok: true } | { ok: false; reason: string }

export function applyCheckResults(
  checklist: GoalChecklistItem[],
  byId: Record<string, CheckRunResult>
): GoalChecklistItem[]

export function isGoalComplete(input: {
  checklist: GoalChecklistItem[]
  verifyCommand?: string
  overall?: CheckRunResult
}): boolean

export function buildFailureFeedback(
  failures: Array<{ title: string; exitCode: number; evidence: string }>
): string

export function nextStagnantRounds(input: {
  prev: number
  passedBefore: number
  passedAfter: number
  overallPassed: boolean
}): number

export function selectAutoResume(
  sessions: Array<{ id: string; updatedAt: string }>
): { resumeId: string | null; pauseIds: string[] }
```

- [ ] **Step 1: 写失败测试（policy）**

`goal-policy.test.ts` 必须包含：

1. 无 `verifyCommand` 且清单无任何 check → `assertCanStart.ok === false`
2. 清单有一项缺 check → 拒绝开工
3. 清单为空但有 `verifyCommand` → 允许开工
4. `applyCheckResults`：exitCode 1 → `done: false` 且写入 evidence
5. `isGoalComplete`：子项全绿但 overall exit 1 → false
6. 清单为空 + overall 0 → true
7. `buildFailureFeedback` 含 title、exit code、evidence，并含「不要修改验收命令」
8. `nextStagnantRounds`：passed 未增加且 overall 未过 → prev+1（即使调用方声明有工具活动——函数本身不看工具，Driver 仍要传入「验收无进展」）

- [ ] **Step 2: 写失败测试（resume）**

```ts
it('只续 updatedAt 最新的一条，其余进 pauseIds', () => {
  const r = selectAutoResume([
    { id: 'a', updatedAt: '2026-08-01T00:00:00.000Z' },
    { id: 'b', updatedAt: '2026-08-02T00:00:00.000Z' }
  ])
  expect(r.resumeId).toBe('b')
  expect(r.pauseIds).toEqual(['a'])
})

it('空列表不续', () => {
  expect(selectAutoResume([]).resumeId).toBeNull()
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.test.ts`
Expected: FAIL missing modules

- [ ] **Step 4: 实现两文件**

`assertCanStart`：trim 后的 `verifyCommand` 非空视为有总验收。清单为空且无总验收 → 失败「需要补验收命令」。清单非空时每一项 `check?.trim()` 必须非空，否则「清单项缺少 check」。

`applyCheckResults`：按 id 合并，`done = result.exitCode === 0 && !result.denied && !result.timedOut`。

`isGoalComplete`：清单为空则要求 `verifyCommand` 存在且 `overall?.exitCode === 0`；否则每一项 `done` 且（若有 verifyCommand）overall 通过。

`buildFailureFeedback` 固定前缀：`验收未通过。请根据下面的命令输出修改，不要修改验收命令本身。`

`nextStagnantRounds`：若 `passedAfter > passedBefore || overallPassed` 返回 0，否则 `prev+1`。

`selectAutoResume`：按 `updatedAt` 字符串降序，第一条 resume，其余 pauseIds。

- [ ] **Step 5: 再跑测试**

Run: `npx vitest run src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/goal-policy.ts src/main/agent/goal-policy.test.ts src/main/agent/goal-resume.ts src/main/agent/goal-resume.test.ts
git commit -m "$(cat <<'EOF'
feat(goal): 验收判定与开机续跑选择

EOF
)"
```

---

### Task 5: 工作图去掉目标 verify

**Files:**
- Modify: `src/main/agent/graph.ts`
- Test: `src/main/agent/graph-goal-route.test.ts`

**Interfaces:**
- Consumes: 现有 `buildAgentGraph`
- Produces: 目标模式 `act` 无 tool_calls 时 END（让 Driver 去验收）；`round >= segmentSteps` 时 END 并 `emit({ type: 'done', reason: 'segment' })`；不再进入 `verify` 节点；不再根据 checklist.every(done) 结束；START 在已有 checklist 时直接 act，无 checklist 时仍可 plan（Driver 会先 plan，图侧保留 plan 仅作交互式/防御）

- [ ] **Step 1: 写失败测试**

用最小 fake：不跑真 LLM。若 `buildAgentGraph` 难以单测路由，则抽出：

```ts
export function routeAfterActForGoal(input: {
  hasToolCalls: boolean
  round: number
  segmentSteps: number
}): 'tools' | 'end_segment' | 'end_burst'
```

测试：

- hasToolCalls true → `'tools'`
- hasToolCalls false → `'end_burst'`
- round >= segmentSteps → `'end_segment'`（优先于 tools？**规格：达到段上限应结束本段**。若本步已有 tool_calls，仍先 tools 再在下一 round 结束。因此 segment 检查放在 act 结束后、已无 tool_calls 时，或 round 在进入 act 前已达上限则 END。）

钉死：`routeAfterActForGoal`：若 `hasToolCalls` → tools；否则若 `segmentSteps>0 && round>=segmentSteps` → end_segment；否则 end_burst。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/graph-goal-route.test.ts`
Expected: FAIL

- [ ] **Step 3: 抽出路由并改图**

`routeAfterAct`：interactive 保持「有 tool → tools 否则 END」。goal 调用 `routeAfterActForGoal`，end_* 都 `return END`，end_segment 时 `emit({ type: 'done', reason: 'segment' })`。

删除 goal 路径上对 `verify` 的边。可保留 `verifyNode` 函数暂时不用，或删除以免误用——**删除** verify 节点注册与 `routeAfterVerify`。预算/停滞从本图移除（改由 Driver）。`await_user` 节点若仅服务于停滞/预算，一并删除。

`actNode` 不得把模型内容写进 `checklist[].done`。

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

### Task 6: GoalDriver 循环

**Files:**
- Create: `src/main/agent/goal-driver.ts`
- Test: `src/main/agent/goal-driver.test.ts`
- Modify: `src/main/agent/service.ts`

**Interfaces:**
- Consumes: `assertCanStart`、`runCheckCommand`、`applyCheckResults`、`isGoalComplete`、`buildFailureFeedback`、`nextStagnantRounds`、`buildAgentGraph`、`updateSessionRuntime`
- Produces: `runGoalDriver(args)`；目标模式 `runAgent` 转调它

Driver 伪代码（实现须与此一致）：

```ts
export async function runGoalDriver(args: {
  sessionId: string
  message: string
  verifyCommand?: string
  emit: (event: AgentEvent) => void
  waitConfirm: (action: string, detail: string) => Promise<boolean>
  resume?: boolean
  planChecklist?: (goal: string) => Promise<{ goal: string; checklist: GoalChecklistItem[] }>
  runBurst?: (input: { goal: string; checklist: GoalChecklistItem[]; feedback?: string }) => Promise<{
    tokenUsed: number
    round: number
  }>
  runCheck?: typeof runCheckCommand
}): Promise<void>
```

单测用注入的 `planChecklist` / `runBurst` / `runCheck`，不碰 LLM。

- [ ] **Step 1: 写失败测试**

`goal-driver.test.ts`：

1. **子项失败回灌**：plan 给出 `{ id:'1', title:'t', check:'false' }`；burst 空操作；runCheck 返回 exit 1 output `FAILTXT`。断言第二次 burst 收到的 `feedback` 包含 `FAILTXT` 与「不要修改验收命令」；checklist[0].done === false。循环用 `maxBursts` 测试钩子或在第二次 burst throw 结束。

2. **总验收失败**：子项 check 0，overall 1 → 不 completed。

3. **无检查拒绝开工**：plan 返回无 check 的项且无 verifyCommand → `runBurst` 不被调用；emit error。

给 Driver 加测试用 `shouldContinue?: () => boolean` 或 burst 计数上限参数 `maxBurstsForTest`：**不要**把测试钩子留在生产 API。改为：`runCheck` 第一次失败，`runBurst` 第二次调用时 `throw new Error('stop-test')`，Driver 将未捕获的测试异常视为 error 结束即可。更好：`runBurst` mock 第二次 resolve 后 Driver 因失败回灌再进循环，用 `let n=0; if (++n>=2) return` 并让 Driver 在 `maxSegments` 仅测试注入……规格无 maxSegments。

用 AbortController：第二次 burst 开头 `controller.abort()`。

Driver 必须在每段开始检查 abort / paused。

4. 完成路径：check 0 且无 overall → `runStatus` 回调 `completed`（通过 `persist` 注入记录最后一次 patch）。

注入 `persist: (patch) => void` 以便断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/goal-driver.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 Driver 并分流 service**

`runGoalDriver` 步骤：

1. 读 session；合并 `verifyCommand`（只在空时写入用户值，已有则忽略模型/后续请求篡改——**仅当现值为空才 set**）。
2. 若无清单：调用 plan（默认实现搬原 `planNode` 的 prompt，但要求 check 为**可执行命令**：「check 必须是可在本机运行的 shell 命令，不要写描述性句子」）。
3. `assertCanStart`；失败则 emit error，`runStatus=idle`，return。
4. `runStatus=running`。
5. loop：abort 则 break（paused 则 `paused`，否则若 cancel `cancelled`）；`runBurst`；对 `!done && check` 的项 `runCheckCommand`；`applyCheckResults`；若子项全 done 且有 verifyCommand 再跑 overall；`isGoalComplete` 则 `completed` return；否则 `stagnantRounds = nextStagnantRounds(...)`，达阈值则 `paused` return；token 预算达阈值则 `paused` return；`buildFailureFeedback` 作为下一段 feedback；落盘。
6. 续跑（`resume: true` 且已有清单）：**先跑一轮验收**再决定 burst。

`service.ts`：`mode === 'goal'` 调用 `runGoalDriver`，interactive 保持现有 while 循环。删除目标模式里对 graph verify 完成的依赖。

- [ ] **Step 4: 再跑测试**

Run: `npx vitest run src/main/agent/goal-driver.test.ts src/main/agent/goal-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/goal-driver.ts src/main/agent/goal-driver.test.ts src/main/agent/service.ts
git commit -m "$(cat <<'EOF'
feat(goal): GoalDriver 外循环与失败回灌

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
- Consumes: `listGoalSessionsByRunStatus('running')`、`selectAutoResume`、`resumeAgent`
- Produces: `export function resumeInterruptedGoals(opts: { resume: (sessionId: string) => void; pause: (sessionId: string) => void }): { resumed: string | null; paused: string[] }`

- [ ] **Step 1: 写失败测试**

`boot-resume.test.ts` 注入 session 列表而非 sqlite：把 `resumeInterruptedGoals` 写成对数组纯应用 `selectAutoResume` 然后回调。断言两条 running 只 resume 最新，pause 另一条。空列表不调用 resume。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/agent/boot-resume.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现并挂到启动**

`registerCoreIpc()` 末尾不要在无 window 时 resume（确认框需要 window）。在 `createWindow` 且 `ready-to-show` 之后调用：

```ts
const running = listGoalSessionsByRunStatus('running')
const { resumeId, pauseIds } = selectAutoResume(running.map(s => ({ id: s.id, updatedAt: s.updatedAt })))
for (const id of pauseIds) {
  updateSessionRuntime(id, { runStatus: 'paused', paused: true })
}
if (resumeId) resumeAgent(resumeId, emitToRendererBound, waitConfirm)
```

`waitConfirm` 依赖 `mainWindow`：必须在 `setMainWindow` 之后。把这段放进 `src/main/ipc.ts` 的 `export function resumeInterruptedGoalSessions(): void`，由 `index.ts` 在 `setMainWindow` + show 后调用。

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

### Task 8: UI 与 IPC 入参

**Files:**
- Modify: `src/main/ipc.ts`（agentChat 把 `req.verifyCommand` 传入 `runAgent`/`runGoalDriver`）
- Modify: `src/main/agent/service.ts` RunArgs 增加 `verifyCommand?: string`
- Modify: `src/renderer/src/components/ChatWorkspace.tsx`
- Modify: `src/renderer/src/components/SessionPanel.tsx`（展示 check / evidence）
- Modify: `src/preload/index.d.ts`（若 ChatRequest 已改则自动覆盖）

**Interfaces:**
- Consumes: `ChatRequest.verifyCommand`
- Produces: 目标模式发送时带上用户输入的总验收命令

- [ ] **Step 1: 目标输入区增加总验收字段**

`ChatWorkspace` 增加 `verifyCommand` state；仅 `mode==='goal'` 显示第二个输入（placeholder：`总验收命令，例如 npm test`）。`window.shy.chat({ sessionId, message: text, mode, verifyCommand: verifyCommand.trim() || undefined })`。

- [ ] **Step 2: ipc 传入 Driver**

`IPC.agentChat` handler：`void runAgent({ ..., verifyCommand: req.verifyCommand })`。

- [ ] **Step 3: SessionPanel 展示**

清单项若有 `check`，显示命令；若有 `evidence` 且未 done，显示截断证据。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/ChatWorkspace.tsx src/renderer/src/components/SessionPanel.tsx src/main/ipc.ts src/main/agent/service.ts src/preload/index.d.ts
git commit -m "$(cat <<'EOF'
feat(goal): 总验收命令输入与清单证据展示

EOF
)"
```

---

### Task 9: 全量验收

**Files:** 本 change 下所有实现与测试

- [ ] **Step 1: 跑测试与类型**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS

- [ ] **Step 2: 对照 spec 场景**

手工核对 `specs/goal-driver/spec.md`：工作图不能自证；子项失败不完成；总验收失败不结束；钉死命令不可改；无检查拒绝开工；缺 check 拒绝开工；仅总验收可完成；失败回灌；拒绝确认=失败；空转停滞；running 续上；paused 不续；多 running 只续一条。缺测补在对应 `*.test.ts`。

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
- agent 改 `verifyCommand`
- 把旧 checkpoint 会话当成 running 自动续
