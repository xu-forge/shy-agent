# Retrospective: goal-driver-acceptance

> Written: 2026-08-17 (after verify passed)
> Commit range: `01ebf6c..3dffdd6`
> Worktree: `/Users/xuzhihao/Projects/my-agent/.worktrees/feat-goal-driver-acceptance`

---

## 0. Evidence

> 量化前置數據 — 後續 Wins / Misses bullets 直接引用,避免每行重複 [evidence: ...]。

- **Commit range**: `01ebf6c..3dffdd6` (20 commits；相对 `feat/rebrand-shy-home`)
- **Diff size**: +3688 / −199 lines across 34 files（整段 GoalDriver 分支）；完成语义单提交 `3dffdd6` 为 +893 / −569 across 20 files
- **Tasks done**: 27/27 (`grep -cE '^\s*- \[x\]' tasks.md` → 27)
- **Active hours**: ~4–6h（含口头设计收敛 + 改完成语义实现；不含更早 GoalDriver 铺垫提交的日历时间）
- **Subagent dispatches**: 0（本 cycle 在同一会话内改同一组文件）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（尚未 merge）
- **OpenSpec validate state at archive**: 本 change `valid: true`；`validate --all` 12 items 中 2 个既有 change 失败（见 verify.md §1）
- **Test coverage signal**: vitest 118 passed / 13 skipped；`npm run typecheck` 通过

Commit chain (時序):

```
01ebf6c feat/rebrand-shy-home（merge-base）
bef1705 feat(goal): 验收命令与 runStatus 共享类型
cc836f8 feat(goal): 会话 runStatus 与验收字段落盘
933c12d fix(goal): 限定会话状态迁移回填时机
0ef92e5 feat(goal): 运行时可执行验收命令
b61f5a4 fix(goal): 识别 exec 信号超时
04d9f6c feat(goal): 验收判定与开机续跑选择
67064c7 fix(goal): isGoalComplete 拒绝 denied/timedOut 的 overall 通过
4ae3b36 refactor(goal): 工作图不再判定目标完成
64e9955 fix(goal): 强制执行清单与分段边界
d48e0ef feat(goal): GoalDriver 外循环与失败回灌
7e36274 fix(goal): 修复 GoalDriver 生命周期状态收口
d545235 feat(goal): 启动时自动续中断的目标会话
d844d68 feat(goal): 总验收命令输入与清单证据展示
89c8b85 fix(ui): 隔离会话验收命令状态
58e69cd test(goal): 补齐 GoalDriver 规格场景
74a3e73 docs(openspec): 纳入 goal-driver-acceptance 变更文档
8eb5f8d fix(goal): 目标工作图不再进入 plan
5a42f75 fix(goal): 交互式 START 保持直达 act
82031a5 fix(goal): 收口暂停门闩与验收确认
3dffdd6 feat(goal): 冻结原目标并在收口交付完整结果
```

---

## 1. Wins

- 口头 brainstorm 收敛后再改 artifacts，没有写进 `docs/superpowers/specs/`（verify §6 无泄漏）。
- 完成对象从「勾完清单」改成「冻结原话 + deliver」：`freezeGoal` 与 `shouldDeliver` 可单测，`goal-driver.test.ts` 覆盖同花顺回归点（草稿非 result、plan 不能改写 goal、纯报告可开工）。
- 复用现有 `SessionPanel` 加产物 tab，没有整页三栏重做（D9 / spec「右侧产物栏」）。
- 隔离 worktree `feat/goal-driver-acceptance` 已存在时没有再 `git worktree add` 同名分支。
- 交互式路径保持直达 act（`5a42f75` + `graph-goal-route.test.ts`）。

## 2. Misses

- 🔴 （无 blocking）
- 🟡 [painful | evidence: 会话 `9388e328` 是产品证据，本轮只有 vitest] 未在 Electron 里再跑一条真机目标会话确认产物 tab 自动展开。自动化覆盖了 Driver 事件与 persist，未覆盖 renderer 点击路径。
- 🟡 [painful | evidence: verify §1] `openspec validate --all` 被两个历史 change 拖红（`finalize-agent-product`、`goal-mode-runtime-budget` 无 delta）。本 change 合法，但预检脚本把仓库级失败当成阻塞噪声。
- 📌 [nit | evidence: verify 预检 `merge-base origin/main` 得到 0] 仓库没有 `main`/`origin/main`，verify 提交计数预检会误报「apply 尚未产生 commit」。
- 📌 [nit | evidence: HEAD 干净前曾有未提交 `package-lock.json`] 实现时故意不纳入 lockfile，verify 前需手动 checkout 才能宣称 worktree 干净。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 第一稿「每项必须有 check 否则拒绝开工」 | 改为仅「空清单且无 verifyCommand」才拒（D4 / tasks 3.2） | 同花顺式报告任务无法开工 |
| 「只加 deliver 节点」备选 | 并进现有 GoalDriver，改完成语义（D13） | 可执行验收与 verify 勾清单会打架 |
| WorkBuddy 整页三栏 | 现有侧栏加「产物」tab（D16 / tasks 6.4） | 超出本 change；用户确认挂现有 SessionPanel |
| 停滞达阈值自动交残稿 | 只 `paused`，用户继续后再 deliver（D15 / tasks 3.5） | 避免把半成品当交付 |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ |
| superpowers:writing-plans                        | ✓ |
| superpowers:using-git-worktrees                  | ✓ |
| superpowers:subagent-driven-development          | ✗ |
| (transitive) superpowers:test-driven-development | ✓ |
| (transitive) superpowers:requesting-code-review  | ✗ |
| superpowers:finishing-a-development-branch       | ✗（schema 顺序：retro 在 finishing 之前；archive 后立即呈现选项） |

> **Default expectation**: 全部 ✓。每個 skill 都是 schema 設計的一部分,
> 跳過屬於異常情境。任一項 ✗ 都必須在下方
> `### Deliberately Skipped Skills` subsection 提出原因與預防方案。

### Deliberately Skipped Skills

- **`superpowers:subagent-driven-development`**
  - **What was skipped**: 未按独立 task 派发子代理实现；`3dffdd6` 在同一会话改 `goal-policy` / `goal-driver` / `SessionPanel` / store。
  - **Why this cycle**: HEAD 在 `82031a5` 已有可运行 GoalDriver；剩余是同一完成语义横切（冻结 goal + deliver + UI tab），文件互相 import，并行子代理会争用同一批路径。
  - **How to prevent recurrence**: `scope-judgment rule` — 若 apply 是「已有 Driver 上改生命周期」而非「互不依赖的新模块」，允许单会话顺序实现；仅当 tasks.md 出现可独立 PR 的模块边界时才强制 subagent-driven。

- **`(transitive) superpowers:requesting-code-review`**
  - **What was skipped**: 未另开 review 会话 / 未跑 requesting-code-review 清单。
  - **Why this cycle**: 用户在 `3dffdd6` 落地且 `npm test` 118 passed 之后直接说「继续」，触发的是 verify → retro → archive，不是 review。
  - **How to prevent recurrence**: `scope-judgment rule` — 用户明确「继续」opsx 后半段时，把 code-review 记为可选；若后续选 PR，再在 finishing 选项 2 里补 review。

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: 写 retro 时尚未呈现四选一（merge / PR / keep / discard）。
  - **Why this cycle**: schema 要求 `retrospective` 在 archive 之前完成；finishing 在 archive 之后。写本文件时 finishing 尚未到点。
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible` — retro 时间戳早于 finishing 是 graph 顺序，不是漏用；archive 完成后立即呈现四选项。

## 5. Surprises

- 用户说「完成后还能接着聊」时，第一反应是「完成后禁止对话」；实际问题是清单被当成多个目标、完整结果夹在过程中间、空档被当成新 user 消息。纠正后才定 D8–D11。
- 仓库没有 `openspec/specs/`，delta 无法挂 MODIFIED，只能 ADDED 新 capability `goal-driver`。archive 必须顺带创建主库 spec，否则能力会随 change 目录一起消失。
- verify 预检依赖 `origin/main`，本仓库默认对照分支是 `feat/rebrand-shy-home`，提交计数会得到 0。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **目标模式的完成对象是用户原话，checklist 只是步骤** → **Promote to** 项目 `AGENTS.md` / product-brief 一句
  > **Why**: 会话 `9388e328` 把 7 条步骤标成「目标」，完整总结出现在 15:44 却因未勾项继续 act。
  > **How to apply**: 改目标模式完成条件、侧栏文案、或 plan prompt 时，先问「这是步骤还是最终目标」。

- [ ] 🟡 **`openspec validate --all` 失败项若属于其他 change，不阻塞当前 change 的 archive** → **Promote to** schema / verify instruction 脚注
  > **Why**: 本轮 `finalize-agent-product` 与 `goal-mode-runtime-budget` 无 delta，拖红仓库级 validate。
  > **How to apply**: verify §1 同时记录「本 change 单独 validate」与「仓库级 validate」；只有本 change invalid 才 FAIL。

- [ ] 📌 **无 `main` 时用实际对照分支算 commit 证据** → **One-off**
  > **Why**: 本仓库 verify 预检 `merge-base origin/main` 得到 0。
  > **How to apply**: 个人 Electron 仓库在长生命周期 feature 分支上开发时，commit 范围写相对 `feat/rebrand-shy-home`（或当前默认集成分支）。
