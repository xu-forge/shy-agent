# Retrospective: opencode-go-provider

> Written: 2026-09-03 (after verify PASS WITH WARNINGS)  
> Commit range: `b17bf56..5a1e427`  
> Worktree: `.worktrees/opencode-go-provider`

---

## 0. Evidence

- **Commit range**: `b17bf56..5a1e427` (9 feature commits + later verify/retro/archive commits)
- **Diff size**: +1592 / -147 across 30 files（实现峰值）
- **Tasks done**: 19/20（7.2 手测未勾）
- **Active hours**: ~1 会话 apply 周期
- **Subagent dispatches**: ~14（实现 1–6 + 评审 + 终审修复 + 复审）
- **New external dependencies**: none
- **Bugs encountered post-merge**: n/a（未合）
- **OpenSpec validate state**: `opencode-go-provider` valid；全库 `--all` 有无关历史失败
- **Test coverage signal**: typecheck OK；vitest 全绿；models 9/9 focused

Commit chain（实现主线）:

```
29c41ce docs(openspec): 提出 OpenCode Go provider 与会话模型选择
bb8f7c0 feat(llm): 增加 OpenCode Go provider 解析
44e1c36 feat(sessions): 会话可持久化 model 覆盖
bb9bacc refactor(llm): 统一会话 model 解析入口
f16d82b feat(llm): OpenCode Go 模型列表与回退
0ee2fd0 feat(ui): 设置页支持 OpenCode Go 预设
26ea403 feat(ui): 输入旁按会话选择 Go 模型
9fdc515 chore(openspec): 勾选 typecheck/test 验收项
5a1e427 fix(opencode-go): 修复评审 Important 1–4
```

---

## 1. Wins

- [evidence: `resolveLlmConfig` + 多入口改写] 单一 LLM 解析入口落地，Go baseURL 运行时强制
- [evidence: sessions.model + composer Select] 会话级模型与输入旁选择对齐用户口述
- [evidence: final-review → 5a1e427] 终审 Important（settingsEpoch、凭证守卫、baseURL 缓存、超时/net.fetch）一轮修完并复审 APPROVE
- [evidence: opencode-go-models tests] 远程失败/超时/非 Go 不 fetch 有单测

## 2. Misses

- 🟡 [painful | evidence: final-review Important #1] 设置与 ChatWorkspace 生命周期脱节，初版只挂载读 settings，差点漏验收
- 📌 [nit | evidence: tasks 7.2] 无 Electron UI e2e；Custom 只读依赖手测
- 📌 [nit | evidence: validate --all] 仓库内无关 change 规格损坏噪音

## 3. Plan deviations

| Plan task | What changed | Why |
|-----------|--------------|-----|
| 4.2 fetch | 改为 `httpFetchJson` + 仅缓存 remote | 终审要求超时与 electron.net.fetch |
| 6 / settings | 增加 `settingsEpoch` | 设置 overlay 不卸载 ChatWorkspace |
| 7.2 | 未勾选 | 需真人 Key；记录于 verify §7 |

## 4. Skill / workflow compliance

| Skill | Used |
|--------------------------------------------------|------|
| superpowers:brainstorming | ✓ |
| superpowers:writing-plans | ✓ |
| superpowers:using-git-worktrees | ✓ |
| superpowers:subagent-driven-development | ✓ |
| (transitive) TDD | ✓（Task 1–4） |
| (transitive) requesting-code-review | ✓ |
| superpowers:finishing-a-development-branch | 待本步 |

### Deliberately Skipped Skills

（无）

## 5. Surprises

- ChatWorkspace `key` 常驻导致 settings 变更不刷新，比「会话级 model」更隐蔽
- IPC 列表若不守卫 provider，会把 Custom vendor key 打到 Go 网关

## 6. Promote candidates → long-term learning

- [ ] 🟡 **设置 overlay 关闭必须广播 settings 刷新 epoch** → **Promote to** project AGENTS.md / 设置相关约定  
  > **Why**: Provider 类设置改完 UI 仍 stale，验收会假绿  
  > **How to apply**: 任何全局 settings 影响聊天 chrome 时，dialog close 递增 epoch 或发事件

- [ ] 🟡 **远程列表 IPC 必须校验已持久化 provider，禁止用错 vendor key 出站** → **Promote to** memory  
  > **Why**: 未保存 Go tab 曾用 Custom key 请求 opencode.ai  
  > **How to apply**: 新增第三方网关列表接口时，主进程按 provider 短路
