# Retrospective: active-file-context

> Written: 2026-08-29 (after verify passed with warnings)
> Commit range: `e140ff9..3c9b391`（verify/retro 提交另计）
> Worktree: `/Users/xuzhihao/Projects/my-agent/.worktrees/active-file-context`

---

## 0. Evidence

- **Commit range**: `e140ff9..3c9b391` (3 commits)
- **Diff size**: +714 / -28 lines across 30 files
- **Tasks done**: 8/9（`tasks.md` 3.3 未勾选）
- **Active hours**: ~1
- **Subagent dispatches**: 7（Task1 实现+审查，Task2 实现+审查，Task3 实现+审查，终审）
- **New external dependencies**: none
- **Bugs encountered post-merge**: none（尚未 merge）
- **OpenSpec validate state at archive**: 本 change valid；`--all` 3 个历史 change 失败（见 verify.md §1）
- **Test coverage signal**: vitest 656 passed / 13 skipped（Task 3 报告）

Commit chain:

```
e140ff9 feat(素材): 画布按目录分组，并支持右键管理与文档切换
2606223 feat(agent): 会话可携带当前查看文件提示
bd2c3cc feat(ui): 代码 tab 与素材 lightbox 上报正在看的文件
3c9b391 chore(openspec): 勾选 active-file-context 验收项
```

---

## 1. Wins

- 隐式路径、不污染用户消息：`appendMessage` 仍只存 composer 原文（`service.test.ts`）；`chatPayload` 无查看时省略键。
- 生产缺口一并补上：`graph.ts` 此前未把 `SystemReminderService` 传进 `runTurn`；本 change 接上后 `<active-file>` 才能真正进模型。
- 「正在看」与 UI 语义对齐：素材 `selected` 即 lightbox，无需第二套选中状态。
- 纯函数 `resolveActiveView` / `chatPayload` 让 renderer 契约可测，不必上 RTL。

## 2. Misses

- 🔴 无 blocking
- 🟡 [painful | evidence: graph.ts SR 接线] 规格写「注入 reminder」，但生产 graph 原先根本不跑 SR；若只加 provider 会 silently no-op。下个 reminder 类任务应先确认 `buildAgentGraph` 是否传入 `systemReminder`。
- 📌 [nit | evidence: providers.test.ts `toContain('code')`] 可被模板注释 `code | material` 误满足。
- 📌 [nit | evidence: tasks.md 3.3] Electron 手工未跑；模型是否遵守「无关忽略」无法单测。

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| Task 1 Step 3 | 额外把 `SystemReminderService(createDefaultRegistry())` 接入 `graph.ts` | 否则新 provider 在真实对话中不会触发 |
| Task 3 Step 3 | 未勾选 3.3 | worktree apply 无法驱动 Electron |

## 4. Skill / workflow compliance

| Skill                                            | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming                        | ✓ |
| superpowers:writing-plans                        | ✓（plan 已在 propose 阶段写好） |
| superpowers:using-git-worktrees                  | ✓（`.worktrees/active-file-context`） |
| superpowers:subagent-driven-development          | ✓ |
| (transitive) superpowers:test-driven-development | ✓（provider / activeView 先红后绿） |
| (transitive) superpowers:requesting-code-review  | ✓（每任务审查 + 终审） |
| superpowers:finishing-a-development-branch       | ✗（本 retro 写于 finishing 之前，见下） |

### Deliberately Skipped Skills

- **`superpowers:finishing-a-development-branch`**
  - **What was skipped**: 整个 skill（merge / PR / 保留分支菜单）尚未执行。
  - **Why this cycle**: schema 顺序是 verify → retrospective → archive → finishing。写本文件时 HEAD 仍为 `feat/active-file-context`，用户尚未选择集成方式。
  - **How to prevent recurrence**: `one-off — schema boundary case, no prevention possible` — finishing 按设计发生在 retro 落盘之后；下一 cycle 同样会在 retro 里把该行标 ✗，直到用户选完菜单。

## 5. Surprises

- `graph.ts` 的 v2 路径已能 `runTurn`，但 `deps.systemReminder` 一直是可选且未接线；identity/platform/memory 等 critical/optional reminder 在真实 interactive 对话里可能此前也未注入。本 change 打开了整份 default registry，而不只是 `<active-file>`。
- 素材画布点击直接 `onOpen` → lightbox，规格里「画布点选未打开不算」在当前 UI 几乎走不到。

## 6. Promote candidates → long-term learning

- [ ] 🟡 **加 system-reminder provider 前，先确认生产 graph 是否传入 `systemReminder`。** → **Promote to** AGENTS.md / 项目约定
  > **Why**: 本 cycle 发现 provider 注册中心与 `runTurn` 已存在，但 `buildAgentGraph` 未接线，功能会 silent fail。
  > **How to apply**: 任何「往 registry 加 reminder」的 change，第一步读 `graph.ts` `runTurn(` 的 deps。

- [ ] 📌 **renderer 上报用纯函数 + 回调，不要一上来上组件测试。** → **One-off**
  > **Why**: 本仓库 renderer 几乎没有 RTL；`activeView.ts` 8 个用例覆盖了发送契约。
  > **How to apply**: 仅当仓库已有组件测试基建时再测 React 树。
