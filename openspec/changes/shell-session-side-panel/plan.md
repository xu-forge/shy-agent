# shell-session-side-panel Implementation Plan

**Goal:** 升级 MemoryView / SkillsView；引入会话右侧可折叠面板（任务 + 文件 tab）；后端文件追踪 + Agent 动态任务事件。

**Architecture:**
- main：`memory/db.ts` 新增 `session_files` / `session_tasks` 表 + CRUD；`computer.ts` 埋点；`graph.ts` / `service.ts` emit `task` 事件；`ipc.ts` 注册新端点
- preload：暴露新方法到 `window.myAgent`
- renderer：`MemoryView` / `SkillsView` 重做；`SessionPanel` 新增；`App.tsx` 接线；`ChatWorkspace` 移除 `goal-panel`
- shared：`ipc.ts` 新增类型与 channel

**Tech Stack:** TypeScript / React 19 / better-sqlite3 / Electron IPC；测试用 vitest。

---

## 阶段一：后端能力（先于 UI 落地）

按 `tasks.md` §1 → §2 → §3 → §4 顺序实现。

1. **§1 数据层**：先建表与 helper，单元测试覆盖。
2. **§2 computer.ts 埋点**：所有成功路径加一行 `recordFileOp`；单元测试覆盖成功/失败。
3. **§3 LangGraph 任务事件**：plan 节点改 emit `task` 事件；DB 写入；测试 graph 序列。
4. **§4 IPC 与 preload**：先注册 main 端 handler，再暴露 preload；端到端测试可省略（手动 smoke）。

每一步必须 TDD：先写测试，再写实现，commit。

## 阶段二：Renderer UI

按 `tasks.md` §5 → §6 → §7 顺序实现。

1. **§5 MemoryView**：组件内状态机 + drawer + 搜索/过滤 + 视觉。
2. **§6 SkillsView**：复用 MemoryView 风格；frontmatter 预览；保存校验。
3. **§7 SessionPanel**：先静态 UI（含 mock 数据）→ 接真实 IPC → 状态持久化。

Renderer 单测用 vitest + @testing-library/react 风格（项目未引入则手写最小断言）。

## 阶段三：清理与验证

`tasks.md` §8 → §9。

---

## TDD 提示

- DB 增删查：先写测试断言 schema/索引/CRUD；再写实现。
- computer 埋点：mock 工具返回值，验证 `recordFileOp` 被调用与未调用。
- graph 事件：snapshot emit 序列；DB 状态断言。
- Renderer 组件：先写 snapshot 测试（结构）+ 交互测试（fire event → 回调 + state）。

## 风险与回退

- 任务覆盖策略与 Agent 语义不符 → 在 §7.4 增加「被 Agent 覆盖」角标前先讨论。
- 侧栏 drawer 编辑模式体验不佳 → 改回顶部表单。
- 文件表无界增长 → UI 分页（首批 50）已计划；DB 不裁剪。
