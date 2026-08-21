# shy 重构进度报告(2026-08-21 晚)

> **总目标**: 4 阶段全栈重构 — Agent 编排 / Prompt 设计 / 事件流 / UI 界面
> **完成度**: Stage 1 (80%) + Stage 2 (60%) — 两个 Stage 都有未集成的"准备态"模块
> **测试**: 255 passed | 13 skipped (268) 零失败
> **类型检查**: 通过

---

## 1. 已交付模块(共 6 步 / 7 个新模块 / 40+ 新文件 / 30+ 改文件)

### Stage 1: Agent 编排(80%)

| Step | 内容 | 状态 |
|---|---|---|
| 1.1 砍 workflow | 删 12 文件 + 改 20+ + migration 备份 | ✅ |
| 1.2 sub-agent 派活 | 4 工具 + 3 type + 并发 3 + SQLite 落盘 | ✅ |
| 1.3 5 状态机 | 8 个 apply* 纯函数 + 3 surface + 25 状态对全覆盖 | ✅ |
| 1.4 8 步 turn-runner | runTurn(input, deps) + 每步 emit step:start/end | ✅ |
| **1.5 集成** | 删 LangGraph + service.ts 切到新模块 | ⏳ **未做(大手术)** |

### Stage 2: Prompt 设计(60%)

| Step | 内容 | 状态 |
|---|---|---|
| 2.1 system-reminder | 4 类 provider(identity/platform/progress/memory) + cooldown + critical + allowlist | ✅ |
| 2.2 tool description 8 段式 | 8 个 builtin 工具扩到 4-6 段 | ✅ |
| **2.3 接 turn-runner** | step 3 buildContext 调 SystemReminderService | ⏳ **未做** |

### Stage 3 / 4

| Stage | 状态 |
|---|---|
| Stage 3 事件流(event-bridge 1-to-N) | ⏳ 0% |
| Stage 4 UI 重构(minimax 布局) | ⏳ 0% |

---

## 2. 关键问题 — 所有"准备"未集成

shy 的**实际 agent loop 还是 LangGraph 旧实现**(graph.ts + service.ts:while-true 段循环)。我做的所有新模块都是**独立测通的"准备态"**:

```
[已就绪但未集成]            [实际跑的]
goal/state.ts  ──────╮
                       ├──>  service.ts (528 行)  ──>  graph.ts (381 行)
goal/service.ts ──────╯           │  LangGraph 黑盒
                                  ▼
turn-runner/ ───────────────────  (实际跑)
8 步生命周期                       ▲
                                  │
prompts/system-reminder/ ─────────┘
4 类 provider
```

**含义**:用户跑 shy 时,**不会**用到新 turn-runner / 5 状态机 / system-reminder。LangGraph 还在跑。

---

## 3. 集成是什么(1-2 天大手术)

| 改动 | 文件 | 风险 |
|---|---|---|
| service.ts:295-434 (段循环 ~140 行) → 调 runTurn() | service.ts | 中 |
| goal-driver.ts:182-403 (状态转换 ~220 行) → 调 goal/state.ts | goal-driver.ts | 中 |
| graph.ts 整个删 | graph.ts | 低(全删) |
| turn-runner step 3 接 system-reminder | turn-runner/index.ts | 低 |
| 删 @langchain/langgraph 依赖 | package.json | 低 |

**验证**:
- [ ] typecheck + test
- [ ] 手工跑:交互式 / 目标 / 段式续跑 / 5 状态 / 4 个 task 工具
- [ ] 行为对比:跟 LangGraph 旧版**完全一致**

---

## 4. 完成度 vs minimax(13 维度)

| 维度 | shy 现在 | minimax | 状态 |
|---|---|---|---|
| 8 步 turn-runner | ✅ 独立 | ✅ mavis-06 | 模块完成,未集成 |
| 5 状态机 | ✅ 纯函数 | ✅ mavis-07 | 模块完成,未集成 |
| Sub-agent 派活 | ✅ 4 工具 | ✅ mavis-09 | ✅ 已集成(工具已注册,业务未用) |
| 工具白名单 | ✅ ALLOWLIST | ✅ mavis-12 | ✅ 已集成 |
| Blocked audit 阈值 | ✅ 默认 3 | ✅ mavis-07 | ✅ 已实现(在 goal-driver) |
| 8 段式 tool desc | ✅ 8 工具 | ✅ mavis-09 | ✅ 已集成 |
| System-reminder 4 类 | ✅ 独立 | ✅ mavis-09 | 模块完成,未集成 |
| Cooldown 6h/15min | ✅ memory 6h | ✅ mavis-09 §3.4 | 局部 |
| Tool description 8 段式 | ✅ | ✅ mavis-09 | ✅ 已集成 |
| Context 4 档压缩 | ❌ 关键词正则 | ✅ mavis-08 | Stage 2 剩余 |
| Event bridge 1-to-N | ❌ callback emit | ✅ mavis-13 | Stage 3 待做 |
| UI minimax 布局 | ❌ 旧 layout | ✅ mavis-04 | Stage 4 待做 |
| 3 surface 不对称 | ✅ 纯函数 | ✅ mavis-07 | 模块完成,未集成 |

**当前状态**:约 70% minimax 能力已"模块化",但**用户跑 shy 时只用到 35%**。

---

## 5. 接下来怎么走 — 3 条主路径

### 路径 A: 先集成(1-2 天)
- 把已就绪的 4 个模块切到 service.ts
- **shy 真正"切到 minimax 风格骨架"**
- 后续 Stage 2 剩余 + Stage 3/4 都在新骨架上做
- 风险:中(改核心循环)
- **推荐** — 不集成,前面工作都是"准备"状态

### 路径 B: 跳过集成,直接 Stage 3 事件流
- 新建 event-bridge 1-to-N 翻译层 + 单一 event schema
- 跟之前 Stage 1.2/2.1 一样,**新增独立模块**,不动 service.ts
- 1-2 天
- 优点:零风险
- 缺点:Stage 1/2 的模块还是未集成状态,继续堆积

### 路径 C: 跳过集成,直接 Stage 4 UI
- 5-8 天大工作
- 基于现有 8 个 builtin + 4 个 task tool 重做界面
- **风险最大**,但用户原话"界面显示有问题"
- UI 改完用户立即能看到变化
- 缺点:Stage 1/2/3 继续是"未集成"状态

---

## 6. 我的建议

**走路径 A**。理由:
1. 前面 6 步工作如果不集成 = 浪费(只是"准备好"但用户感受不到)
2. 集成之后,Stage 2 剩余 / Stage 3 / Stage 4 都在新骨架上做,避免反复返工
3. minimax 学习价值最大化:能直接对比新旧行为
4. 风险中,1-2 天可回滚(有 git 历史)

**Stage 4 UI 重构(路径 C 的核心)可以在集成之后再做**,因为:
- 集成后 UI 看到的 event / state 跟 minimax 一致
- 改 UI 时 event schema 已经稳定,不需要回头改 Stage 3
- UI 改完用户能立即用

---

## 7. 4 个选项

| 选项 | 风险 | 时间 | 推荐度 |
|---|---|---|---|
| A 集成(Step 1.5 + Stage 2.3) | 中 | 1-2 天 | ⭐⭐⭐ |
| B Stage 3 事件流 | 低 | 1-2 天 | ⭐⭐ |
| C Stage 4 UI 重构 | 中-高 | 5-8 天 | ⭐ |
| D 暂停 review | 0 | 0 | (现在做的) |

**等你回复 A / B / C / D 后,我再开始。**
