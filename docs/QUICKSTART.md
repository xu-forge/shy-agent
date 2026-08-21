# shy 重构 — 上手指南

> 给你 5 分钟跑起来 + 看效果,顺便能 review 已交付的 8 步。

---

## 1. 5 步跑起来

```bash
# 1. 装依赖(已有 node_modules 可跳)
cd ~/Projects/my-agent
npm install

# 2. 类型检查(应 0 错误)
npm run typecheck

# 3. 跑测试(应 257 passed | 13 skipped)
npm run test

# 4. 启动开发模式(打开 shy 桌面 app)
npm run dev
```

启动后:
- 左侧 sidebar 5 个导航:对话 / 长期记忆 / 技能 / 日历 / 设置
- **右侧 Inspector 面板(新)** — 3 tabs 实时显示当前 session 状态
- 中间主对话区(还是旧布局,Stage 4.2+ 才动)

---

## 2. 3 个新东西立即能看

### 2.1 右侧 Inspector 面板

- 切到「对话」视图
- 3 tabs:**任务 / 记忆 / 技能**
- 当前 session 的 session_tasks / 长期记忆 / 技能包,5 秒自动刷新

### 2.2 8 段式 tool description

跟 LLM 互动,问"如何删除一个文件",对比改前改后:
- 改前 LLM:"用 fs_delete"
- 改后 LLM:会收到改写提示("**必须弹确认框**"、"不可恢复"等),可能更谨慎

### 2.3 4 个 sub-agent 派活工具(task/task_output/task_query/task_stop)

LLM 在合适场景会自动调 `task` 派 sub-agent 调研。例:
> "调研 A 股最近一周成交额前 10"

LLM 会调 `task(subagent_type='explore', prompt='...')` 派活。

---

## 3. review 路径(按风险从低到高)

### 3.1 看 UI 改动
- `src/renderer/src/components/InspectorPanel.tsx` (6.9KB) — 3 tabs + 自动 poll
- `src/renderer/src/styles/app.css` 末尾 190 行 — inspector 样式
- `src/renderer/src/App.tsx` 175-180 行 — `<InspectorPanel sessionId={sessionId} />` 集成

### 3.2 看 prompt 改动
- `src/main/agent/tools/builtin.ts` 8 个工具的 description 全部 8 段式
- 重点看 `shell_exec` / `fs_write` / `fs_delete` / `memory_upsert` 的 4-6 段描述

### 3.3 看新模块(独立但未集成到生产)
- `src/main/agent/turn-runner/` — 8 步生命周期(可读 index.ts)
- `src/main/agent/goal/` — 5 状态机 + 8 apply* 纯函数
- `src/main/agent/prompts/system-reminder/` — 4 类 provider

### 3.4 看架构决策
- `docs/refactor-spec.md` — 4 阶段总 spec(用户问的 4 步 questionnaire 答复 → spec)
- `docs/stage-1-agent-orchestration-summary.md` — Stage 1 总结
- `docs/refactor-status-2026-08-21.md` — 中间状态
- `docs/refactor-final-status-2026-08-21.md` — 最终状态(本文档的"大表兄")

---

## 4. 已知局限(诚实记录)

- **shy 实际 agent loop 仍是 LangGraph 旧实现** — 8 步 turn-runner / 5 状态机 / system-reminder 测通但**未集成**到 service.ts
- 跑 shy 时只用到 35% minimax 能力(4 task 工具 + 8 段式 tool desc + Inspector UI)
- Stage 3 事件流未做(0%)
- Stage 4.2+ 完整 UI 重构未做(只 Inspector)

集成需要 1-2 天大手术(改 service.ts 528 行 + goal-driver.ts 675 行 + 删 LangGraph),需要你明确同意。

---

## 5. 下一步选项(等你决定)

| # | 选项 | 时间 |
|---|---|---|
| 1 | 集成(Step 1.5 + Stage 2.3)— 改 service.ts 切到新骨架 | 1-2 天 |
| 2 | Stage 4.2 主对话区重构 | 1-2 天 |
| 3 | Stage 3 事件流 | 1-2 天 |
| 4 | 完整 Stage 4 UI 重构 | 5-8 天 |
| 5 | 暂停 review,先消化已交付 | 0 |

**默认推荐**:选项 5 → 1 → 2。
